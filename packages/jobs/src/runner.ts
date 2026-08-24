/**
 * Executes one already-claimed `job_queue` row: runs its handler, writes the `job_runs`
 * audit row (doc 07 §1: "every run writes a job_runs row"), and applies bounded retry with
 * backoff on failure (doc 07 §8, R-JOB-2, R-JOB-9).
 */
import { eventsRepo, jobsRepo, newId } from '@buybox/db';
import type { AppDatabase } from '@buybox/db';
import { computeBackoffMs } from '@buybox/adapters';
import type { MarketplaceAdapterRegistry } from './adapter-registry.js';
import type { CompetitorSourceRegistry } from './competitor-source-registry.js';
import type { Clock } from './clock.js';
import { isJobEnabled } from './job-catalog.js';
import {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_VISIBILITY_TIMEOUT_MS,
  zeroResult,
  type JobDefinition,
  type JobProgress,
  type JobResult,
} from './job.js';

const RETRY_BACKOFF = { baseMs: 5_000, factor: 2, maxDelayMs: 5 * 60_000 };

/**
 * How often a handler's `reportProgress` calls are actually flushed to `job_runs`.
 *
 * `ScrapeCompetitors` reports once per listing and may walk `SCRAPE_MAX_LISTINGS_PER_RUN`
 * of them, so an unthrottled write would add one `UPDATE` per page fetch to a job whose whole
 * design goal is to stay light. One second is well under the UI's own poll interval, so the
 * operator still sees every item on a slow scrape and loses nothing on a fast one.
 */
const PROGRESS_THROTTLE_MS = 1_000;

export class JobRunner {
  constructor(
    private readonly appDb: AppDatabase,
    private readonly clock: Clock,
    private adapters: MarketplaceAdapterRegistry,
    private readonly definitions: ReadonlyMap<string, JobDefinition>,
    /** Reporting-only (doc 07 §7); absent when scraping is not configured. */
    private competitorSources?: CompetitorSourceRegistry,
  ) {}

  /**
   * Replaces the marketplace adapters and competitor sources this runner hands to handlers.
   *
   * Both registries used to be fixed for the lifetime of the process, built once from the
   * credentials present at worker boot. On a fresh install there are none — the operator enters
   * them in the setup wizard, which the worker is already past — so `ImportListings` failed with
   * `No marketplace adapter registered for "trendyol"` and `ScrapeCompetitors` with
   * `no competitor source registered`, on every new installation, until somebody restarted the
   * service. Measured on a clean 0.1.2 install, 2026-08-24.
   *
   * The caller is responsible for only swapping while nothing is in flight (see
   * `Scheduler.isIdle`): a handler holds whatever registry it was given for the duration of its
   * run, and the outgoing competitor sources own a Playwright browser that is closed on replace.
   */
  setRegistries(adapters: MarketplaceAdapterRegistry, competitorSources?: CompetitorSourceRegistry): void {
    this.adapters = adapters;
    this.competitorSources = competitorSources;
  }

