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

/**
 * A brand owner's organisation — the level above a brand, because one owner routinely holds
 * several (Mars holds both Whiskas and Royal Canin; product owner's decision, 2026-08-28).
 *
 * Its own table rather than a nullable `group` string on `watched_brands`, because reports are
 * asked at *both* levels and they are different questions: "how does this seller behave on
 * Whiskas?" and "how does this seller behave across everything we own?" A denormalised label
 * could answer neither reliably once a group is renamed.
 */
export const watchedBrandGroups = sqliteTable('watched_brand_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  note: text('note'),
  createdAt: timestampMs('created_at').notNull(),
  updatedAt: timestampMs('updated_at').notNull(),
});

/**
 * One brand watched on one marketplace — the unit a catalogue sweep runs over
 * (api-references §1.7).
 *
 * **Not** the existing `brands` table, which is our own catalogue's taxonomy derived from
 * listings we sell. A watched brand is the opposite: mostly products we do not sell, on a
 * marketplace where we may have no presence at all. Sharing one table would mean a row's
 * meaning depended on which column happened to be null.
 *
 * Carries **both** selectors, and both are swept. `brandRef` is the marketplace's own brand id
 * and returns what the marketplace attributes to the brand; `searchTerm` also catches listings
 * that merely carry the name. Whiskas returned 887 products either way, but the search side
 * included 8 rows in categories like *Halı* and *Ahşap Boya & Vernik* — the difference is the
 * finding, which is why neither selector is allowed to be "the" one. At least one must be set;
 * the repository enforces that, since no dialect can express "at least one of two columns".
 */
