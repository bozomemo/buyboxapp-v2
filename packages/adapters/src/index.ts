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
export {
  CompetitorSourceError,
  hasProductPageRef,
  type CompetitorOffer,
  type CompetitorPageSnapshot,
  type CompetitorSourceFailureKind,
  type ICompetitorSource,
  type ProductPageRef,
  type ScrapeDiagnostics,
} from './ports/competitor-source.js';
export type { IProductSource, ProductSourceCode, StockItemInput } from './ports/product-source.js';
export { NotImplementedError } from './ports/product-source.js';
export { parseProductLink, type ParsedProductLink } from './parse-product-link.js';

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

// Trendyol public-page scraper — reporting only, never the control path (api-references §1.6).
export {
  TrendyolPublicPageSource,
  TRENDYOL_PUBLIC_BASE_URL,
  TRENDYOL_SCRAPE_DEFAULTS,
  type TrendyolPublicPageSourceConfig,
} from './trendyol/public-page/source.js';
export {
  normalizeTrendyolPage,
  TrendyolPageSchemaError,
  TRENDYOL_PARSER_VERSION,
  type TrendyolPageOffers,
} from './trendyol/public-page/normalize.js';
export {
  extractSharedProps,
  SharedPropsNotFoundError,
  SHARED_PROPS_MARKER,
} from './trendyol/public-page/shared-props.js';

// Hepsiburada — the control path (list / submit / poll), built against the vendor's own
// OpenAPI document, verified 2026-08-14 (api-references §2.4, §2.6). `fetchBuyboxObservations`
// alone still throws: §2.5 declares no response schema. See hepsiburada/adapter.ts.
export { HepsiburadaAdapter, HepsiburadaApiError, HepsiburadaBlockedError } from './hepsiburada/adapter.js';
export {
  HepsiburadaCredentialsSchema,
  HEPSIBURADA_HOSTS,
  type HepsiburadaAdapterConfig,
  type HepsiburadaCorrelation,
  type HepsiburadaCredentials,
  type HepsiburadaEnvironment,
} from './hepsiburada/config.js';
export {
  mapListingToSnapshot,
  mapPriceUploadResult,
  HepsiburadaMappingError,
  type HepsiburadaListing,
  type HepsiburadaPriceUploadResult,
} from './hepsiburada/mapping.js';

// Hepsiburada public listings — reporting only, never the control path (api-references §2.11).
// Independent of the adapter above and must stay that way: that one is authenticated and
// merchant-scoped and may feed pricing; this one is public and may not (§2.5).
export {
  HepsiburadaPublicListingsSource,
  buildHepsiburadaPublicHeaders,
  HEPSIBURADA_PUBLIC_BASE_URL,
  HEPSIBURADA_LISTINGS_PATH,
  HEPSIBURADA_SCRAPE_DEFAULTS,
  type HepsiburadaPublicListingsSourceConfig,
} from './hepsiburada/public-listings/source.js';
export {
  normalizeHepsiburadaListings,
  HepsiburadaListingsSchemaError,
  HEPSIBURADA_PARSER_VERSION,
  type HepsiburadaListingOffers,
} from './hepsiburada/public-listings/normalize.js';

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
