/**
 * packages/jobs — job definitions and the DB-backed queue/scheduler (docs/07-processes-and-jobs.md).
 */
export type { Clock } from './clock.js';
export { FakeClock, systemClock } from './clock.js';

export type { JobContext, JobDefinition, JobHandler, JobProgress, JobResult } from './job.js';
export { DEFAULT_MAX_ATTEMPTS, DEFAULT_VISIBILITY_TIMEOUT_MS, zeroResult } from './job.js';

export { JobRunner } from './runner.js';
export { isJobEnabled, Scheduler, type SchedulerOptions, type TickResult } from './scheduler.js';

export type { BudgetAdmission } from './budget.js';
export { admitByPriority, remainingBudget, reserveAmount } from './budget.js';

export {
  IMPORT_STOCK_ITEMS_JOB,
  ImportStockItemsPayloadSchema,
  importStockItems,
  type ImportStockItemsPayload,
} from './pipeline/import-stock-items.js';
export {
  IMPORT_BUNDLES_JOB,
  ImportBundlesPayloadSchema,
  importBundles,
  type ImportBundlesPayload,
} from './pipeline/import-bundles.js';
export {
  IMPORT_LISTINGS_JOB,
  ImportListingsPayloadSchema,
  importListings,
  type ImportListingsPayload,
} from './pipeline/import-listings.js';
export {
  OBSERVE_BUYBOX_JOB,
  ObserveBuyboxPayloadSchema,
  computeObservationTier,
  observeBuybox,
  type ObservationTier,
  type ObserveBuyboxPayload,
} from './pipeline/observe-buybox.js';
export { REPRICE_JOB, RepricePayloadSchema, reprice, type RepricePayload } from './pipeline/reprice.js';
export {
  SUBMIT_PRICE_CHANGES_JOB,
  SubmitPriceChangesPayloadSchema,
  submitPriceChanges,
  marketplaceKillSwitchSetting,
  type SubmitPriceChangesPayload,
} from './pipeline/submit-price-changes.js';
export {
  CONFIRM_SUBMISSIONS_JOB,
  ConfirmSubmissionsPayloadSchema,
  classifyRejection,
  confirmSubmissions,
  type ConfirmSubmissionsPayload,
} from './pipeline/confirm-submissions.js';
export {
  RESET_BUDGET_JOB,
  ResetBudgetPayloadSchema,
  resetBudget,
  type ResetBudgetPayload,
} from './pipeline/reset-budget.js';
export { PRUNE_HISTORY_JOB, pruneHistoryJob } from './pipeline/prune-history-job.js';
export {
  SCRAPE_COMPETITORS_JOB,
  ScrapeCompetitorsPayloadSchema,
  hashOffers,
  isDueForScrape,
  scrapeCompetitors,
  type ScrapeCompetitorsPayload,
} from './pipeline/scrape-competitors.js';
export { decodeProductPageRef, encodeListingExtra } from './pipeline/listing-extra.js';
export { syncMerchantRef, type MerchantRefSyncResult } from './merchant-ref.js';
export {
  SCRAPE_COLD_EVERY_N_CYCLES,
  ALERT_DEFAULT_QUIET_PERIOD_MS,
  ALERT_STALE_AFTER_MS,
  SCRAPE_CYCLE_MS,
  SCRAPE_FAILURE_RATE_ALERT_THRESHOLD,
  SCRAPE_FAILURE_RATE_MIN_SAMPLE,
  SCRAPE_MAX_LISTINGS_PER_RUN,
  SCRAPE_WARM_EVERY_N_CYCLES,
  SELLER_IDENTITY_MAX_AGE_MS,
} from './scrape-config.js';

export {
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  CIRCUIT_BREAKER_OPEN_DURATION_MS,
} from './circuit-breaker-config.js';

export { JOB_CATALOG, jobDefaultEnabled, jobEnabledSettingKey, type JobCatalogEntry } from './job-catalog.js';

export {
  getScrapeRateLimit,
  scrapeRateSettingKey,
  setScrapeRateLimit,
  type ScrapeRateLimit,
} from './scrape-rate-settings.js';

export {
  buildAdapterRegistry,
  getAdapter,
  UnregisteredMarketplaceError,
  type MarketplaceAdapterRegistry,
} from './adapter-registry.js';
export {
  buildCompetitorSourceRegistry,
  getCompetitorSource,
  type CompetitorSourceRegistry,
} from './competitor-source-registry.js';

// DB row ↔ core type mappings — shared with apps/web so the settings UI's "preview impact"
// (doc 06 §9) builds the exact same `FeeSettings`/`RepricingPolicy` the engine actually uses.
export { mapFeeSettings, mapPolicy } from './pipeline/mapping.js';
export { preloadCostDeps } from './pipeline/cost-deps.js';
