/**
 * The DB-backed scheduler (doc 07 §8, doc 10 §1.2). One scheduler instance holds the lock at
 * a time (doc 05/10 reuse `job_queue` for the lock row — see `acquireOrRenewSchedulerLock`'s
 * doc comment in `packages/db`); a second instance simply never gets past `tick()`'s first
 * step. `tick()` is the whole unit of work and takes `nowMs` explicitly, so every scheduling
 * decision — cadence, retry backoff, visibility timeout — is deterministically testable with
 * a fake clock, with no real timers in the test suite. `startLoop()`/`shutdown()` are the thin
 * real-timer wrapper `apps/worker` uses; they are not unit-tested with real waiting.
 */
import { configRepo, jobsRepo, newId } from '@buybox/db';
import type { AppDatabase } from '@buybox/db';
import { isKillSwitchEngaged, SYSTEM_PAUSE_SETTING_KEY } from '@buybox/shared';
import type { MarketplaceAdapterRegistry } from './adapter-registry.js';
import type { Clock } from './clock.js';
import { isJobEnabled } from './job-catalog.js';
import { isLicensed } from './license-gate.js';
import { DEFAULT_MAX_ATTEMPTS, DEFAULT_VISIBILITY_TIMEOUT_MS, type JobDefinition } from './job.js';
import { JobRunner } from './runner.js';
import type { BrandCatalogueSourceRegistry } from './brand-catalogue-source-registry.js';
import type { CompetitorSourceRegistry } from './competitor-source-registry.js';
import type { ProductDetailSourceRegistry } from './product-detail-source-registry.js';
import type { SellerIdentitySourceRegistry } from './seller-identity-source-registry.js';

export interface SchedulerOptions {
  readonly appDb: AppDatabase;
  readonly clock: Clock;
  readonly adapters: MarketplaceAdapterRegistry;
  /** Reporting-only competitor sources (doc 07 §7). Omit to run with scraping unconfigured. */
  readonly competitorSources?: CompetitorSourceRegistry;
  /** Reporting-only brand catalogue sources (api-references §1.7). Omit to run with no brand sweep configured. */
  readonly brandCatalogueSources?: BrandCatalogueSourceRegistry;
  /** Reporting-only seller-identity sources (doc 06 §12.4 Faz 7). Omit to run with none configured. */
  readonly sellerIdentitySources?: SellerIdentitySourceRegistry;
  /** Product-detail sources for the barcode backfill (Faz 8). */
  readonly productDetailSources?: ProductDetailSourceRegistry;
  readonly instanceId: string;
  readonly lockTtlMs?: number;
  /** How many ready jobs this instance claims and runs per `tick()`. */
  readonly maxClaimsPerTick?: number;
  /** Called when a `startLoop()` tick rejects. Without it the failure would be invisible. */
  readonly onTickError?: (error: unknown) => void;
}

export interface TickResult {
  readonly heldLock: boolean;
  /** True when this tick did nothing because the system pause (`SYSTEM_PAUSE_SETTING_KEY`) is
   *  engaged — distinct from not holding the lock, so callers/tests can tell the two apart. */
  readonly paused: boolean;
  /** True when this tick did nothing because the install is unlicensed or lapsed (doc 13 §6).
   *  Reported separately from `paused` so an operator is told to renew, not to un-pause. */
  readonly unlicensed: boolean;
  readonly enqueued: readonly string[];
  readonly ran: readonly { jobName: string; ok: boolean }[];
}

/**
 * doc 06 §2: the actual "stop everything" switch, genuinely separate from the narrower global
 * price-submission switch in `submit-price-changes.ts` (see that file's doc comment for why
 * they used to be — wrongly — the same setting). While engaged, no job of any kind is enqueued
 * by cadence or claimed for running, including imports, buybox observation and decision-making,
 * not just price submission. Fail-closed, like the price switch: absent or unrecognised means
 * paused, so a fresh install starts with nothing running until an operator explicitly resumes it.
 */
export async function isSystemPaused(appDb: AppDatabase): Promise<boolean> {
  const setting = await configRepo.getAppSetting(appDb, SYSTEM_PAUSE_SETTING_KEY);
  return isKillSwitchEngaged(setting?.value);
}

/** Re-exported for the existing public API (`@buybox/jobs`) — moved to `job-catalog.ts` so
 *  `runner.ts` can use it too without a `scheduler.ts` ⇄ `runner.ts` import cycle. */
export { isJobEnabled } from './job-catalog.js';

/**
 * What the last `tick()` did, for anything that needs to know the scheduler is alive — today
 * `/api/health` and the Jobs screen.
 *
 * This exists because a worker that starts, ticks forever and does nothing looked exactly like
 * a worker that never started at all: no rows written, no errors logged, nothing on any screen.
 * Diagnosing one real occurrence (2026-08-24) took two hours of reading the SQLite file by hand.
 * `outcome` is the reason the tick stopped where it did, so "nothing is running" can be
 * answered with *why* rather than a shrug.
 */
