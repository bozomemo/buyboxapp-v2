/**
 * The DB-backed scheduler (doc 07 §8, doc 10 §1.2). One scheduler instance holds the lock at
 * a time (doc 05/10 reuse `job_queue` for the lock row — see `acquireOrRenewSchedulerLock`'s
 * doc comment in `packages/db`); a second instance simply never gets past `tick()`'s first
 * step. `tick()` is the whole unit of work and takes `nowMs` explicitly, so every scheduling
 * decision — cadence, retry backoff, visibility timeout — is deterministically testable with
 * a fake clock, with no real timers in the test suite. `startLoop()`/`shutdown()` are the thin
 * real-timer wrapper `apps/worker` uses; they are not unit-tested with real waiting.
 */
import { jobsRepo, newId } from '@buybox/db';
import type { AppDatabase } from '@buybox/db';
import type { MarketplaceAdapterRegistry } from './adapter-registry.js';
import type { Clock } from './clock.js';
import { DEFAULT_MAX_ATTEMPTS, DEFAULT_VISIBILITY_TIMEOUT_MS, type JobDefinition } from './job.js';
import { JobRunner } from './runner.js';

export interface SchedulerOptions {
  readonly appDb: AppDatabase;
  readonly clock: Clock;
  readonly adapters: MarketplaceAdapterRegistry;
  readonly instanceId: string;
  readonly lockTtlMs?: number;
  /** How many ready jobs this instance claims and runs per `tick()`. */
  readonly maxClaimsPerTick?: number;
}

export interface TickResult {
  readonly heldLock: boolean;
  readonly enqueued: readonly string[];
  readonly ran: readonly { jobName: string; ok: boolean }[];
}

export class Scheduler {
  private readonly appDb: AppDatabase;
  private readonly clock: Clock;
  private readonly instanceId: string;
  private readonly lockTtlMs: number;
  private readonly maxClaimsPerTick: number;
  private readonly definitions = new Map<string, JobDefinition>();
  private readonly runner: JobRunner;
  private readonly inFlight = new Set<Promise<unknown>>();
  private loopHandle: ReturnType<typeof setInterval> | undefined;
  private holdsLock = false;

  constructor(options: SchedulerOptions) {
    this.appDb = options.appDb;
    this.clock = options.clock;
    this.instanceId = options.instanceId;
    this.lockTtlMs = options.lockTtlMs ?? 30_000;
    this.maxClaimsPerTick = options.maxClaimsPerTick ?? 5;
    this.runner = new JobRunner(this.appDb, this.clock, options.adapters, this.definitions);
  }

  register(def: JobDefinition): void {
    this.definitions.set(def.jobName, def);
  }

  /** For an on-demand run (e.g. a UI "run now" button) — enqueues regardless of cadence. */
  async enqueueNow(jobName: string, payload: string, priority = 0): Promise<string> {
    const def = this.definitions.get(jobName);
    const nowMs = this.clock.nowMs();
    const id = newId();
    await jobsRepo.enqueueJob(this.appDb, {
      id,
      jobName,
      payload,
      priority,
      state: 'ready',
      runAfter: nowMs,
      lockedBy: null,
      lockedUntil: null,
      attempts: 0,
      maxAttempts: def?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      lastError: null,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return id;
  }

  /**
   * One scheduling cycle: try to hold the lock; if held, enqueue any cadence-due jobs that
   * aren't already pending, requeue expired visibility-timeout locks, then claim and run up
   * to `maxClaimsPerTick` ready jobs of the registered names.
   */
  async tick(): Promise<TickResult> {
    const nowMs = this.clock.nowMs();
    const heldLock = await jobsRepo.acquireOrRenewSchedulerLock(
      this.appDb,
      this.instanceId,
      nowMs,
      this.lockTtlMs,
    );
    this.holdsLock = heldLock;
    if (!heldLock) {
      return { heldLock: false, enqueued: [], ran: [] };
    }

    const enqueued: string[] = [];
    for (const def of this.definitions.values()) {
      if (def.cadenceMs === undefined) continue;
      const active = await jobsRepo.countActiveJobs(this.appDb, def.jobName);
      if (active > 0) continue; // still pending or running — doc 07 §8: one run at a time
      await this.enqueueNow(def.jobName, '{}');
      enqueued.push(def.jobName);
    }

    await jobsRepo.requeueExpiredJobs(this.appDb, nowMs);

    const ran: { jobName: string; ok: boolean }[] = [];
    const jobNames = [...this.definitions.keys()];
    // claimNextJob takes one visibility timeout per call, before it's known which job will be
    // claimed — use the longest configured timeout among registered jobs so none is under-covered.
    const visibilityTimeoutMs = Math.max(
      DEFAULT_VISIBILITY_TIMEOUT_MS,
      ...[...this.definitions.values()].map((d) => d.visibilityTimeoutMs ?? 0),
    );
    for (let i = 0; i < this.maxClaimsPerTick; i += 1) {
      const claimed = await jobsRepo.claimNextJob(this.appDb, {
        jobNames,
        workerId: this.instanceId,
        nowMs: this.clock.nowMs(),
        visibilityTimeoutMs,
      });
      if (!claimed) break;
      const result = this.runner.runClaimed(claimed);
      this.inFlight.add(result);
      const settled = result.then((r) => {
        this.inFlight.delete(result);
        ran.push({ jobName: claimed.jobName, ok: !r.error });
      });
      await settled; // sequential within a tick — concurrency comes from calling tick() itself concurrently
    }

    return { heldLock: true, enqueued, ran };
  }

  /** Real-timer loop for `apps/worker`. Not exercised by unit tests (see file doc comment). */
  startLoop(intervalMs = 2000): void {
    this.loopHandle = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  /** doc 07 §8 graceful shutdown: stop claiming, let in-flight work finish, release the lock. */
  async shutdown(drainTimeoutMs = 30_000): Promise<void> {
    if (this.loopHandle) {
      clearInterval(this.loopHandle);
      this.loopHandle = undefined;
    }
    const drain = Promise.allSettled([...this.inFlight]);
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, drainTimeoutMs));
    await Promise.race([drain, timeout]);
    if (this.holdsLock) {
      await jobsRepo.releaseSchedulerLock(this.appDb, this.instanceId, this.clock.nowMs());
      this.holdsLock = false;
    }
  }
}
