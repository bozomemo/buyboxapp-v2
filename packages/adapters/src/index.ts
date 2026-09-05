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
  type CompetitorProductFacts,
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
  extractEmbeddedState,
  extractSearchResultProps,
  extractSharedProps,
  SharedPropsNotFoundError,
  SEARCH_RESULT_PROPS_MARKER,
  SHARED_PROPS_MARKER,
} from './trendyol/public-page/shared-props.js';

// Trendyol brand catalogue — reporting only, the brand-owner audit module's enumeration tier
// (api-references §1.7). One page per 24 products, against `ICompetitorSource`'s one page per
// product; see the port's doc comment for why the two are deliberately not the same interface.
export {
  BrandCatalogueError,
  hasBrandCatalogueQuery,
  type BrandCatalogueDiagnostics,
  type BrandCataloguePage,
  type BrandCatalogueProduct,
  type BrandCatalogueQuery,
  type BrandCatalogueFailureKind,
  type IBrandCatalogueSource,
} from './ports/brand-catalogue-source.js';
export {
  TrendyolBrandCatalogueSource,
  TRENDYOL_BRAND_CATALOGUE_DEFAULTS,
  TRENDYOL_BRAND_CATALOGUE_PAGE_SIZE,
  type TrendyolBrandCatalogueSourceConfig,
} from './trendyol/brand-catalogue/source.js';
export {
  normalizeTrendyolBrandCataloguePage,
  TrendyolBrandCatalogueSchemaError,
  TRENDYOL_BRAND_CATALOGUE_PARSER_VERSION,
  type TrendyolBrandCataloguePage,
} from './trendyol/brand-catalogue/normalize.js';

// The seller-identity port (doc 06 §12.4 Faz 7). A fourth port, not a method on the competitor
// source: it requests the product page *as* one merchant, which is authoritative about who that
// merchant is and worthless about where they rank — so none of its types carries a rank.
export {
  SellerIdentityError,
  type ISellerIdentitySource,
  type SellerIdentity,
  type SellerIdentityDiagnostics,
  type SellerIdentityFailureKind,
  type SellerIdentitySnapshot,
  type SellerListingFact,
} from './ports/seller-identity-source.js';
export {
  TrendyolSellerIdentitySource,
  TRENDYOL_IDENTITY_DEFAULTS,
  type TrendyolSellerIdentitySourceConfig,
} from './trendyol/seller-identity/source.js';
export {
  normalizeTrendyolSellerIdentity,
  TrendyolIdentityMismatchError,
  TrendyolIdentitySchemaError,
  TRENDYOL_IDENTITY_PARSER_VERSION,
  type TrendyolSellerIdentity,
} from './trendyol/seller-identity/normalize.js';

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

// The product-detail port (api-references §2.14, Faz 8). A fifth port, not a method on the
// competitor source: the product page carries a *truncated* seller list that looks complete —
// 2 of 6 sellers beside `hasMoreListings: true`, measured 2026-08-28 — so no type here has a
// seller, price or rank field to put one in. Its reason for existing is the barcode, which is
// the only honest key for matching a product across two marketplaces.
export {
  ProductDetailError,
  type IProductDetailSource,
  type ProductDetail,
  type ProductDetailDiagnostics,
  type ProductDetailFailureKind,
  type ProductDetailSnapshot,
} from './ports/product-detail-source.js';
export {
  HepsiburadaProductDetailSource,
  HEPSIBURADA_PRODUCT_DETAIL_DEFAULTS,
  type HepsiburadaProductDetailSourceConfig,
} from './hepsiburada/product-detail/source.js';
export {
  normalizeHepsiburadaProductDetail,
  HepsiburadaProductDetailSchemaError,
  HepsiburadaProductMismatchError,
  HEPSIBURADA_PRODUCT_DETAIL_PARSER_VERSION,
  type HepsiburadaProductDetail,
} from './hepsiburada/product-detail/normalize.js';

// Hepsiburada brand catalogue — the sweep's second marketplace (api-references §2.13). Honest
// client, no browser and no impersonation exception: the search page answers a request carrying
// nothing but our own user agent (measured 2026-08-28).
export {
  HepsiburadaBrandCatalogueSource,
  HEPSIBURADA_BRAND_CATALOGUE_DEFAULTS,
  HEPSIBURADA_BRAND_CATALOGUE_PAGE_SIZE,
  type HepsiburadaBrandCatalogueSourceConfig,
} from './hepsiburada/brand-catalogue/source.js';
export {
  normalizeHepsiburadaBrandCatalogue,
  HepsiburadaBrandCatalogueSchemaError,
  HEPSIBURADA_BRAND_CATALOGUE_PARSER_VERSION,
  type HepsiburadaBrandCataloguePage,
} from './hepsiburada/brand-catalogue/normalize.js';
export {
  extractMoriaProductListState,
  extractReduxStoreState,
  HepsiburadaStateNotFoundError,
} from './hepsiburada/public-page/embedded-state.js';

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
