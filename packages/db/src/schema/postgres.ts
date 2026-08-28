/**
 * PostgreSQL schema — docs/05-data-model.md. Structurally identical to `sqlite.ts` and
 * `mysql.ts`; only the column builders differ. Money columns use PostgreSQL's native
 * 64-bit `bigint` mapped straight to JS `bigint` — no custom encoding needed here (see
 * `sortable-bigint.ts` for why SQLite does).
 */
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const money = (name: string) => bigint(name, { mode: 'bigint' });
// Epoch milliseconds UTC, decoded as `number` (safe: see the note in schema/sqlite.ts).
const timestampMs = (name: string) => bigint(name, { mode: 'number' });
const bool = (name: string) => boolean(name);
const json = (name: string) => text(name);

export const marketplaces = pgTable('marketplaces', {
  code: text('code').primaryKey(),
  displayName: text('display_name').notNull(),
  enabled: bool('enabled').notNull(),
  merchantRef: text('merchant_ref'),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const feeSettings = pgTable(
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
    commissionBase: text('commission_base').notNull(),
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

export const repricingPolicies = pgTable('repricing_policies', {
  marketplaceCode: text('marketplace_code')
    .primaryKey()
    .references(() => marketplaces.code, { onDelete: 'cascade' }),
  coarseStepMode: text('coarse_step_mode').notNull(),
  // Exactly one of these two is populated, matching coarseStepMode — see the note in
  // schema/sqlite.ts.
  coarseStepAbsolute: money('coarse_step_absolute'),
  coarseStepPercent: real('coarse_step_percent'),
  refineTolerance: money('refine_tolerance').notNull(),
  seekStrategy: text('seek_strategy').notNull(),
  undercutBy: money('undercut_by').notNull(),
  seekStep: money('seek_step').notNull(),
  soleSellerMarginPct: real('sole_seller_margin_pct').notNull(),
  lowStockGuardEnabled: bool('low_stock_guard_enabled').notNull(),
  lowStockThreshold: integer('low_stock_threshold').notNull(),
  lowStockMarginPct: real('low_stock_margin_pct').notNull(),
  stockMode: text('stock_mode').notNull(),
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

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: json('value').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const settingsAudit = pgTable(
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

export const stockItems = pgTable('stock_items', {
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

export const stockMarketplacePrefs = pgTable(
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
    // Named explicitly: the auto-generated name exceeds MySQL's 64-char identifier limit
    // (kept consistent here too, since Postgres silently truncates long identifiers).
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

export const bundles = pgTable('bundles', {
  bundleStockCode: text('bundle_stock_code').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const bundleMembers = pgTable(
  'bundle_members',
  {
    bundleStockCode: text('bundle_stock_code').notNull(),
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

/** See the doc comment on `brands` in `schema/sqlite.ts` — identical shape and reasoning. */
export const brands = pgTable(
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

export const categories = pgTable(
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

export const listings = pgTable(
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
    // See the doc comment on this pair in `schema/sqlite.ts`.
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

export const listingCampaigns = pgTable(
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

export const buyboxObservations = pgTable(
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
    source: text('source').notNull(),
  },
  (t) => [index('buybox_observations_listing_observed').on(t.listingId, t.observedAt)],
);

export const scrapeRuns = pgTable(
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
    status: text('status').notNull(),
    changed: bool('changed').notNull(),
  },
  (t) => [index('scrape_runs_listing_observed').on(t.listingId, t.observedAt)],
);

export const competitorObservations = pgTable(
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

/** See the note on this table in `schema/sqlite.ts`. */
export const competitorSellerGroups = pgTable('competitor_seller_groups', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  note: text('note'),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

/** See the note on this table in `schema/sqlite.ts`. */
export const competitorSellers = pgTable(
  'competitor_sellers',
  {
    id: text('id').primaryKey(),
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    sellerRef: text('seller_ref').notNull(),
    sellerName: text('seller_name').notNull(),
    groupId: text('group_id').references(() => competitorSellerGroups.id, { onDelete: 'set null' }),
    operatorNote: text('operator_note'),
    /**
     * The firm behind the storefront, when someone has established it (Faz 5, 2026-08-28).
     *
     * **Operator-owned**, like `group_id` and `operator_note` beside it: a scrape never writes
     * it, so recording it by hand cannot be undone by the next run. Faz 7 will fill it
     * automatically from the marketplace's own seller page, and will write only where this is
     * null — a resolved value must never overwrite a person's correction.
     *
     * It exists because policy is asked of a **firm**, not a storefront: one company can hold
     * several seller accounts, and a rule written against a tax number should follow the company
     * across them. Until a seller has one, a tax-number rule simply does not match it, which is
     * the honest reading rather than a guess.
     */
    taxNumber: text('tax_number'),
    firstSeenAt: timestampMs('first_seen_at').notNull(),
    lastSeenAt: timestampMs('last_seen_at').notNull(),
  },
  (t) => [
    uniqueIndex('competitor_sellers_marketplace_ref').on(t.marketplaceCode, t.sellerRef),
    index('competitor_sellers_group').on(t.groupId),
  ],
);

/** See the doc comment on `trackedProducts` in `schema/sqlite.ts` — identical shape and reasoning. */
/** See the doc comment on `watchedBrandGroups` in `schema/sqlite.ts`. */
export const watchedBrandGroups = pgTable('watched_brand_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  note: text('note'),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

/** See the doc comment on `watchedBrands` in `schema/sqlite.ts`. */
export const watchedBrands = pgTable(
  'watched_brands',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => watchedBrandGroups.id, { onDelete: 'cascade' }),
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    brandRef: text('brand_ref'),
    searchTerm: text('search_term'),
    isActive: bool('is_active').notNull(),
    lastSweptAt: timestampMs('last_swept_at'),
    lastSweepProductCount: integer('last_sweep_product_count'),
    createdAt: timestampMs('created_at').notNull(),
    updatedAt: timestampMs('updated_at').notNull(),
  },
  (t) => [
    index('watched_brands_group').on(t.groupId),
    uniqueIndex('watched_brands_group_marketplace_label').on(t.groupId, t.marketplaceCode, t.label),
  ],
);

/**
 * The firm behind a storefront, as the marketplace states it (doc 06 §12.4 Faz 7, guide §29).
 *
 * A **separate table from `competitor_sellers`, not extra columns on it**, for two reasons that
 * both come down to who owns the data. `competitor_sellers` mixes observed facts with
 * operator-owned ones (`group_id`, `operator_note`, `tax_number`), and every write there is
 * carefully guarded so a scrape cannot undo a person's entry. These fields are neither: they are
 * a dated copy of what one merchant-scoped page said on one day, and they should be replaceable
 * — and deletable — as a unit. Guide §29 asks that business/contact metadata be retained only
 * where the application needs it; keeping it in one table makes "stop retaining it" a `DELETE`
 * rather than an audit of six nullable columns.
 *
 * One row per seller: a resolution replaces the previous answer rather than appending. This is
 * not history — a firm's registered title is not a time series, and an operator reading an
 * address wants the current one, with the date it was read next to it.
 *
 * `tax_number` is duplicated onto `competitor_sellers.tax_number` when that column is null, and
 * only then (`setSellerTaxNumberIfAbsent`): there it is the operator-owned matching key that
 * Faz 5's authorised-seller list is written against, and a resolution must never overwrite what
 * a person entered by hand.
 */
export const competitorSellerIdentities = pgTable(
  'competitor_seller_identities',
  {
    id: text('id').primaryKey(),
    competitorSellerId: text('competitor_seller_id').notNull(),
    /** Registered commercial title (`unvan`) — the name that goes on a notice. */
    officialName: text('official_name'),
    /** VKN, or a TCKN for a sole trader. Copied to `competitor_sellers.tax_number` when absent there. */
    taxNumber: text('tax_number'),
    taxOffice: text('tax_office'),
    /** KEP — the address a formal notice is legally served to. */
    registeredEmailAddress: text('registered_email_address'),
    address: text('address'),
    cityName: text('city_name'),
    countryName: text('country_name'),
    /** See the SQLite schema for why this is JSON and why it carries no price or rank. */
    listingsJson: text('listings_json').notNull(),
    sourceUrl: text('source_url').notNull(),
    parserVersion: text('parser_version').notNull(),
    resolvedAt: timestampMs('resolved_at').notNull(),
  },
  (t) => [
    uniqueIndex('competitor_seller_identities_seller').on(t.competitorSellerId),
    // Named by hand for the same reason MySQL needs it: the generated name
    // (`competitor_seller_identities_competitor_seller_id_competitor_sellers_id_fk`, 74 chars)
    // is past PostgreSQL's 63-byte identifier limit. Postgres truncates silently rather than
    // failing, which is worse than an error — two long names can collide after the cut.
    foreignKey({
      name: 'fk_competitor_seller_identities_seller',
      columns: [t.competitorSellerId],
      foreignColumns: [competitorSellers.id],
    }).onDelete('cascade'),
  ],
);

/** See the doc comment on `sellerPolicies` in `schema/sqlite.ts`. */
export const sellerPolicies = pgTable(
  'seller_policies',
  {
    id: text('id').primaryKey(),
    watchedBrandGroupId: text('watched_brand_group_id')
      .notNull()
      .references(() => watchedBrandGroups.id, { onDelete: 'cascade' }),
    /** Null = the group default. See the doc comment above. */
    watchedBrandId: text('watched_brand_id').references(() => watchedBrands.id, {
      onDelete: 'cascade',
    }),
    /** Set with `seller_ref`, null with `tax_number` — a firm is not marketplace-specific. */
    marketplaceCode: text('marketplace_code').references(() => marketplaces.code, { onDelete: 'cascade' }),
    sellerRef: text('seller_ref'),
    taxNumber: text('tax_number'),
    /** `authorised` | `blocked`. The third state is the absence of a row. */
    status: text('status').notNull(),
    /**
     * The operator's own words about why. Free text and nothing else — the product owner's
     * decision, 2026-08-27 (*"sadece not olsun yeterli"*): a date field and a document field
     * would look like a compliance record while being filled in inconsistently.
     */
    note: text('note'),
    createdAt: timestampMs('created_at').notNull(),
    updatedAt: timestampMs('updated_at').notNull(),
  },
  (t) => [
    index('seller_policies_scope').on(t.watchedBrandGroupId, t.watchedBrandId),
    index('seller_policies_seller').on(t.marketplaceCode, t.sellerRef),
    index('seller_policies_tax').on(t.taxNumber),
  ],
);

export const trackedProducts = pgTable(
  'tracked_products',
  {
    id: text('id').primaryKey(),
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    productRef: text('product_ref').notNull(),
    productUrl: text('product_url').notNull(),
    label: text('label').notNull(),
    isActive: bool('is_active').notNull(),
    addedAt: timestampMs('added_at').notNull(),
    watchedBrandId: text('watched_brand_id').references(() => watchedBrands.id, { onDelete: 'set null' }),
    viaBrandRef: bool('via_brand_ref').notNull().default(false),
    viaSearchTerm: bool('via_search_term').notNull().default(false),
    brandName: text('brand_name'),
    brandRef: text('brand_ref'),
    categoryRef: text('category_ref'),
    categoryName: text('category_name'),
    ratingCount: integer('rating_count'),
    ratingAverage: real('rating_average'),
    lastSweptAt: timestampMs('last_swept_at'),
    /**
     * Change detection for the per-product deep scrape (`ScrapeTrackedProducts`), added with
     * Faz 4 (2026-08-28).
     *
     * `tracked_product_observations` was written unconditionally while the tracked set was
     * operator-curated and small — a few dozen products. A brand sweep makes it a catalogue
     * (887 products for Whiskas, 4,863 for Royal Canin), and at one look a day with ~20 offers
     * each that is millions of rows a year, most of them recording that nothing moved.
     *
     * So the offer rows are written **only when the hash of the offer set differs from the
     * previous look's** — the same trade `scrape_runs.payload_hash` makes for
     * `competitor_observations`, computed by the same `hashOffers`. The series still
     * reconstructs exactly: each stored look holds until the next one.
     *
     * `lastScrapedAt` is what makes that safe to read. Without it the newest observation is the
     * only evidence of a look, and a product whose offers have not moved in a week would read
     * as one nobody has checked in a week. They are separate facts and are stored separately:
     * `lastScrapedAt` is when we last looked, the observation is what we last saw.
     */
    lastOffersHash: text('last_offers_hash'),
    lastScrapedAt: timestampMs('last_scraped_at'),
    /**
     * The manufacturer's barcode, and when the product page that stated it was read (Faz 8,
     * 2026-08-28).
     *
     * This is the **cross-marketplace matching key**. A brand owner's report has to say "these
     * two rows are the same product on two marketplaces", and nothing softer than a barcode can
     * say it: names differ by punctuation and pack size, brands are spelled differently, and
     * each marketplace's product id is private to it. A match built on a name is a report whose
     * rows are confidently wrong, which is worse than one with gaps.
     *
     * The two columns are separate because "we have never asked" and "we asked and the page
     * stated none" are different facts, exactly as `last_scraped_at` is separate from the
     * newest observation. `barcode_resolved_at` set with a null `barcode` is the second, and it
     * is what stops a backfill from asking the same hopeless product every night.
     *
     * Only the catalogue side fills these: Trendyol's card payload carries no barcode, so a
     * Trendyol row's barcode stays null until a source that states one exists.
     */
    barcode: text('barcode'),
    barcodeResolvedAt: timestampMs('barcode_resolved_at'),
    /**
     * How many times the backfill has asked about this product's barcode and failed (Faz 8).
     *
     * Failure does not set `barcode_resolved_at` — a failed read is not an answer, and recording
     * one would store "the page stated no barcode" for a page that was never successfully read.
     * But without this counter the work list, ordered by the freshest sweep, hands back the same
     * permanently-failing rows at the head of every run: a product whose page describes a
     * different article, or whose url now 404s, fails identically for ever. Five of those and a
     * run aborts on consecutive failures having made no progress at all, once an hour, until
     * somebody notices.
     *
     * So a failure costs the product its place in the queue rather than the queue its progress.
     * Ordering is by attempts first, and rows past `BARCODE_MAX_ATTEMPTS` drop off the list
     * entirely — visible as "asked and failed" in the coverage figures rather than hiding among
     * the products nobody has asked about yet.
     */
    barcodeAttempts: integer('barcode_attempts').notNull().default(0),
  },
  (t) => [
    uniqueIndex('tracked_products_marketplace_ref').on(t.marketplaceCode, t.productRef),
    index('tracked_products_watched_brand').on(t.watchedBrandId),
    index('tracked_products_barcode').on(t.barcode),
  ],
);

/** See the doc comment on `trackedProductObservations` in `schema/sqlite.ts`. */
export const trackedProductObservations = pgTable(
  'tracked_product_observations',
  {
    id: text('id').primaryKey(),
    trackedProductId: text('tracked_product_id')
      .notNull()
      .references(() => trackedProducts.id, { onDelete: 'cascade' }),
    observedAt: timestampMs('observed_at').notNull(),
    status: text('status').notNull(),
    rank: integer('rank'),
    sellerName: text('seller_name'),
    sellerRef: text('seller_ref'),
    price: money('price'),
    finalPrice: money('final_price'),
    offeredStock: integer('offered_stock'),
  },
  (t) => [index('tracked_product_observations_product_observed').on(t.trackedProductId, t.observedAt)],
);

/** See the doc comment on `trackedProductMetrics` in `schema/sqlite.ts`. */
export const trackedProductMetrics = pgTable(
  'tracked_product_metrics',
  {
    id: text('id').primaryKey(),
    trackedProductId: text('tracked_product_id')
      .notNull()
      .references(() => trackedProducts.id, { onDelete: 'cascade' }),
    observedAt: timestampMs('observed_at').notNull(),
    ratingCount: integer('rating_count'),
    ratingAverage: real('rating_average'),
  },
  (t) => [index('tracked_product_metrics_product_observed').on(t.trackedProductId, t.observedAt)],
);

export const priceSubmissions = pgTable(
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
    state: text('state').notNull(),
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

export const repricingState = pgTable(
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
    foreignKey({
      name: 'fk_repricing_state_pending_submission_id',
      columns: [t.pendingSubmissionId],
      foreignColumns: [priceSubmissions.id],
    }).onDelete('set null'),
  ],
);

export const updateBudgetUsage = pgTable(
  'update_budget_usage',
  {
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    usageDate: text('usage_date').notNull(),
    consumed: integer('consumed').notNull(),
    allowance: integer('allowance').notNull(),
  },
  (t) => [primaryKey({ columns: [t.marketplaceCode, t.usageDate] })],
);

export const jobQueue = pgTable(
  'job_queue',
  {
    id: text('id').primaryKey(),
    jobName: text('job_name').notNull(),
    payload: json('payload').notNull(),
    priority: integer('priority').notNull(),
    state: text('state').notNull(),
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

export const jobRuns = pgTable('job_runs', {
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

export const appEvents = pgTable(
  'app_events',
  {
    id: text('id').primaryKey(),
    at: timestampMs('at').notNull(),
    level: text('level').notNull(),
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
export const circuitBreakerState = pgTable('circuit_breaker_state', {
  marketplaceCode: text('marketplace_code')
    .primaryKey()
    .references(() => marketplaces.code, { onDelete: 'cascade' }),
  state: text('state').notNull(), // closed|open|half-open
  consecutiveFailures: integer('consecutive_failures').notNull(),
  openedAt: timestampMs('opened_at'),
  lastError: text('last_error'),
  updatedAt: timestampMs('updated_at').notNull(),
});

/** See the notes on these three tables in `schema/sqlite.ts`. */
export const alertRules = pgTable('alert_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  scopeType: text('scope_type').notNull(),
  scopeValue: text('scope_value'),
  subjectType: text('subject_type').notNull(),
  subjectValue: text('subject_value'),
  predicate: text('predicate').notNull(),
  thresholdType: text('threshold_type').notNull(),
  thresholdValue: money('threshold_value'),
  thresholdPct: integer('threshold_pct'),
  quietPeriodMs: integer('quiet_period_ms').notNull(),
  enabled: bool('enabled').notNull(),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

export const alerts = pgTable(
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
    sellerRef: text('seller_ref'),
    state: text('state').notNull(),
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

export const alertSellers = pgTable(
  'alert_sellers',
  {
    id: text('id').primaryKey(),
    alertId: text('alert_id')
      .notNull()
      .references(() => alerts.id, { onDelete: 'cascade' }),
    sellerRef: text('seller_ref'),
    sellerName: text('seller_name').notNull(),
    observedPrice: money('observed_price'),
    priceSource: text('price_source').notNull(),
    rank: integer('rank').notNull(),
    promotionText: text('promotion_text'),
    joinedAt: timestampMs('joined_at').notNull(),
    leftAt: timestampMs('left_at'),
  },
  (t) => [index('alert_sellers_alert').on(t.alertId)],
);
