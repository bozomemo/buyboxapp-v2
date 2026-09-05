/**
 * packages/jobs — job definitions and the DB-backed queue/scheduler (docs/07-processes-and-jobs.md).
 */
export type { Clock } from './clock.js';
export { FakeClock, systemClock } from './clock.js';

export type { JobContext, JobDefinition, JobHandler, JobProgress, JobResult } from './job.js';
export { DEFAULT_MAX_ATTEMPTS, DEFAULT_VISIBILITY_TIMEOUT_MS, zeroResult } from './job.js';

export { JobRunner } from './runner.js';
export {
  isJobEnabled,
  isSystemPaused,
  Scheduler,
  type SchedulerOptions,
  type SchedulerTickReport,
  type TickResult,
} from './scheduler.js';
export {
  getLicenseStatus,
  isLicensed,
  readLicenseToken,
  LICENSE_LAST_SEEN_WRITE_INTERVAL_MS,
  type LicenseGateOptions,
} from './license-gate.js';

export type { BudgetAdmission } from './budget.js';
export { admitByPriority, remainingBudget, reserveAmount } from './budget.js';

export {
  BULK_IMPORT_SOURCE_CODES,
  IMPORT_STOCK_ITEMS_JOB,
  ImportStockItemsPayloadSchema,
  importStockItems,
  isBulkImportSource,
  PRODUCT_SOURCE_CONFIG_SETTING_KEY,
  resolveImportStockItemsPayload,
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
export {
  RESCAN_MAX_PRODUCTS,
  RESCAN_TRACKED_PRODUCTS_JOB,
  RescanTrackedProductsPayloadSchema,
  rescanTrackedProducts,
  type RescanTrackedProductsPayload,
} from './pipeline/rescan-tracked-products.js';
export {
  SWEEP_BRAND_CATALOGUE_JOB,
  SWEEP_MAX_PAGES_PER_SELECTOR,
  SweepBrandCataloguePayloadSchema,
  mergeSelectorResults,
  sweepBrandCatalogue,
  sweepSelector,
  type SweepBrandCataloguePayload,
} from './pipeline/sweep-brand-catalogue.js';
export {
  IDENTITY_LOOKBACK_DAYS,
  IDENTITY_MAX_CANDIDATES,
  RESOLVE_SELLER_IDENTITY_JOB,
  ResolveSellerIdentityPayloadSchema,
  resolveSellerIdentity,
  resolveThroughCandidates,
  type ResolveSellerIdentityPayload,
} from './pipeline/resolve-seller-identity.js';
export {
  BARCODE_BATCH_SIZE,
  BARCODE_MAX_CONSECUTIVE_FAILURES,
  RESOLVE_PRODUCT_BARCODES_JOB,
  ResolveProductBarcodesPayloadSchema,
  resolveOneBarcode,
  resolveProductBarcodes,
  type ResolveProductBarcodesPayload,
} from './pipeline/resolve-product-barcodes.js';
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
  SCRAPE_MAX_TRACKED_PER_RUN,
  SCRAPE_WARM_EVERY_N_CYCLES,
  SELLER_IDENTITY_MAX_AGE_MS,
} from './scrape-config.js';

export {
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  CIRCUIT_BREAKER_OPEN_DURATION_MS,
} from './circuit-breaker-config.js';

export {
  getJobCadenceMs,
  JOB_CATALOG,
  jobCadenceSettingKey,
  jobDefaultCadenceMs,
  jobDefaultEnabled,
  jobEnabledSettingKey,
  MIN_JOB_CADENCE_MS,
  type JobCatalogEntry,
} from './job-catalog.js';

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
export {
  buildBrandCatalogueSourceRegistry,
  getBrandCatalogueSource,
  type BrandCatalogueSourceRegistry,
} from './brand-catalogue-source-registry.js';
export {
  buildSellerIdentitySourceRegistry,
  getSellerIdentitySource,
  type SellerIdentitySourceRegistry,
} from './seller-identity-source-registry.js';
export {
  buildProductDetailSourceRegistry,
  getProductDetailSource,
  type ProductDetailSourceRegistry,
} from './product-detail-source-registry.js';

// DB row ↔ core type mappings — shared with apps/web so the settings UI's "preview impact"
// (doc 06 §9) builds the exact same `FeeSettings`/`RepricingPolicy` the engine actually uses.
export { mapFeeSettings, mapPolicy } from './pipeline/mapping.js';
export { preloadCostDeps } from './pipeline/cost-deps.js';

export {
  EVALUATE_BRAND_FINDINGS_JOB,
  EvaluateBrandFindingsPayloadSchema,
  evaluateBrandFindings,
  FINDINGS_WINDOW_MS,
  type EvaluateBrandFindingsOptions,
  type EvaluateBrandFindingsPayload,
} from './pipeline/evaluate-brand-findings.js';
export {
  formatFindingMessage,
  MAX_FINDINGS_PER_MESSAGE,
  WebhookFindingNotifier,
  type FindingNotification,
  type IFindingNotifier,
} from './pipeline/findings-notifier.js';
export {
  collectBrandFindings,
  type BrandFindingsContext,
  type BrandFindingsRequest,
  type BrandFindingsResult,
} from './pipeline/brand-findings.js';