export const watchedBrands = sqliteTable(
  'watched_brands',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => watchedBrandGroups.id, { onDelete: 'cascade' }),
    marketplaceCode: text('marketplace_code')
      .notNull()
      .references(() => marketplaces.code, { onDelete: 'cascade' }),
    /** Operator-facing name, e.g. `Whiskas`. Display only — never an identity. */
    label: text('label').notNull(),
    /** Trendyol `webBrands[].id`, e.g. `104703`. Null when only a search term is watched. */
    brandRef: text('brand_ref'),
    /** Free-text query, e.g. `whiskas`. Null when only the brand id is watched. */
    searchTerm: text('search_term'),
    isActive: bool('is_active').notNull(),
    /**
     * Whether this is a brand **we own** or a competitor's, watched for comparison (2026-09-03).
     *
     * The module was built on the assumption that a watched brand is one the operator is
     * responsible for, and every audit signal follows from that: "yasaklı satıcı satışta" and
     * "yetkili listesinde yok" are statements about *our* distribution agreements, and there is
     * no sense in which a competitor's brand has sellers who are unauthorised **by us**.
     *
     * The same sweep and the same deep scrape answer a different, genuinely useful question when
     * pointed at a rival: what does that brand charge, and how does ours sit against it. So the
     * flag does two things and both matter — it gates the audit off (a rival brand produces no
     * findings, rather than hundreds of meaningless ones on day one) and it marks the brand as a
     * comparison baseline.
     *
     * `true` by default, which is what every brand watched before this column existed was.
     */
    isOwnBrand: bool('is_own_brand').notNull().default(true),
    /**
     * Last completed sweep, and what it found. Kept here rather than derived from
     * `tracked_products` so the list screen can show "1.847 ürün, 3 saat önce" without counting
     * rows, and so a sweep that found nothing is distinguishable from one that never ran.
     */
    lastSweptAt: timestampMs('last_swept_at'),
    lastSweepProductCount: integer('last_sweep_product_count'),
    createdAt: timestampMs('created_at').notNull(),
    updatedAt: timestampMs('updated_at').notNull(),
  },
  (t) => [
    index('watched_brands_group').on(t.groupId),
    // One brand per marketplace per group. Two groups may legitimately watch the same brand.
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
export const competitorSellerIdentities = sqliteTable(
  'competitor_seller_identities',
  {
    id: text('id').primaryKey(),
    competitorSellerId: text('competitor_seller_id')
      .notNull()
      .references(() => competitorSellers.id, { onDelete: 'cascade' }),
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
    /**
     * The seller's listings on the product this was resolved through, as JSON: listing ref, item
     * ref, barcode, offered stock. JSON rather than a child table because nothing queries across
     * it — it is evidence attached to one resolution, read only when that resolution is displayed,
     * and it is replaced wholesale by the next one. A child table would invite a join that no
     * report wants and would make deleting an identity a two-step.
     *
     * ⚠️ Contains no price, no rank and no winner flag, because the port it comes from has none:
     * a merchant-scoped page's ordering is a preview, not the buybox (Faz 7 definition of done).
     */
    listingsJson: text('listings_json').notNull(),
    /** The URL actually fetched, carrying the `merchantId` that made the identity visible. */
    sourceUrl: text('source_url').notNull(),
    parserVersion: text('parser_version').notNull(),
    resolvedAt: timestampMs('resolved_at').notNull(),
  },
  (t) => [uniqueIndex('competitor_seller_identities_seller').on(t.competitorSellerId)],
);

/**
 * One operator statement about whether a seller may sell a brand we own (doc 06 §12.4, Faz 5).
 *
 * The verdict a row carries is `authorised` or `blocked`. The **third** state — `undefined` —
 * is the absence of a row, and it is a real state rather than a missing answer: "nobody has
 * looked at this seller yet" is not "this seller is unauthorised", and a design that stored
 * only two states would have to invent one of them for every seller that appears. The resolver
 * (`packages/core`, `resolveSellerPolicy`) returns all three.
 *
 * **Identity is account-level, policy is brand-level.** A seller is one marketplace account (or
 * one firm, by tax number); a rule is about that seller *and one brand*. The same firm is
 * routinely Whiskas' authorised distributor with no arrangement at all for Royal Canin — 21% of
 * Royal Canin's sellers were measured also selling Whiskas — so the overlap is the normal case.
 *
 * `watched_brand_id` null means the rule is the **group default**, applying to every brand in
 * the group that does not override it. Precedence, and why it runs the way it does, lives with
 * the resolver rather than here; this table only stores the statements.
 *
 * ## Two nullable identity columns and no unique index over them
 *
 * A rule names its seller by `(marketplace_code, seller_ref)` **or** by `tax_number`, never by
 * display name (doc 05 §5: names collide, change, and are chosen by the seller). Exactly one of
 * the two is set, which the repository enforces — the same shape and the same reason as
 * `watched_brands`' "at least one selector".
 *
 * There is deliberately **no unique index** on the identity. Every engine here treats `NULL` as
 * distinct in a unique index, so `unique(group, brand, marketplace, seller_ref)` would silently
 * permit two group defaults for the same seller — precisely the duplicate it appears to forbid,
 * and worse than no constraint because it reads as one. Uniqueness is enforced in
 * `seller-policies.ts` by matching the identity before writing.
 */
export const sellerPolicies = sqliteTable(
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

    /**
     * Which watched brand's sweep discovered this row, or `null` for one the operator added by
     * pasting a link. `set null` rather than `cascade`: removing a brand from the watch list is
     * a decision about *watching*, not a reason to destroy observation history the operator may
     * still be reading. The rows are simply no longer attributed to a brand.
     */
    watchedBrandId: text('watched_brand_id').references(() => watchedBrands.id, { onDelete: 'set null' }),
    /**
     * Which of the brand's two selectors found this product. Both, deliberately, rather than one
     * `discovered_via` enum: a product found by **both** and a product found by only one are
     * different facts, and "carries the brand's name but the marketplace does not attribute it
     * to the brand" — search-term only — is precisely the brand-abuse signal the audit exists to
     * surface (product owner's decision, 2026-08-28). Collapsing them into one column would
     * make that query impossible to write.
     *
     * Both false with a null `watched_brand_id` is a manually added product.
     */
    viaBrandRef: bool('via_brand_ref').notNull().default(false),
    viaSearchTerm: bool('via_search_term').notNull().default(false),

    /**
     * Catalogue metadata as the last sweep saw it. Denormalised onto the row on purpose: these
     * come free with the page that discovers the product, and a sweep that discarded them would
     * force a second full pass over the catalogue to recover them later.
     *
     * `brands`/`categories` (doc 05) hold *our own* catalogue's taxonomy, keyed to listings we
     * sell. A watched brand's products are not ours and mostly have no listing, so they are not
     * joined to those tables — the marketplace's own ref and name are carried verbatim instead.
     */
    brandName: text('brand_name'),
    /**
     * The marketplace's own brand id for this product, which is **not** necessarily the watched
     * brand's. A product found only by search term and attributed by the marketplace to some
     * other brand is the clearest form of the brand-name-misuse signal, and that comparison is
     * impossible without storing what the marketplace actually said.
     */
    brandRef: text('brand_ref'),
    categoryRef: text('category_ref'),
    categoryName: text('category_name'),
    /**
     * Rating count as of `last_swept_at`. `null` means unknown; `0` means genuinely unrated —
     * a distinction the dead-product suggestion depends on, since it acts on the second only.
     */
    ratingCount: integer('rating_count'),
    ratingAverage: real('rating_average'),
    /**
     * When a sweep last saw this product in its brand's catalogue. A row whose timestamp stops
     * advancing while its brand keeps sweeping has left the catalogue — delisted, renamed, or
     * re-attributed — which is a finding rather than a reason to delete the row.
     */
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
    /**
     * The brand owner's own recommended retail price for this product, in kuruş, and where it
     * came from (2026-09-03).
     *
     * **This is the only price on the brand side that is not an observation.** Every other price
     * figure the audit reports — piyasa sapması, makas, dönem bandı — is measured against
     * whoever happened to be on the page, which makes each of them an interpretation of a
     * sample. A recommended price is a *statement the brand owner made*, so a seller below it is
     * a `stated` finding in exactly the sense `audit-findings.ts` means: someone wrote it down,
     * and the seller is under it. That is the difference between "22% below the market" and "18%
     * below the price we published", and only the second is a thing an auditor can act on.
     *
     * **Operator-owned, like `competitor_sellers.tax_number`.** No sweep and no scrape writes
     * these: a marketplace has no idea what our list price is, and a value that a nightly job
     * could overwrite is one nobody would trust enough to write a notice from.
     *
     * `referencePriceSource` is free text — the file name or the price-list version the operator
     * imported, shown back beside the value so "where did this number come from" has an answer
     * on the screen rather than in someone's memory. `referencePriceUpdatedAt` dates it, because
     * a list price from four seasons ago is worse than none: it produces confident findings
     * about a price nobody sells at any more.
     */
    referencePrice: money('reference_price'),
    referencePriceSource: text('reference_price_source'),
    referencePriceUpdatedAt: timestampMs('reference_price_updated_at'),
    /**
     * Whether the last successful look found **anyone** selling this product, and when a seller
     * was last seen on it (2026-09-03).
     *
     * A brand owner's second question after price is *availability*: a product of theirs that no
     * marketplace seller carries is lost shelf, and until these columns existed the system could
     * not express it. An empty page stores no offer rows — there is nothing to store — so the
     * newest observation stayed the last look that *had* sellers, and a product abandoned three
     * weeks ago kept reporting its final seller set for ever.
     *
     * Written on every **successful** look, changed or not, exactly like `last_scraped_at`, and
     * deliberately **not** touched by a failed one: a page we could not read is not evidence
     * that nobody is selling. `null` means no successful look has happened yet, which is a third
     * state and not the same as `false`.
     *
     * A boolean column rather than a query over the archive because it is asked as a filter and
     * a count over a whole catalogue ("kaç ürünüm satıcısız?"), and answering that from
     * observations would mean a per-product correlated subquery on every screen that asks.
     */
    hasSellers: bool('has_sellers'),
    lastSellerSeenAt: timestampMs('last_seller_seen_at'),
  },
  (t) => [
    uniqueIndex('tracked_products_marketplace_ref').on(t.marketplaceCode, t.productRef),
    index('tracked_products_watched_brand').on(t.watchedBrandId),
    index('tracked_products_barcode').on(t.barcode),
  ],
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
    /**
     * `ok` | `noOffers` | `parseFailed` | `fetchFailed`.
     *
     * `noOffers` (2026-09-03) is a look that **succeeded and found nobody selling** — one row,
     * no seller, no price. It is not a failure and must never be read as one: a page we could
     * not fetch and a page with an empty seller list are opposite facts, and the second is the
     * lost-shelf signal a brand owner watches for. Every aggregate in `brand-reports.ts` filters
     * on `status = 'ok'`, so these rows stay out of the price and seller figures by construction
     * rather than by remembering to exclude them.
     */
    status: text('status').notNull(),
    rank: integer('rank'),
    sellerName: text('seller_name'),
    sellerRef: text('seller_ref'),
    price: money('price'),
    finalPrice: money('final_price'),
    offeredStock: integer('offered_stock'),
    /**
     * The rest of what the offer carried, added 2026-09-03 (marka denetimi genişletmesi).
     *
     * These fields were arriving on every `CompetitorOffer` and being dropped on the floor here
     * while `competitor_observations` beside them stored the same data. The asymmetry was an
     * accident of order — this table was written for a handful of hand-added products and never
     * caught up — and it cost the brand audit the two questions it is most often asked: *who is
     * cutting the price with a coupon rather than on the shelf*, and *who is holding the buybox
     * on something other than price*. Same request, same payload, no extra cost.
     *
     * All are **nullable, including `hasPromotion`**, which is where this differs from
     * `competitor_observations`. A failed look stores one status-only row here, and a `false`
     * on it would state "this offer had no promotion" about a page that was never read. `null`
     * is unknown; `false` is a page that was read and carried none.
     *
     * ⚠️ They do **not** open a new batch on their own. `hashOffers` keys on rank, seller,
     * price and final price only (measured, `scrape-competitors.ts`), so a coupon that appears
     * without moving any price is carried into the archive at the next stored look rather than
     * at the moment it appeared. Widening the key to these fields was measured to rewrite the
     * whole batch on stock churn alone; the fields describe the offer set of the look that was
     * stored, which is what every reader of this table already assumes.
     */
    /** 0–10 on Trendyol (`sellerScore.value`, guide §9). `null` when the payload had none. */
    sellerRating: real('seller_rating'),
    /** Days, and only where the payload states the unit (api-references §1.6, §2.11). */
    dispatchTime: integer('dispatch_time'),
    /** `null` on a failed look — see above. */
    hasPromotion: bool('has_promotion'),
    /** Verbatim, operator-facing display data. Never parsed (guide §19, §26). */
    promotionText: text('promotion_text'),
    /** The seller's own commercial listing id, distinct from `sellerRef` (guide §10). */
    listingRef: text('listing_ref'),
  },
  (t) => [index('tracked_product_observations_product_observed').on(t.trackedProductId, t.observedAt)],
);

