/**
 * packages/adapters — marketplace + product-source adapters behind ports
 * (docs/api-references.md, doc 10 §3, §4).
 */

// Ports
export type {
  BuyboxObservation,
  CompetitorSnapshot,
  ConnectionTestResult,
  Credentials,
  DateRange,
  IMarketplaceAdapter,
  ListingSnapshot,
  MarketplaceCapabilities,
  OrderSnapshot,
  PriceChange,
  SubmissionHandle,
  SubmissionItemResult,
  SubmissionResult,
} from './ports/marketplace.js';
export type { IProductSource, ProductSourceCode, StockItemInput } from './ports/product-source.js';
export { NotImplementedError } from './ports/product-source.js';

// Contract test suites
export {
  runMarketplaceContractChecks,
  type MarketplaceContractFixture,
} from './contract/marketplace-contract.js';
export {
  runProductSourceContractChecks,
  type ProductSourceContractFixture,
} from './contract/product-source-contract.js';

// Reliability primitives
export { RateLimiter, type AcquireResult, type TokenBucketConfig } from './reliability/rate-limiter.js';
export {
  CircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitState,
} from './reliability/circuit-breaker.js';
export {
  computeBackoffMs,
  realSleep,
  retryAsync,
  type BackoffConfig,
  type RetryOptions,
} from './reliability/retry.js';

// Trendyol
export { TrendyolAdapter, TrendyolApiError } from './trendyol/adapter.js';
export {
  TrendyolCredentialsSchema,
  TRENDYOL_PRODUCTION_BASE_URL,
  TRENDYOL_STAGE_BASE_URL,
  type TrendyolAdapterConfig,
  type TrendyolCredentials,
} from './trendyol/config.js';

// Hepsiburada — intentionally blocked, see hepsiburada/adapter.ts
export { HepsiburadaAdapter, HepsiburadaBlockedError, HEPSIBURADA_HOSTS } from './hepsiburada/adapter.js';

// Product sources
export { ManualProductSource, ManualEntrySchema, type ManualEntry } from './product-sources/manual.js';
export {
  ExcelProductSource,
  ExcelColumnMappingSchema,
  ExcelSourceConfigSchema,
  type ExcelSourceConfig,
} from './product-sources/excel.js';
export {
  MarketplaceListingProductSource,
  MarketplaceListingSourceConfigSchema,
  type MarketplaceListingSourceConfig,
} from './product-sources/marketplace-listing.js';
export { ErpDatabaseProductSource, ErpDatabaseConfigSchema } from './product-sources/erp-database.js';
export { ErpApiProductSource, ErpApiConfigSchema } from './product-sources/erp-api.js';