  /** Runs the handler for an already-claimed row and settles its terminal `job_queue` state. */
  async runClaimed(claimed: jobsRepo.JobQueueRow): Promise<JobResult> {
    const def = this.definitions.get(claimed.jobName);
    const runId = newId();
    // `app_events.job_run_id` is a real FK to `job_runs.id` (doc 05 §7) — the correlation id
    // threaded through every log line for this run (doc 07 §1) must therefore *be* this run's
    // id, not a separate value, or every event a handler logs would violate the FK.
    const correlationId = runId;
    const startedAt = this.clock.nowMs();

    await jobsRepo.startJobRun(this.appDb, {
      id: runId,
      jobName: claimed.jobName,
      startedAt,
      finishedAt: null,
      state: 'running',
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: null,
      correlationId,
      jobQueueId: claimed.id,
    });

    if (!def) {
      const error = `no job definition registered for "${claimed.jobName}"`;
      await this.finish(runId, zeroResult(), error);
      await jobsRepo.markJobFailed(this.appDb, claimed.id, error, this.clock.nowMs());
      await this.logFailure(claimed, error, correlationId);
      return { ...zeroResult(), error };
    }

    // Heartbeat the claim's lock while the handler runs. Without this, a handler that
    // legitimately takes longer than its visibility timeout (e.g. `ScrapeCompetitors` walking
    // up to `SCRAPE_MAX_LISTINGS_PER_RUN` pages one at a time) has its row's `lockedUntil`
    // lapse mid-run, `requeueExpiredJobs` returns it to `ready` on wall-clock expiry alone, and
    // the *next* tick claims and runs the same job again while the first run is still going —
    // two concurrent sweeps hammering the same public pages, which is exactly the "aggressive"
    // pattern that risks a block (doc 07 §7, api-references §1.6). `claimed.lockedBy` is this
    // worker's own instance id, stamped by `claimNextJob`; renewal only succeeds while the row
    // is still `locked` and owned by it, so a heartbeat that fires after the row has genuinely
    // moved on (reclaimed, or already finished) is a harmless no-op. `unref()` so a lingering
    // interval never keeps the process alive on its own — `finally` clears it regardless.
    const visibilityTimeoutMs = def.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS;
    const heartbeat = setInterval(() => {
      void jobsRepo.renewJobLock(
        this.appDb,
        claimed.id,
        claimed.lockedBy ?? '',
        this.clock.nowMs(),
        visibilityTimeoutMs,
      );
    }, Math.max(1000, Math.floor(visibilityTimeoutMs / 2)));
    heartbeat.unref?.();

    const progress = this.createProgressReporter(runId);

    try {
      const result = await def.handler({
        appDb: this.appDb,
        clock: this.clock,
        adapters: this.adapters,
        competitorSources: this.competitorSources,
        correlationId,
        payload: claimed.payload,
        reportProgress: progress.report,
      });
      await progress.settle();
      await this.finish(runId, result, result.error);
      if (result.error) {
        await this.handleFailure(claimed, def, result.error, correlationId);
      } else {
        await jobsRepo.markJobDone(this.appDb, claimed.id, this.clock.nowMs());
      }
      return result;
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      await progress.settle();
      await this.finish(runId, zeroResult(), message);
      await this.handleFailure(claimed, def, message, correlationId);
      return { ...zeroResult(), error: message };
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async finish(runId: string, result: JobResult, error: string | undefined) {
    const finishedAt = this.clock.nowMs();
    await jobsRepo.finishJobRun(this.appDb, runId, {
      state: error ? 'failed' : 'completed',
      finishedAt,
      itemsTotal: result.itemsTotal,
      itemsOk: result.itemsOk,
      itemsFailed: result.itemsFailed,
      error: error ?? null,
      // The run is over: no item is in flight any more, and `items_done` is settled to the
      // authoritative total so a detail panel opened on a finished run shows a full bar rather
      // than whatever the last mid-run heartbeat happened to catch.
      itemsDone: result.itemsTotal,
      currentItem: null,
      progressAt: finishedAt,
    });
  }

  /**
   * Builds the throttled, fire-and-forget `reportProgress` handed to a handler.
   *
   * Three properties matter, and all three are about not letting a *reporting* feature harm
   * the run it reports on:
   *
   * - **Non-blocking.** `report` returns `void`; the write is queued. A handler that awaited a
   *   database round-trip per item would slow down exactly the long jobs this exists for.
   * - **Serialised and failure-swallowing.** Writes are chained so two heartbeats cannot
   *   interleave, and a failed one is discarded. Progress is never worth failing a run over.
   * - **Settled before `finish`.** `settle()` drains the chain and drops any unflushed
   *   heartbeat, so a late progress `UPDATE` can never land after — and partially overwrite —
   *   the terminal row written by `finish`.
   */
  private createProgressReporter(runId: string): {
    report: (progress: JobProgress) => void;
    settle: () => Promise<void>;
  } {
    let pending: JobProgress | undefined;
    let lastFlushMs = 0;
    let maxDone = 0;
    let closed = false;
    let chain: Promise<void> = Promise.resolve();

    const flush = () => {
      const snapshot = pending;
      if (!snapshot) return;
      pending = undefined;
      lastFlushMs = this.clock.nowMs();
      const at = lastFlushMs;
      chain = chain.then(() =>
        jobsRepo
          .updateJobRunProgress(this.appDb, runId, {
            itemsDone: snapshot.done,
            itemsTotal: snapshot.total,
            currentItem: snapshot.currentItem ?? null,
            progressAt: at,
          })
          .catch(() => undefined),
      );
    };

    return {
      report: (progress) => {
        if (closed) return;
        // Monotonic: a handler that reports out of order (or restarts a counter) must never
        // make the operator's progress bar jump backwards.
        maxDone = Math.max(maxDone, progress.done);
        pending = { ...progress, done: maxDone };
        if (this.clock.nowMs() - lastFlushMs >= PROGRESS_THROTTLE_MS) flush();
      },
      settle: async () => {
        closed = true;
        pending = undefined;
        await chain;
      },
    };
  }

  private async handleFailure(
    claimed: jobsRepo.JobQueueRow,
    def: JobDefinition,
    error: string,
    correlationId: string,
  ) {
    await this.logFailure(claimed, error, correlationId);
    const maxAttempts = def.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const nowMs = this.clock.nowMs();
    // doc 12 6.9: an operator disabling a job (e.g. after `ScrapeCompetitors` starts drawing
    // 403s) is a stop request. Without this check a failure already in flight keeps retrying on
    // its own backoff regardless of the toggle — cadence enqueueing is the only thing gated on
    // `isJobEnabled` today (scheduler.tick's enqueue loop), so a claimed job's own retry chain
    // would otherwise ignore "Devre dışı" entirely and keep reappearing in the run history.
    const stillEnabled = await isJobEnabled(this.appDb, claimed.jobName);
    if (claimed.attempts < maxAttempts && stillEnabled) {
      const delay = computeBackoffMs(claimed.attempts + 1, { maxAttempts, ...RETRY_BACKOFF });
      await jobsRepo.retryJob(this.appDb, claimed.id, nowMs + delay, error, nowMs);
    } else {
      await jobsRepo.markJobFailed(this.appDb, claimed.id, error, nowMs);
    }
  }

  private async logFailure(claimed: jobsRepo.JobQueueRow, error: string, correlationId: string) {
    await eventsRepo.logEvent(this.appDb, {
      id: newId(),
      at: this.clock.nowMs(),
      level: 'error',
      marketplaceCode: null,
      listingId: null,
      jobRunId: correlationId,
      code: 'JobFailed',
      message: `${claimed.jobName} failed: ${error}`,
      context: JSON.stringify({ jobId: claimed.id, attempts: claimed.attempts }),
    });
  }
}