/**
 * Rating count and average for a tracked product, over time — the sales-velocity proxy the
 * brand audit reads (doc 06). A brand owner cannot see anyone's unit sales; the rate at which a
 * product accumulates ratings is the closest public signal, and it is only a signal if the
 * series is kept.
 *
 * **Change-detected, unlike `tracked_product_observations`.** That table stores every offer of
 * every look because the tracked set was operator-curated and small. A brand sweep makes it
 * large — 887 products for Whiskas, 4,863 for Royal Canin, daily — so writing a row per product
 * per sweep would add millions of rows a year to say "nothing changed". A rating count moves
 * slowly and monotonically, so a row is written **only when the value differs from the previous
 * one**, and the series reconstructs exactly: the value held from each row's `observed_at`
 * until the next row.
 *
 * The price/seller side of a swept product is deliberately **not** here. A catalogue card names
 * only the buybox holder, and recording that as if it were the competition would understate
 * every product to one seller. Seller-level history stays with the per-product scrape
 * (`competitor_observations` / `tracked_product_observations`).
 */
export const trackedProductMetrics = sqliteTable(
  'tracked_product_metrics',
  {
    id: text('id').primaryKey(),
    trackedProductId: text('tracked_product_id')
      .notNull()
      .references(() => trackedProducts.id, { onDelete: 'cascade' }),
    observedAt: timestampMs('observed_at').notNull(),
    /** `null` means the sweep could not read a rating; `0` means genuinely unrated. */
    ratingCount: integer('rating_count'),
    ratingAverage: real('rating_average'),
  },
  (t) => [index('tracked_product_metrics_product_observed').on(t.trackedProductId, t.observedAt)],
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

/**
 * An audit finding that is **currently true**, and when it stopped being true (2026-09-03).
 *
 * A **state**, not a log line — the same distinction `alerts` draws next door, for the same
 * reason. "A blocked seller appeared on Whiskas" is an event; "a blocked seller is still on
 * Whiskas" is a condition, and only the second can be counted on a dashboard or notified about
 * once. Modelling this as an append-only log would make "how many findings are open right now"
 * unanswerable without replaying history, and would make "tell me when one *opens*" impossible
 * to place.
 *
 * ## Why a table at all, when findings are derived
 *
 * `deriveAuditFindings` recomputes everything from the archive on demand, and that is the right
 * design for a screen: changing a threshold re-answers the whole history. But a *notification*
 * needs one thing derivation cannot give — memory of what was already said. Without it, a
 * cadence job either notifies the same twelve findings every hour or notifies nothing.
 *
 * So this table stores no judgement, only bookkeeping: the finding's own stable `finding_key`
 * (the id `deriveAuditFindings` computes, which is stable across runs by construction), when it
 * was first and last seen, and whether anyone has been told. A row is never the source of truth
 * about whether a finding *holds* — the archive is, and a rerun that no longer produces the key
 * resolves the row.
 *
 * `finding_key` is deliberately **not unique**: a finding that clears and returns later is two
 * spans, and collapsing them would erase that it happened twice. At most one row per key is
 * `open` at a time, which the repository enforces when reconciling.
 *
 * `payload` is the finding as it stood when it opened, JSON. Held rather than looked up later
 * because `tracked_product_observations` is pruned at 90 days and the numbers behind an old
 * finding would otherwise simply vanish — the same argument `alerts.snapshot` makes.
 */
export const brandFindings = sqliteTable(
  'brand_findings',
  {
    id: text('id').primaryKey(),
    watchedBrandId: text('watched_brand_id')
      .notNull()
      .references(() => watchedBrands.id, { onDelete: 'cascade' }),
    /** `deriveAuditFindings`' own id — stable across runs, which is what makes this table work. */
    findingKey: text('finding_key').notNull(),
    kind: text('kind').notNull(),
    /** `stated` | `measured`. Copied so a notification can rank without re-deriving. */
    basis: text('basis').notNull(),
    state: text('state').notNull(), // 'open' | 'resolved'
    magnitude: real('magnitude').notNull(),
    firstSeenAt: timestampMs('first_seen_at').notNull(),
    lastSeenAt: timestampMs('last_seen_at').notNull(),
    resolvedAt: timestampMs('resolved_at'),
    /**
     * When someone was actually told. `null` on an open finding means nobody has been — either
     * because notification is off, or because the attempt failed. Separate from `first_seen_at`
     * precisely so a failed send is retried rather than silently counted as delivered.
     */
    notifiedAt: timestampMs('notified_at'),
    payload: json('payload').notNull(),
  },
  (t) => [
    index('brand_findings_brand_state').on(t.watchedBrandId, t.state),
    index('brand_findings_key_state').on(t.findingKey, t.state),
  ],
);
