/**
 * MySQL schema — docs/05-data-model.md. Structurally identical to `sqlite.ts` and
 * `postgres.ts`; only the column builders differ. One MySQL-specific wrinkle: InnoDB
 * cannot index an unbounded `TEXT` column without an explicit key-length prefix, so any
 * identifier/key/enum-like column that is a primary key, foreign key or index member
 * uses `varchar(n)` here (`code(...)` below) — free-text and JSON payload columns that
 * are never indexed stay `text`, matching the other two dialects.
 */
import {
  bigint,
  boolean,
  foreignKey,
  index,
  int,
  mysqlTable,
  primaryKey,
  real,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

const money = (name: string) => bigint(name, { mode: 'bigint' });
// Epoch milliseconds UTC, decoded as `number` (safe: see the note in schema/sqlite.ts).
const timestampMs = (name: string) => bigint(name, { mode: 'number' });
const bool = (name: string) => boolean(name);
const json = (name: string) => text(name);
const code = (name: string, length = 64) => varchar(name, { length });

export const marketplaces = mysqlTable('marketplaces', {
  code: code('code', 20).primaryKey(),
  displayName: text('display_name').notNull(),
  enabled: bool('enabled').notNull(),
  merchantRef: text('merchant_ref'),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const feeSettings = mysqlTable(
  'fee_settings',
  {
    id: code('id', 36).primaryKey(),
    marketplaceCode: code('marketplace_code', 20)
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    effectiveFrom: timestampMs('effective_from').notNull(),
    commissionVatRate: int('commission_vat_rate').notNull(),
    commissionRateIncludesVat: bool('commission_rate_includes_vat').notNull(),
    commissionVatDeductible: bool('commission_vat_deductible').notNull(),
    commissionBase: code('commission_base', 16).notNull(),
    defaultCommissionRate: real('default_commission_rate').notNull(),
    cargoBands: json('cargo_bands').notNull(),
    cargoAmountsIncludeVat: bool('cargo_amounts_include_vat').notNull(),
    cargoVatRate: int('cargo_vat_rate').notNull(),
    cargoVatDeductible: bool('cargo_vat_deductible').notNull(),
    expenditureBands: json('expenditure_bands').notNull(),
    expenditureIncludesVat: bool('expenditure_includes_vat').notNull(),
    expenditureVatRate: int('expenditure_vat_rate').notNull(),
    expenditureVatDeductible: bool('expenditure_vat_deductible').notNull(),
  },
  (t) => [uniqueIndex('fee_settings_marketplace_effective_from').on(t.marketplaceCode, t.effectiveFrom)],
);

export const repricingPolicies = mysqlTable('repricing_policies', {
  marketplaceCode: code('marketplace_code', 20)
    .primaryKey()
    .references(() => marketplaces.code, { onDelete: 'cascade' }),
  coarseStepMode: code('coarse_step_mode', 16).notNull(),
  // Exactly one of these two is populated, matching coarseStepMode — see the note in
  // schema/sqlite.ts.
  coarseStepAbsolute: money('coarse_step_absolute'),
  coarseStepPercent: real('coarse_step_percent'),
  refineTolerance: money('refine_tolerance').notNull(),
  seekStrategy: code('seek_strategy', 16).notNull(),
  undercutBy: money('undercut_by').notNull(),
  seekStep: money('seek_step').notNull(),
  soleSellerMarginPct: real('sole_seller_margin_pct').notNull(),
  lowStockGuardEnabled: bool('low_stock_guard_enabled').notNull(),
  lowStockThreshold: int('low_stock_threshold').notNull(),
  lowStockMarginPct: real('low_stock_margin_pct').notNull(),
  stockMode: code('stock_mode', 16).notNull(),
  minPhysicalStock: int('min_physical_stock').notNull(),
  requirePriceConfirmation: bool('require_price_confirmation').notNull(),
  settleDurationMs: int('settle_duration_ms').notNull(),
  competitorPriceDelta: money('competitor_price_delta').notNull(),
  useSellerIdentityTrigger: bool('use_seller_identity_trigger').notNull(),
  pollIntervalMs: int('poll_interval_ms').notNull(),
  concurrency: int('concurrency').notNull(),
  dailyUpdateAllowanceFormula: text('daily_update_allowance_formula').notNull(),
  budgetReservePct: real('budget_reserve_pct').notNull(),
  enabled: bool('enabled').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const appSettings = mysqlTable('app_settings', {
  key: code('key', 128).primaryKey(),
  value: json('value').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const settingsAudit = mysqlTable(
  'settings_audit',
  {
    id: code('id', 36).primaryKey(),
    entity: code('entity', 64).notNull(),
    entityId: code('entity_id', 64).notNull(),
    field: text('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    changedBy: text('changed_by').notNull(),
    changedAt: timestampMs('changed_at').notNull(),
  },
  (t) => [index('settings_audit_entity').on(t.entity, t.entityId, t.changedAt)],
);

export const stockItems = mysqlTable('stock_items', {
  baseStockCode: code('base_stock_code', 64).primaryKey(),
  name: text('name').notNull(),
  unitCost: money('unit_cost').notNull(),
  unitStock: int('unit_stock').notNull(),
  sourceCode: code('source_code', 32).notNull(),
  sourceRef: text('source_ref'),
  costUpdatedAt: timestampMs('cost_updated_at').notNull(),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const stockMarketplacePrefs = mysqlTable(
  'stock_marketplace_prefs',
  {
    baseStockCode: code('base_stock_code', 64).notNull(),
    marketplaceCode: code('marketplace_code', 20).notNull(),
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

export const bundles = mysqlTable('bundles', {
  bundleStockCode: code('bundle_stock_code', 64).primaryKey(),
  name: text('name').notNull(),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const bundleMembers = mysqlTable(
  'bundle_members',
  {
    bundleStockCode: code('bundle_stock_code', 64).notNull(),
    memberStockCode: code('member_stock_code', 64).notNull(),
    quantity: int('quantity').notNull(),
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

export const listings = mysqlTable(
  'listings',
  {
    id: code('id', 36).primaryKey(),
    marketplaceCode: code('marketplace_code', 20)
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    marketplaceListingId: code('marketplace_listing_id', 128).notNull(),
    sellerStockCode: code('seller_stock_code', 128).notNull(),
    baseStockCode: code('base_stock_code', 64).references(() => stockItems.baseStockCode, {
      onDelete: 'set null',
    }),
    unitCount: int('unit_count').notNull(),
    isBundle: bool('is_bundle').notNull(),
    productName: text('product_name').notNull(),
    price: money('price').notNull(),
    listPrice: money('list_price'),
    customerPrice: money('customer_price'),
    offeredStock: int('offered_stock').notNull(),
    commissionRate: real('commission_rate'),
    vatRate: int('vat_rate'),
    dispatchTime: int('dispatch_time'),
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
  ],
);

export const listingCampaigns = mysqlTable(
  'listing_campaigns',
  {
    id: code('id', 36).primaryKey(),
    listingId: code('listing_id', 36)
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

export const buyboxObservations = mysqlTable(
  'buybox_observations',
  {
    id: code('id', 36).primaryKey(),
    listingId: code('listing_id', 36)
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    observedAt: timestampMs('observed_at').notNull(),
    rank: int('rank'),
    buyboxPrice: money('buybox_price'),
    secondPrice: money('second_price'),
    thirdPrice: money('third_price'),
    hasMultipleSeller: bool('has_multiple_seller').notNull(),
    source: code('source', 16).notNull(),
  },
  (t) => [index('buybox_observations_listing_observed').on(t.listingId, t.observedAt)],
);

export const scrapeRuns = mysqlTable(
  'scrape_runs',
  {
    id: code('id', 36).primaryKey(),
    listingId: code('listing_id', 36)
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    observedAt: timestampMs('observed_at').notNull(),
    source: code('source', 16).notNull(),
    sellerCount: int('seller_count').notNull(),
    payloadHash: code('payload_hash', 64).notNull(),
    status: code('status', 16).notNull(),
    changed: bool('changed').notNull(),
  },
  (t) => [index('scrape_runs_listing_observed').on(t.listingId, t.observedAt)],
);

export const competitorObservations = mysqlTable(
  'competitor_observations',
  {
    id: code('id', 36).primaryKey(),
    listingId: code('listing_id', 36)
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    scrapeRunId: code('scrape_run_id', 36)
      .notNull()
      .references(() => scrapeRuns.id, { onDelete: 'cascade' }),
    observedAt: timestampMs('observed_at').notNull(),
    rank: int('rank').notNull(),
    sellerName: text('seller_name').notNull(),
    sellerRef: code('seller_ref', 128),
    price: money('price'),
    finalPrice: money('final_price'),
    rating: real('rating'),
    dispatchTime: int('dispatch_time'),
    offeredStock: int('offered_stock'),
    hasPromotion: bool('has_promotion').notNull(),
    promotionText: text('promotion_text'),
  },
  (t) => [
    index('competitor_observations_listing_observed').on(t.listingId, t.observedAt),
    index('competitor_observations_seller_observed').on(t.sellerRef, t.observedAt),
  ],
);

export const priceSubmissions = mysqlTable(
  'price_submissions',
  {
    id: code('id', 36).primaryKey(),
    listingId: code('listing_id', 36)
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    marketplaceCode: code('marketplace_code', 20)
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    oldPrice: money('old_price').notNull(),
    newPrice: money('new_price').notNull(),
    reason: code('reason', 32).notNull(),
    explanation: text('explanation').notNull(),
    priority: int('priority').notNull(),
    decidedAt: timestampMs('decided_at').notNull(),
    state: code('state', 16).notNull(),
    submittedAt: timestampMs('submitted_at'),
    confirmedAt: timestampMs('confirmed_at'),
    marketplaceHandle: text('marketplace_handle'),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    attempts: int('attempts').notNull(),
    unitCost: money('unit_cost'),
    floorPrice: money('floor_price'),
    buyboxPrice: money('buybox_price'),
    secondPrice: money('second_price'),
    rank: int('rank'),
    commissionRate: real('commission_rate'),
    vatRate: int('vat_rate'),
  },
  (t) => [
    index('price_submissions_listing_decided').on(t.listingId, t.decidedAt),
    index('price_submissions_outbox').on(t.state, t.priority, t.decidedAt),
    index('price_submissions_budget').on(t.marketplaceCode, t.confirmedAt),
  ],
);

export const repricingState = mysqlTable(
  'repricing_state',
  {
    listingId: code('listing_id', 36)
      .primaryKey()
      .references(() => listings.id, { onDelete: 'cascade' }),
    phase: code('phase', 16).notNull(),
    lastGoodPrice: money('last_good_price'),
    lastBadPrice: money('last_bad_price'),
    optimumPrice: money('optimum_price'),
    optimumCtxUnitCost: money('optimum_ctx_unit_cost'),
    optimumCtxCommissionRate: real('optimum_ctx_commission_rate'),
    optimumCtxVatRate: int('optimum_ctx_vat_rate'),
    optimumCtxCampaignRatio: real('optimum_ctx_campaign_ratio'),
    optimumCtxSecondPrice: money('optimum_ctx_second_price'),
    optimumCtxSecondSellerRef: text('optimum_ctx_second_seller_ref'),
    pendingSubmissionId: code('pending_submission_id', 36),
    settleUntil: timestampMs('settle_until'),
    consecutiveRejections: int('consecutive_rejections').notNull(),
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

export const updateBudgetUsage = mysqlTable(
  'update_budget_usage',
  {
    marketplaceCode: code('marketplace_code', 20)
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    usageDate: code('usage_date', 10).notNull(),
    consumed: int('consumed').notNull(),
    allowance: int('allowance').notNull(),
  },
  (t) => [primaryKey({ columns: [t.marketplaceCode, t.usageDate] })],
);

export const jobQueue = mysqlTable(
  'job_queue',
  {
    id: code('id', 36).primaryKey(),
    jobName: code('job_name', 64).notNull(),
    payload: json('payload').notNull(),
    priority: int('priority').notNull(),
    state: code('state', 16).notNull(),
    runAfter: timestampMs('run_after').notNull(),
    lockedBy: text('locked_by'),
    lockedUntil: timestampMs('locked_until'),
    attempts: int('attempts').notNull(),
    maxAttempts: int('max_attempts').notNull(),
    lastError: text('last_error'),
    createdAt: timestampMs('created_at').notNull(),
    updatedAt: timestampMs('updated_at').notNull(),
  },
  (t) => [index('job_queue_claim').on(t.state, t.priority, t.runAfter)],
);

export const jobRuns = mysqlTable('job_runs', {
  id: code('id', 36).primaryKey(),
  jobName: code('job_name', 64).notNull(),
  startedAt: timestampMs('started_at').notNull(),
  finishedAt: timestampMs('finished_at'),
  state: code('state', 16).notNull(),
  itemsTotal: int('items_total').notNull(),
  itemsOk: int('items_ok').notNull(),
  itemsFailed: int('items_failed').notNull(),
  error: text('error'),
  correlationId: code('correlation_id', 64).notNull(),
});

export const appEvents = mysqlTable(
  'app_events',
  {
    id: code('id', 36).primaryKey(),
    at: timestampMs('at').notNull(),
    level: code('level', 16).notNull(),
    marketplaceCode: code('marketplace_code', 20).references(() => marketplaces.code, {
      onDelete: 'set null',
    }),
    listingId: code('listing_id', 36).references(() => listings.id, { onDelete: 'set null' }),
    jobRunId: code('job_run_id', 36).references(() => jobRuns.id, { onDelete: 'set null' }),
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
