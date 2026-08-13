/**
 * The shape every job in the doc 07 §1 inventory implements. `packages/jobs` owns the
 * definitions; `apps/worker` (or `Scheduler` directly, for tests) owns running them.
 */
import type { AppDatabase } from '@buybox/db';
import type { Clock } from './clock.js';
import type { MarketplaceAdapterRegistry } from './adapter-registry.js';

export interface JobContext {
  readonly appDb: AppDatabase;
  readonly clock: Clock;
  readonly adapters: MarketplaceAdapterRegistry;
  /** Threaded through every log line for this run (doc 07 §1: "carries a correlation id"). */
  readonly correlationId: string;
  /** Raw JSON payload from the `job_queue` row, parsed by the handler itself. */
  readonly payload: string;
}

export interface JobResult {
  readonly itemsTotal: number;
  readonly itemsOk: number;
  readonly itemsFailed: number;
  /** Set only when the run failed outright (distinct from individual item failures). */
  readonly error?: string;
}

export type JobHandler = (ctx: JobContext) => Promise<JobResult>;

export interface JobDefinition {
  readonly jobName: string;
  readonly handler: JobHandler;
  /** How often the scheduler enqueues a fresh run, in ms. `undefined` = on-demand only. */
  readonly cadenceMs?: number;
  readonly maxAttempts?: number;
  readonly visibilityTimeoutMs?: number;
  /** doc 07 §8: "one run per job at a time, unless the job declares itself parallel-safe." */
  readonly parallelSafe?: boolean;
}

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_VISIBILITY_TIMEOUT_MS = 5 * 60_000;

export function zeroResult(): JobResult {
  return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
}
