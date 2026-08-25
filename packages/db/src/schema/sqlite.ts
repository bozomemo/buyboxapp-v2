/**
 * SQLite schema — docs/05-data-model.md. See `sortable-bigint.ts` for why money columns
 * use a custom sortable-text encoding on this dialect instead of Drizzle's built-in
 * blob-based bigint.
 */
import {
  customType,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { decodeSortableBigint, encodeSortableBigint } from '../sortable-bigint.js';

const money = customType<{ data: bigint; driverData: string }>({
  dataType: () => 'text',
  toDriver: encodeSortableBigint,
  fromDriver: decodeSortableBigint,
});

// Epoch milliseconds UTC (doc 05 §1: "bigint, epoch milliseconds"). SQLite's INTEGER
// storage class is a native 64-bit signed integer regardless of declared type, and any
// timestamp within the next ~285,000 years stays within JS's safe integer range, so a
// plain integer column decoded as `number` is exact — unlike money, which the hard rules
// forbid representing as `number` at any layer.
const timestampMs = (name: string) => integer(name, { mode: 'number' });
const bool = (name: string) => integer(name, { mode: 'boolean' });
// JSON payloads are stored as plain text; (de)serialisation happens in the repository
// layer identically across all three dialects rather than relying on per-driver "json
// mode" behaviour that could differ subtly between engines.
const json = (name: string) => text(name);

export const marketplaces = sqliteTable('marketplaces', {
  code: text('code').primaryKey(),
  displayName: text('display_name').notNull(),
  enabled: bool('enabled').notNull(),
  merchantRef: text('merchant_ref'),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const feeSettings = sqliteTable(
  'fee_settings',
  {
    id: text('id').primaryKey(),
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    effectiveFrom: timestampMs('effective_from').notNull(),
    commissionVatRate: integer('commission_vat_rate').notNull(),
    commissionRateIncludesVat: bool('commission_rate_includes_vat').notNull(),
    commissionVatDeductible: bool('commission_vat_deductible').notNull(),
    commissionBase: text('commission_base').notNull(), // 'gross' | 'net'
    defaultCommissionRate: real('default_commission_rate').notNull(),
    cargoBands: json('cargo_bands').notNull(),
    cargoAmountsIncludeVat: bool('cargo_amounts_include_vat').notNull(),
    cargoVatRate: integer('cargo_vat_rate').notNull(),
    cargoVatDeductible: bool('cargo_vat_deductible').notNull(),
    expenditureBands: json('expenditure_bands').notNull(),
    expenditureIncludesVat: bool('expenditure_includes_vat').notNull(),
    expenditureVatRate: integer('expenditure_vat_rate').notNull(),
    expenditureVatDeductible: bool('expenditure_vat_deductible').notNull(),
  },
  (t) => [uniqueIndex('fee_settings_marketplace_effective_from').on(t.marketplaceCode, t.effectiveFrom)],
);

export const repricingPolicies = sqliteTable('repricing_policies', {
  marketplaceCode: text('marketplace_code')
    .primaryKey()
    .references(() => marketplaces.code, { onDelete: 'cascade' }),
  coarseStepMode: text('coarse_step_mode').notNull(), // 'absolute' | 'percent'
  // Exactly one of these two is populated, matching coarseStepMode — kept as separate
  // columns rather than one dual-purpose column so the money case stays exact bigint
  // (never float) and the percent case stays a real rate, per the hard rule on money.
  coarseStepAbsolute: money('coarse_step_absolute'),
  coarseStepPercent: real('coarse_step_percent'),
  refineTolerance: money('refine_tolerance').notNull(),
  seekStrategy: text('seek_strategy').notNull(), // 'direct' | 'stepped'
  undercutBy: money('undercut_by').notNull(),
  seekStep: money('seek_step').notNull(),
  soleSellerMarginPct: real('sole_seller_margin_pct').notNull(),
  lowStockGuardEnabled: bool('low_stock_guard_enabled').notNull(),
  lowStockThreshold: integer('low_stock_threshold').notNull(),
  lowStockMarginPct: real('low_stock_margin_pct').notNull(),
  stockMode: text('stock_mode').notNull(), // 'respectStock' | 'ignoreStock'
  minPhysicalStock: integer('min_physical_stock').notNull(),
  requirePriceConfirmation: bool('require_price_confirmation').notNull(),
  settleDurationMs: integer('settle_duration_ms').notNull(),
  competitorPriceDelta: money('competitor_price_delta').notNull(),
  useSellerIdentityTrigger: bool('use_seller_identity_trigger').notNull(),
  pollIntervalMs: integer('poll_interval_ms').notNull(),
  concurrency: integer('concurrency').notNull(),
  dailyUpdateAllowanceFormula: text('daily_update_allowance_formula').notNull(),
  budgetReservePct: real('budget_reserve_pct').notNull(),
  enabled: bool('enabled').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: json('value').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const settingsAudit = sqliteTable(
  'settings_audit',
  {
    id: text('id').primaryKey(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    field: text('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    changedBy: text('changed_by').notNull(),
    changedAt: timestampMs('changed_at').notNull(),
  },
  (t) => [index('settings_audit_entity').on(t.entity, t.entityId, t.changedAt)],
);

export const stockItems = sqliteTable('stock_items', {
  baseStockCode: text('base_stock_code').primaryKey(),
  name: text('name').notNull(),
  unitCost: money('unit_cost').notNull(),
  unitStock: integer('unit_stock').notNull(),
  sourceCode: text('source_code').notNull(),
  sourceRef: text('source_ref'),
  costUpdatedAt: timestampMs('cost_updated_at').notNull(),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const stockMarketplacePrefs = sqliteTable(
  'stock_marketplace_prefs',
  {
    baseStockCode: text('base_stock_code').notNull(),
    marketplaceCode: text('marketplace_code').notNull(),
    priceMultiplier: real('price_multiplier').notNull(),
    autoRepriceEnabled: bool('auto_reprice_enabled').notNull(),
    updatedBy: text('updated_by').notNull(),
    updatedAt: timestampMs('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.baseStockCode, t.marketplaceCode] }),
    // Named explicitly: the auto-generated name exceeds MySQL's 64-char identifier limit.
    foreignKey({
      name: 'fk_smp_base_stock_code',
      columns: [t.baseStockCode],
      foreignColumns: [stockItems.baseStockCode],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_smp_marketplace_code',
      columns: [t.marketplaceCode],
      foreignColumns: [marketplaces.code],
    }).onDelete('cascade'),
  ],
);

export const bundles = sqliteTable('bundles', {
  bundleStockCode: text('bundle_stock_code').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const bundleMembers = sqliteTable(
  'bundle_members',
  {
    bundleStockCode: text('bundle_stock_code').notNull(),
    // Not a strict FK: a member stock code may carry a unit-count suffix (doc 01 §2,
    // e.g. "12345-4") that will not literally equal any `stock_items.base_stock_code`.
    memberStockCode: text('member_stock_code').notNull(),
    quantity: integer('quantity').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.bundleStockCode, t.memberStockCode] }),
    foreignKey({
      name: 'fk_bundle_members_bundle_stock_code',
      columns: [t.bundleStockCode],
      foreignColumns: [bundles.bundleStockCode],
    }).onDelete('cascade'),
  ],
);

/**
 * A marketplace brand, keyed by the id the marketplace itself issues (doc 01 §6, customer
 * feedback 2026-08-25 §12.1). Normalised — not a `brand_name` column on `listings` — so
 * "click a brand, see its products" is a join against one row rather than a `GROUP BY` over
 * possibly-inconsistent text, and a brand rename updates one row instead of every listing that
 * carries the old name.
 */
export const brands = sqliteTable(
  'brands',
  {
    id: text('id').primaryKey(),
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    ref: text('ref').notNull(),
    name: text('name').notNull(),
    createdAt: timestampMs('created_at').notNull(),
    updatedAt: timestampMs('updated_at').notNull(),
  },
  (t) => [uniqueIndex('brands_marketplace_ref').on(t.marketplaceCode, t.ref)],
);

/** Same shape and reasoning as {@link brands}, for the marketplace's category tree. */
export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    ref: text('ref').notNull(),
    name: text('name').notNull(),
    createdAt: timestampMs('created_at').notNull(),
    updatedAt: timestampMs('updated_at').notNull(),
  },
  (t) => [uniqueIndex('categories_marketplace_ref').on(t.marketplaceCode, t.ref)],
);

export const listings = sqliteTable(
  'listings',
  {
    id: text('id').primaryKey(),
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    marketplaceListingId: text('marketplace_listing_id').notNull(),
    sellerStockCode: text('seller_stock_code').notNull(),
    // Deliberately NOT a foreign key to stock_items. Doc 05 §4 defines this as "parsed; null
    // when unparseable" — nothing conditions it on stock_items already having a row for that
    // code. Doc 07 §2 imports listings independently of cost data; a stock item is typically
    // entered (manually, or via ImportStockItems) *after* the listings that use it already
    // exist. An FK here made every ImportListings insert fail with a constraint violation
    // whenever the product source hadn't been populated yet — i.e. on every first run.
    baseStockCode: text('base_stock_code'),
    unitCount: integer('unit_count').notNull(),
    isBundle: bool('is_bundle').notNull(),
    productName: text('product_name').notNull(),
    price: money('price').notNull(),
    listPrice: money('list_price'),
    customerPrice: money('customer_price'),
    offeredStock: integer('offered_stock').notNull(),
    commissionRate: real('commission_rate'),
    vatRate: integer('vat_rate'),
    dispatchTime: integer('dispatch_time'),
    isSalable: bool('is_salable').notNull(),
    isLocked: bool('is_locked').notNull(),
    isSuspended: bool('is_suspended').notNull(),
    isFrozen: bool('is_frozen').notNull(),
    isArchived: bool('is_archived').notNull(),
    isBlacklisted: bool('is_blacklisted').notNull(),
    lockReasons: json('lock_reasons'),
    deactivationReasons: json('deactivation_reasons'),
    minPrice: money('min_price'),
    maxPrice: money('max_price'),
    allowIncrease: bool('allow_increase').notNull(),
    allowDecrease: bool('allow_decrease').notNull(),
    repriceEnabled: bool('reprice_enabled').notNull(),
    // Independent of repriceEnabled: lets an operator watch buybox rank / competitors on a
    // listing without opting it into the pricing engine. Same operator-owned, starts-disabled
    // treatment as repriceEnabled — see the comment on `upsertListing` below.
    observationEnabled: bool('observation_enabled').notNull(),
    // Nullable: only Trendyol's product-filter response carries these today (api-references.md
    // §1.4 — already the endpoint ImportListings calls, so no new API call). Hepsiburada's
    // Listing service has no such field (api-references.md §2.4); left null there rather than
    // faked. `set null` on delete: a brand/category row disappearing must not take listings
    // with it (doc 09 §25's "never delete-then-reload" applies here too).
    brandId: text('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    extra: json('extra'),
    firstSeenAt: timestampMs('first_seen_at').notNull(),
    lastSeenAt: timestampMs('last_seen_at').notNull(),
    updatedAt: timestampMs('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('listings_marketplace_listing_id').on(t.marketplaceCode, t.marketplaceListingId),
    index('listings_base_stock_code').on(t.baseStockCode),
    index('listings_marketplace_salable_reprice').on(t.marketplaceCode, t.isSalable, t.repriceEnabled),
    index('listings_seller_stock_code').on(t.sellerStockCode),
    index('listings_brand_id').on(t.brandId),
    index('listings_category_id').on(t.categoryId),
  ],
);

export const listingCampaigns = sqliteTable(
  'listing_campaigns',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    finalPrice: money('final_price').notNull(),
    storeSharePct: real('store_share_pct').notNull(),
    startsAt: timestampMs('starts_at'),
    endsAt: timestampMs('ends_at'),
    observedAt: timestampMs('observed_at').notNull(),
  },
  (t) => [index('listing_campaigns_listing_id').on(t.listingId, t.observedAt)],
);

export const buyboxObservations = sqliteTable(
  'buybox_observations',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    observedAt: timestampMs('observed_at').notNull(),
    rank: integer('rank'),
    buyboxPrice: money('buybox_price'),
    secondPrice: money('second_price'),
    thirdPrice: money('third_price'),
    hasMultipleSeller: bool('has_multiple_seller').notNull(),
    source: text('source').notNull(), // 'api' | 'scrape'
  },
  (t) => [index('buybox_observations_listing_observed').on(t.listingId, t.observedAt)],
);

export const scrapeRuns = sqliteTable(
  'scrape_runs',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    observedAt: timestampMs('observed_at').notNull(),
    source: text('source').notNull(),
    sellerCount: integer('seller_count').notNull(),
    payloadHash: text('payload_hash').notNull(),
    status: text('status').notNull(), // 'ok' | 'parseFailed' | 'fetchFailed'
    changed: bool('changed').notNull(),
  },
  (t) => [index('scrape_runs_listing_observed').on(t.listingId, t.observedAt)],
);

export const competitorObservations = sqliteTable(
  'competitor_observations',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    scrapeRunId: text('scrape_run_id')
      .notNull()
      .references(() => scrapeRuns.id, { onDelete: 'cascade' }),
    observedAt: timestampMs('observed_at').notNull(),
    rank: integer('rank').notNull(),
    sellerName: text('seller_name').notNull(),
    sellerRef: text('seller_ref'),
    price: money('price'),
    finalPrice: money('final_price'),
    rating: real('rating'),
    dispatchTime: integer('dispatch_time'),
    offeredStock: integer('offered_stock'),
    hasPromotion: bool('has_promotion').notNull(),
    promotionText: text('promotion_text'),
  },
  (t) => [
    index('competitor_observations_listing_observed').on(t.listingId, t.observedAt),
    index('competitor_observations_seller_observed').on(t.sellerRef, t.observedAt),
  ],
);

/**
 * An operator's assertion that two marketplace seller identities are the same company
 * (doc 05 §5). Marketplaces issue their own ids in their own namespaces — Trendyol's
 * merchant `12345` and Hepsiburada's `12345` are unrelated — so nothing but a person can
 * know that they are one firm. Never inferred from a matching name: a wrong merge makes a
 * competitor alert fire on the wrong company while still looking like it works.
 */
export const competitorSellerGroups = sqliteTable('competitor_seller_groups', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  note: text('note'),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

/**
 * A competitor seller as a durable entity, keyed by the identity the marketplace issues
 * (doc 05 §5). `competitor_observations` records what a seller did at a moment; this records
 * that the seller *exists*, so an alert rule can name one and still mean the same company
 * after it renames itself.
 *
 * Only sellers the payload identifies get a row: `competitor_observations.seller_ref` is
 * nullable, and a seller with no id has no identity to be durable about — matching one by
 * display name is exactly the mistake `competitor_seller_groups` refuses to make.
 */
export const competitorSellers = sqliteTable(
  'competitor_sellers',
  {
    id: text('id').primaryKey(),
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    sellerRef: text('seller_ref').notNull(),
    /** Last seen. Display data that changes under a stable `sellerRef`, never a key. */
    sellerName: text('seller_name').notNull(),
    groupId: text('group_id').references(() => competitorSellerGroups.id, { onDelete: 'set null' }),
    operatorNote: text('operator_note'),
    firstSeenAt: timestampMs('first_seen_at').notNull(),
    lastSeenAt: timestampMs('last_seen_at').notNull(),
  },
  (t) => [
    uniqueIndex('competitor_sellers_marketplace_ref').on(t.marketplaceCode, t.sellerRef),
    index('competitor_sellers_group').on(t.groupId),
  ],
);

/**
 * A marketplace product we do **not** sell, watched for price/rank only (doc 06 §12.2,
 * customer feedback 2026-08-25). Deliberately its own table rather than a `listings` row with
 * sale-facing fields left null: `Reprice` and `ObserveBuybox` (doc 07 §2.1/§2.2) both query
 * `listings` alone, so a tracked product living in a wholly separate table can *structurally*
 * never be selected for a price submission — there is no flag to check because there is
 * nothing here for that code to see in the first place.
 */
export const trackedProducts = sqliteTable(
  'tracked_products',
  {
    id: text('id').primaryKey(),
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    /** Trendyol `contentId` or Hepsiburada SKU — same identity `ProductPageRef.contentId` uses. */
    productRef: text('product_ref').notNull(),
    productUrl: text('product_url').notNull(),
    /** Operator-entered, for the list screen — never used as an identity. */
    label: text('label').notNull(),
    isActive: bool('is_active').notNull(),
    addedAt: timestampMs('added_at').notNull(),
  },
  (t) => [uniqueIndex('tracked_products_marketplace_ref').on(t.marketplaceCode, t.productRef)],
);

/**
 * One row per offer, per look — the tracked-product analogue of `competitor_observations`, but
 * simpler on purpose: every successful scrape is written (no change-detection hash, no
 * separate `scrape_runs` proof-of-look row), since the tracked-product set is expected to be
 * small and operator-curated rather than a whole catalogue. Revisit if that stops being true.
 */
export const trackedProductObservations = sqliteTable(
  'tracked_product_observations',
  {
    id: text('id').primaryKey(),
    trackedProductId: text('tracked_product_id')
      .notNull()
      .references(() => trackedProducts.id, { onDelete: 'cascade' }),
    observedAt: timestampMs('observed_at').notNull(),
    status: text('status').notNull(), // 'ok' | 'parseFailed' | 'fetchFailed'
    rank: integer('rank'),
    sellerName: text('seller_name'),
    sellerRef: text('seller_ref'),
    price: money('price'),
    finalPrice: money('final_price'),
    offeredStock: integer('offered_stock'),
  },
  (t) => [index('tracked_product_observations_product_observed').on(t.trackedProductId, t.observedAt)],
);

export const priceSubmissions = sqliteTable(
  'price_submissions',
  {
    id: text('id').primaryKey(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    oldPrice: money('old_price').notNull(),
    newPrice: money('new_price').notNull(),
    reason: text('reason').notNull(),
    explanation: text('explanation').notNull(),
    priority: integer('priority').notNull(),
    decidedAt: timestampMs('decided_at').notNull(),
    state: text('state').notNull(), // queued|submitted|confirmed|failed|rejected|cancelled
    submittedAt: timestampMs('submitted_at'),
    confirmedAt: timestampMs('confirmed_at'),
    marketplaceHandle: text('marketplace_handle'),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    attempts: integer('attempts').notNull(),
    unitCost: money('unit_cost'),
    floorPrice: money('floor_price'),
    buyboxPrice: money('buybox_price'),
    secondPrice: money('second_price'),
    rank: integer('rank'),
    commissionRate: real('commission_rate'),
    vatRate: integer('vat_rate'),
  },
  (t) => [
    index('price_submissions_listing_decided').on(t.listingId, t.decidedAt),
    index('price_submissions_outbox').on(t.state, t.priority, t.decidedAt),
    index('price_submissions_budget').on(t.marketplaceCode, t.confirmedAt),
  ],
);

export const repricingState = sqliteTable(
  'repricing_state',
  {
    listingId: text('listing_id')
      .primaryKey()
      .references(() => listings.id, { onDelete: 'cascade' }),
    phase: text('phase').notNull(),
    lastGoodPrice: money('last_good_price'),
    lastBadPrice: money('last_bad_price'),
    optimumPrice: money('optimum_price'),
    optimumCtxUnitCost: money('optimum_ctx_unit_cost'),
    optimumCtxCommissionRate: real('optimum_ctx_commission_rate'),
    optimumCtxVatRate: integer('optimum_ctx_vat_rate'),
    optimumCtxCampaignRatio: real('optimum_ctx_campaign_ratio'),
    optimumCtxSecondPrice: money('optimum_ctx_second_price'),
    optimumCtxSecondSellerRef: text('optimum_ctx_second_seller_ref'),
    pendingSubmissionId: text('pending_submission_id'),
    settleUntil: timestampMs('settle_until'),
    consecutiveRejections: integer('consecutive_rejections').notNull(),
    updatedAt: timestampMs('updated_at').notNull(),
  },
  (t) => [
    // Named explicitly: the auto-generated name exceeds MySQL's 64-char identifier limit.
    foreignKey({
      name: 'fk_repricing_state_pending_submission_id',
      columns: [t.pendingSubmissionId],
      foreignColumns: [priceSubmissions.id],
    }).onDelete('set null'),
  ],
);

export const updateBudgetUsage = sqliteTable(
  'update_budget_usage',
  {
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    usageDate: text('usage_date').notNull(), // YYYY-MM-DD
    consumed: integer('consumed').notNull(),
    allowance: integer('allowance').notNull(),
  },
  (t) => [primaryKey({ columns: [t.marketplaceCode, t.usageDate] })],
);

export const jobQueue = sqliteTable(
  'job_queue',
  {
    id: text('id').primaryKey(),
    jobName: text('job_name').notNull(),
    payload: json('payload').notNull(),
    priority: integer('priority').notNull(),
    state: text('state').notNull(), // ready|locked|done|failed
    runAfter: timestampMs('run_after').notNull(),
    lockedBy: text('locked_by'),
    lockedUntil: timestampMs('locked_until'),
    attempts: integer('attempts').notNull(),
    maxAttempts: integer('max_attempts').notNull(),
    lastError: text('last_error'),
    createdAt: timestampMs('created_at').notNull(),
    updatedAt: timestampMs('updated_at').notNull(),
  },
  (t) => [index('job_queue_claim').on(t.state, t.priority, t.runAfter)],
);

export const jobRuns = sqliteTable('job_runs', {
  id: text('id').primaryKey(),
  jobName: text('job_name').notNull(),
  startedAt: timestampMs('started_at').notNull(),
  finishedAt: timestampMs('finished_at'),
  state: text('state').notNull(),
  itemsTotal: integer('items_total').notNull(),
  itemsOk: integer('items_ok').notNull(),
  itemsFailed: integer('items_failed').notNull(),
  error: text('error'),
  correlationId: text('correlation_id').notNull(),
  // Nullable: rows written before this column existed have none, and a run started outside a
  // claimed queue row (there is none today, but nothing enforces it) would too. Lets
  // `requeueExpiredJobs` close out exactly the orphaned run for an expired claim — by id,
  // never by jobName+time — so a still-legitimately-running instance of the same per-marketplace
  // job (doc 07 §8: multiple marketplaces can run the same job name concurrently) is never
  // mistakenly marked failed alongside it.
  jobQueueId: text('job_queue_id'),
  // Live progress for the Jobs screen's run detail panel (doc 06 §7). The worker and the web
  // app are separate processes, so `job_runs` is the only channel by which the browser can
  // watch a run — the handler heartbeats these three columns through `ctx.reportProgress`.
  // `items_done` is the *attempted* count and only ever grows; `items_ok`/`items_failed` are
  // still written once at the end by `finishJobRun`, so a detail panel showing progress must
  // read `items_done`, not their sum, while the run is in flight.
  itemsDone: integer('items_done').notNull().default(0),
  /** Human-readable label of the item in flight, e.g. a stock code. Never a price or money value. */
  currentItem: text('current_item'),
  /** When progress was last heartbeated — lets the UI tell "slow" from "stalled". */
  progressAt: timestampMs('progress_at'),
});

export const appEvents = sqliteTable(
  'app_events',
  {
    id: text('id').primaryKey(),
    at: timestampMs('at').notNull(),
    level: text('level').notNull(), // debug|info|warn|error
    marketplaceCode: text('marketplace_code').references(() => marketplaces.code, { onDelete: 'set null' }),
    listingId: text('listing_id').references(() => listings.id, { onDelete: 'set null' }),
    jobRunId: text('job_run_id').references(() => jobRuns.id, { onDelete: 'set null' }),
    code: text('code').notNull(),
    message: text('message').notNull(),
    context: json('context'),
  },
  (t) => [
    index('app_events_at').on(t.at),
    index('app_events_level_at').on(t.level, t.at),
    index('app_events_listing_at').on(t.listingId, t.at),
  ],
);

/**
 * Per-marketplace circuit breaker state (doc 07 §3, doc 12 6.9), persisted so it survives
 * worker restarts and is visible/resettable from the web process — `CircuitBreaker`
 * (packages/adapters) is the pure in-memory state machine this table mirrors; not in doc 05
 * because the doc predates this table being needed cross-process. One row per marketplace,
 * created on first use.
 */
export const circuitBreakerState = sqliteTable('circuit_breaker_state', {
  marketplaceCode: text('marketplace_code')
    .primaryKey()
    .references(() => marketplaces.code, { onDelete: 'cascade' }),
  state: text('state').notNull(), // closed|open|half-open
  consecutiveFailures: integer('consecutive_failures').notNull(),
  openedAt: timestampMs('opened_at'),
  lastError: text('last_error'),
  updatedAt: timestampMs('updated_at').notNull(),
});

/**
 * Competitor alert rules (doc 06 §6.2, doc 12 Phase 10C).
 *
 * One generic predicate — scope × subject × comparison — rather than one table per alert kind,
 * so a new alert type is an enum value rather than a migration. Thresholds are `bigint` kuruş
 * like every other money column; a fixed threshold is money too.
 */
export const alertRules = sqliteTable('alert_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  scopeType: text('scope_type').notNull(), // 'listing' | 'baseStockCode' | 'marketplace' | 'all'
  scopeValue: text('scope_value'),
  subjectType: text('subject_type').notNull(), // 'seller' | 'sellerGroup' | 'any'
  subjectValue: text('subject_value'),
  predicate: text('predicate').notNull(), // 'sellerPresent' | 'priceBelow'
  thresholdType: text('threshold_type').notNull(), // 'fixed' | 'belowOurPrice' | 'belowFloor' | 'pctBelowOurs'
  thresholdValue: money('threshold_value'),
  thresholdPct: integer('threshold_pct'),
  /**
   * How long after resolving this rule stays silent for the same target. A competitor
   * oscillating around the threshold would otherwise open and close an alert every hour until
   * the operator stops reading the screen.
   */
  quietPeriodMs: integer('quiet_period_ms').notNull(),
  enabled: bool('enabled').notNull(),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

/**
 * A **state**, not a log line (doc 12 Phase 10C).
 *
 * "Seller X appeared" is an event; "seller X is still there" is a condition, and the second is
 * what an operator needs on a dashboard. Modelling this as an append-only log would make "how
 * many alerts are open right now" unanswerable without reconstructing state from history, and
 * would make the eventual notification hook ("tell me when one *opens*") impossible to place.
 *
 * `alert_key` is deliberately **not** unique: a condition that clears and returns later is two
 * spans, and collapsing them would erase that it happened twice. At most one row per key is
 * `open` at a time, which the repository enforces when reconciling.
 *
 * `snapshot` is the evidence — the offers, prices and threshold as they stood when it fired.
 * Held here rather than looked up later because `competitor_observations` is pruned at 90 days
 * (doc 05 §10) and the offers behind an old alert would otherwise simply vanish.
 */
export const alerts = sqliteTable(
  'alerts',
  {
    id: text('id').primaryKey(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => alertRules.id, { onDelete: 'cascade' }),
    alertKey: text('alert_key').notNull(),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    /** Set for a rule targeting one seller; null for an "any seller" rule, whose offenders are children. */
    sellerRef: text('seller_ref'),
    state: text('state').notNull(), // 'open' | 'resolved'
    firstSeenAt: timestampMs('first_seen_at').notNull(),
    lastSeenAt: timestampMs('last_seen_at').notNull(),
    resolvedAt: timestampMs('resolved_at'),
    thresholdApplied: money('threshold_applied'),
    snapshot: json('snapshot'),
  },
  (t) => [
    index('alerts_key_state').on(t.alertKey, t.state),
    index('alerts_state_last_seen').on(t.state, t.lastSeenAt),
    index('alerts_listing').on(t.listingId),
  ],
);

/**
 * The sellers currently breaching an open alert, each with its own span.
 *
 * This is what lets one "anyone below 400 ₺" alert be a single dashboard row while still
 * answering who and since when. A seller joining an already-open breach updates this table
 * rather than opening a second alert — but it is a change worth notifying on, which is why the
 * join is timestamped rather than merely present.
 */
export const alertSellers = sqliteTable(
  'alert_sellers',
  {
    id: text('id').primaryKey(),
    alertId: text('alert_id')
      .notNull()
      .references(() => alerts.id, { onDelete: 'cascade' }),
    sellerRef: text('seller_ref'),
    sellerName: text('seller_name').notNull(),
    observedPrice: money('observed_price'),
    /** Which price field the comparison used — 'finalPrice' or 'price' (api-references §1.6, §2.11). */
    priceSource: text('price_source').notNull(),
    rank: integer('rank').notNull(),
    promotionText: text('promotion_text'),
    joinedAt: timestampMs('joined_at').notNull(),
    leftAt: timestampMs('left_at'),
  },
  (t) => [index('alert_sellers_alert').on(t.alertId)],
);
