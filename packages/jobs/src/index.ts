/**
 * packages/jobs — job definitions and the DB-backed queue/scheduler (docs/07-processes-and-jobs.md).
 */
export type { Clock } from './clock.js';
export { FakeClock, systemClock } from './clock.js';

export type { JobContext, JobDefinition, JobHandler, JobResult } from './job.js';
export { DEFAULT_MAX_ATTEMPTS, DEFAULT_VISIBILITY_TIMEOUT_MS, zeroResult } from './job.js';

export { JobRunner } from './runner.js';
export { Scheduler, type SchedulerOptions, type TickResult } from './scheduler.js';

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
  buildAdapterRegistry,
  getAdapter,
  UnregisteredMarketplaceError,
  type MarketplaceAdapterRegistry,
} from './adapter-registry.js';
