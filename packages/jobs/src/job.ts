/**
 * The shape every job in the doc 07 §1 inventory implements. `packages/jobs` owns the
 * definitions; `apps/worker` (or `Scheduler` directly, for tests) owns running them.
 */
import type { AppDatabase } from '@buybox/db';
import type { Clock } from './clock.js';
import type { MarketplaceAdapterRegistry } from './adapter-registry.js';
import type { BrandCatalogueSourceRegistry } from './brand-catalogue-source-registry.js';
import type { CompetitorSourceRegistry } from './competitor-source-registry.js';
import type { ProductDetailSourceRegistry } from './product-detail-source-registry.js';
import type { SellerIdentitySourceRegistry } from './seller-identity-source-registry.js';

export interface JobContext {
  readonly appDb: AppDatabase;
  readonly clock: Clock;
  readonly adapters: MarketplaceAdapterRegistry;
  /**
   * Reporting-only competitor sources (doc 07 §7). Optional: a deployment that has not
   * enabled scraping simply has none, and every other job is unaffected.
   */
  readonly competitorSources?: CompetitorSourceRegistry;
  /**
   * Reporting-only brand catalogue sources (api-references §1.7). Optional on the same terms as
   * `competitorSources`: a deployment watching no brands simply has none.
   */
  readonly brandCatalogueSources?: BrandCatalogueSourceRegistry;
  /**
   * Reporting-only seller-identity sources (doc 06 §12.4 Faz 7). Optional on the same terms as
   * the two above. Kept as its own registry so that only the job that means to make a
   * merchant-scoped request can reach one — see the registry's doc comment.
   */
  readonly sellerIdentitySources?: SellerIdentitySourceRegistry;
  /**
   * Product-detail sources (Faz 8). Absent is normal: a marketplace with none simply never
   * learns its products' barcodes, and every report that needs one says so rather than guessing.
   */
  readonly productDetailSources?: ProductDetailSourceRegistry;
  /** Threaded through every log line for this run (doc 07 §1: "carries a correlation id"). */
  readonly correlationId: string;
  /** Raw JSON payload from the `job_queue` row, parsed by the handler itself. */
  readonly payload: string;
  /**
   * Reports how far along this run is, for the Jobs screen's live detail panel (doc 06 §7).
   *
   * The worker and the web app are separate processes, so a handler that stays silent until
   * it returns is genuinely unobservable from the UI — this is the only channel. Call it once
   * per item; the runner throttles the actual `UPDATE` (see `PROGRESS_THROTTLE_MS`), so a
   * per-item call is cheap and handlers need no throttling of their own.
   *
   * Progress is **reporting only**, on exactly the terms doc 07 §7 sets for competitor data:
   * a failure to record it never fails the run, and nothing may branch on it. Handlers that
   * do not call it are unaffected — the panel then shows counters without a bar.
   */
  readonly reportProgress: (progress: JobProgress) => void;
}

export interface JobProgress {
  /** Items attempted so far. Monotonic; the runner ignores a value that would move it backwards. */
  readonly done: number;
  /** Total the run expects to attempt, if known at this point. */
  readonly total: number;
  /**
   * What is in flight, for a human — a stock code, a product name. Never money and never a
   * price: this string is written to `job_runs.current_item` and rendered verbatim, and
   * formatted money is a display concern that must not enter storage (CLAUDE.md hard rules).
   */
  readonly currentItem?: string | null;
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
