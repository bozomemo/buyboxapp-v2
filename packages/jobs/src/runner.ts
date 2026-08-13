/**
 * Executes one already-claimed `job_queue` row: runs its handler, writes the `job_runs`
 * audit row (doc 07 §1: "every run writes a job_runs row"), and applies bounded retry with
 * backoff on failure (doc 07 §8, R-JOB-2, R-JOB-9).
 */
import { eventsRepo, jobsRepo, newId } from '@buybox/db';
import type { AppDatabase } from '@buybox/db';
import { computeBackoffMs } from '@buybox/adapters';
import type { MarketplaceAdapterRegistry } from './adapter-registry.js';
import type { Clock } from './clock.js';
import { DEFAULT_MAX_ATTEMPTS, zeroResult, type JobDefinition, type JobResult } from './job.js';

const RETRY_BACKOFF = { baseMs: 5_000, factor: 2, maxDelayMs: 5 * 60_000 };

export class JobRunner {
  constructor(
    private readonly appDb: AppDatabase,
    private readonly clock: Clock,
    private readonly adapters: MarketplaceAdapterRegistry,
    private readonly definitions: ReadonlyMap<string, JobDefinition>,
  ) {}

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
    });

    if (!def) {
      const error = `no job definition registered for "${claimed.jobName}"`;
      await this.finish(runId, zeroResult(), error);
      await jobsRepo.markJobFailed(this.appDb, claimed.id, error, this.clock.nowMs());
      await this.logFailure(claimed, error, correlationId);
      return { ...zeroResult(), error };
    }

    try {
      const result = await def.handler({
        appDb: this.appDb,
        clock: this.clock,
        adapters: this.adapters,
        correlationId,
        payload: claimed.payload,
      });
      await this.finish(runId, result, result.error);
      if (result.error) {
        await this.handleFailure(claimed, def, result.error, correlationId);
      } else {
        await jobsRepo.markJobDone(this.appDb, claimed.id, this.clock.nowMs());
      }
      return result;
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      await this.finish(runId, zeroResult(), message);
      await this.handleFailure(claimed, def, message, correlationId);
      return { ...zeroResult(), error: message };
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
    });
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
    if (claimed.attempts < maxAttempts) {
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