export interface SchedulerTickReport {
  readonly atMs: number;
  readonly outcome: 'ran' | 'no-lock' | 'paused' | 'unlicensed';
  readonly ranCount: number;
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
  private lastTick: SchedulerTickReport | undefined;
  private readonly onTickError: ((error: unknown) => void) | undefined;

  constructor(options: SchedulerOptions) {
    this.appDb = options.appDb;
    this.clock = options.clock;
    this.instanceId = options.instanceId;
    this.lockTtlMs = options.lockTtlMs ?? 30_000;
    this.maxClaimsPerTick = options.maxClaimsPerTick ?? 5;
    this.onTickError = options.onTickError;
    this.runner = new JobRunner(
      this.appDb,
      this.clock,
      options.adapters,
      this.definitions,
      options.competitorSources,
      options.brandCatalogueSources,
      options.sellerIdentitySources,
      options.productDetailSources,
    );
  }

  register(def: JobDefinition): void {
    this.definitions.set(def.jobName, def);
  }

  /**
   * True when no job this scheduler started is still running.
   *
   * Exists so `apps/worker` can swap the adapter and competitor-source registries
   * (`setRegistries`) at a moment when no handler is holding the outgoing ones — the competitor
   * sources own a Playwright browser, and closing it under a running scrape would fail that
   * scrape rather than the reload.
   */
  isIdle(): boolean {
    return this.inFlight.size === 0;
  }

  /**
   * Rebuilds what handlers are given when marketplace configuration changes, without a restart.
   * See `JobRunner.setRegistries` for why this must be possible at all. Only call while
   * `isIdle()`.
   */
  setRegistries(
    adapters: MarketplaceAdapterRegistry,
    competitorSources?: CompetitorSourceRegistry,
    brandCatalogueSources?: BrandCatalogueSourceRegistry,
    sellerIdentitySources?: SellerIdentitySourceRegistry,
    productDetailSources?: ProductDetailSourceRegistry,
  ): void {
    this.runner.setRegistries(
      adapters,
      competitorSources,
      brandCatalogueSources,
      sellerIdentitySources,
      productDetailSources,
    );
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
      this.lastTick = { atMs: nowMs, outcome: 'no-lock', ranCount: 0 };
      return { heldLock: false, paused: false, unlicensed: false, enqueued: [], ran: [] };
    }

    // The real "stop everything" switch (doc 06 §2) — checked before anything is enqueued or
    // claimed, so a paused system enqueues no new cadence-due jobs and runs nothing already
    // queued, of any kind. Deliberately separate from `SubmitPriceChanges`'s own, narrower
    // switch (see that job's doc comment): this one stops imports and observation too.
    if (await isSystemPaused(this.appDb)) {
      this.lastTick = { atMs: nowMs, outcome: 'paused', ranCount: 0 };
      return { heldLock: true, paused: true, unlicensed: false, enqueued: [], ran: [] };
    }

    // doc 13 §4.2/§6: an unlicensed or lapsed install behaves exactly as though the pause above
    // were engaged — nothing enqueued, nothing claimed. Evaluated per tick rather than once at
    // boot, so pasting a renewal restores the system within one interval and without a restart
    // (R-LIC-5). The process deliberately stays up and keeps ticking; it must not crash-loop.
    if (!(await isLicensed(this.appDb, nowMs))) {
      this.lastTick = { atMs: nowMs, outcome: 'unlicensed', ranCount: 0 };
      return { heldLock: true, paused: false, unlicensed: true, enqueued: [], ran: [] };
    }

    const enqueued: string[] = [];
    for (const def of this.definitions.values()) {
      if (def.cadenceMs === undefined) continue;
      if (!(await isJobEnabled(this.appDb, def.jobName))) continue; // doc 12 6.9: operator disabled it
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

    this.lastTick = { atMs: nowMs, outcome: 'ran', ranCount: ran.length };
    return { heldLock: true, paused: false, unlicensed: false, enqueued, ran };
  }

  /** The last completed `tick()`, or `undefined` if none has finished yet. */
  get lastTickReport(): SchedulerTickReport | undefined {
    return this.lastTick;
  }

  /**
   * Real-timer loop for `apps/worker`. Not exercised by unit tests (see file doc comment).
   *
   * The rejection handler is not decoration. `void this.tick()` on its own makes any failure an
   * unhandled rejection, which Node terminates the process for — taking the web server down
   * with it in single-process mode, over what may be one transient database error. A tick that
   * fails is logged and the next one is attempted.
   */
  startLoop(intervalMs = 2000): void {
    this.loopHandle = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        this.onTickError?.(error);
      });
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
