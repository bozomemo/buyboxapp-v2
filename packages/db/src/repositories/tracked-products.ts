/**
 * Repositories for `tracked_products` and `tracked_product_observations` (doc 06 §12.2,
 * customer feedback 2026-08-25). See the doc comment on `trackedProducts` in
 * `schema/sqlite.ts` for why this is a wholly separate table from `listings` rather than a
 * listing row with the sale-facing fields left null.
 */
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  like,
  lte,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export interface TrackedProductRow {
  readonly id: string;
  readonly marketplaceCode: string;
  readonly productRef: string;
  readonly productUrl: string;
  readonly label: string;
  readonly isActive: boolean;
  readonly addedAt: number;
  readonly watchedBrandId?: string | null;
  readonly viaBrandRef?: boolean;
  readonly viaSearchTerm?: boolean;
  readonly brandName?: string | null;
  readonly brandRef?: string | null;
  readonly categoryRef?: string | null;
  readonly categoryName?: string | null;
  readonly ratingCount?: number | null;
  readonly ratingAverage?: number | null;
  readonly lastSweptAt?: number | null;
  /** Hash of the last stored offer set — see `recordTrackedProductLook`. */
  readonly lastOffersHash?: string | null;
  /** When the deep scrape last *looked*, which is not when it last *stored* anything. */
  readonly lastScrapedAt?: number | null;
  /**
   * Whether the last successful look found anyone selling, and when a seller was last seen.
   * `null` means no successful look yet — a third state, not `false`.
   */
  readonly hasSellers?: boolean | null;
  readonly lastSellerSeenAt?: number | null;
  readonly barcode?: string | null;
  /**
   * The brand owner's own recommended retail price, in kuruş, and where it came from
   * (2026-09-03). Operator-owned: no sweep or scrape writes these. See the column's doc comment
   * in `schema/sqlite.ts` for why this is the only price on the brand side that is a statement
   * rather than an observation.
   */
  readonly referencePrice?: bigint | null;
  readonly referencePriceSource?: string | null;
  readonly referencePriceUpdatedAt?: number | null;
}

/**
 * One product as a completed brand sweep saw it — the input to `upsertSweptProducts`.
 *
 * `viaBrandRef` / `viaSearchTerm` are the **union across both of the sweep's passes**, computed
 * by the caller before it writes. They are stored absolutely rather than OR'd into whatever was
 * there before, which is the whole point: a product that used to be attributed to the brand by
 * the marketplace and now is only found by name has *changed*, and an accumulating flag would
 * hide exactly that transition.
 */
export interface SweptProduct {
  readonly id: string;
  readonly marketplaceCode: string;
  readonly productRef: string;
  readonly productUrl: string;
  readonly label: string;
  readonly watchedBrandId: string;
  readonly viaBrandRef: boolean;
  readonly viaSearchTerm: boolean;
  readonly brandName: string | null;
  readonly brandRef: string | null;
  readonly categoryRef: string | null;
  readonly categoryName: string | null;
  readonly ratingCount: number | null;
  readonly ratingAverage: number | null;
  readonly sweptAt: number;
}

/**
 * Writes a completed sweep's products, inserting what is new and refreshing what is not.
 *
 * The ensure/update split follows `recordSeenSellers`' reasoning: some columns belong to the
 * sweep and some belong to the operator, and a sweep that overwrote the second kind would
 * silently undo a person's decision.
 *
 * | Column | On conflict | Why |
 * |---|---|---|
 * | `label` | **kept** | The operator may have renamed a product they added by link; the sweep's name is only a starting value |
 * | `is_active` | **kept** | Deactivating a product is an operator decision, and a nightly sweep must not resurrect it |
 * | `added_at` | **kept** | Earliest evidence we hold, same rule as `first_seen_at` |
 * | `watched_brand_id` | overwritten | Attribution follows the sweep that found it |
 * | `via_*`, category, rating, `product_url`, `last_swept_at` | overwritten | Sweep-owned observations of the marketplace's current state |
 *
 * Rows are inserted in chunks because a full brand is thousands of products (4,863 for Royal
 * Canin) and every driver has a parameter ceiling well below one statement of that size.
 */
export async function upsertSweptProducts(
  appDb: AppDatabase,
  products: readonly SweptProduct[],
): Promise<void> {
  if (products.length === 0) return;

  // Collapse duplicates within the batch: the same product legitimately appears in both of a
  // brand's passes, and an INSERT carrying the unique key twice fails on MySQL and Postgres
  // before the conflict clause is ever reached.
  const deduped = new Map<string, SweptProduct>();
  for (const product of products) {
    const key = `${product.marketplaceCode}::${product.productRef}`;
    const existing = deduped.get(key);
    deduped.set(
      key,
      existing === undefined
        ? product
        : // Two passes found it: the flags are the union, everything else is identical.
          {
            ...product,
            viaBrandRef: existing.viaBrandRef || product.viaBrandRef,
            viaSearchTerm: existing.viaSearchTerm || product.viaSearchTerm,
          },
    );
  }

  const rows = [...deduped.values()].map((product) => ({
    id: product.id,
    marketplaceCode: product.marketplaceCode,
    productRef: product.productRef,
    productUrl: product.productUrl,
    label: product.label,
    isActive: true,
    addedAt: product.sweptAt,
    watchedBrandId: product.watchedBrandId,
    viaBrandRef: product.viaBrandRef,
    viaSearchTerm: product.viaSearchTerm,
    brandName: product.brandName,
    brandRef: product.brandRef,
    categoryRef: product.categoryRef,
    categoryName: product.categoryName,
    ratingCount: product.ratingCount,
    ratingAverage: product.ratingAverage,
    lastSweptAt: product.sweptAt,
  }));

  const CHUNK = 200;
  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    await runDialect(appDb, {
      sqlite: (db) =>
        db
          .insert(sqliteSchema.trackedProducts)
          .values(chunk)
          .onConflictDoUpdate({
            target: [sqliteSchema.trackedProducts.marketplaceCode, sqliteSchema.trackedProducts.productRef],
            set: {
              productUrl: sql`excluded.product_url`,
              watchedBrandId: sql`excluded.watched_brand_id`,
              viaBrandRef: sql`excluded.via_brand_ref`,
              viaSearchTerm: sql`excluded.via_search_term`,
              brandName: sql`excluded.brand_name`,
              brandRef: sql`excluded.brand_ref`,
              categoryRef: sql`excluded.category_ref`,
              categoryName: sql`excluded.category_name`,
              ratingCount: sql`excluded.rating_count`,
              ratingAverage: sql`excluded.rating_average`,
              lastSweptAt: sql`excluded.last_swept_at`,
            },
          }),
      postgres: (db) =>
        db
          .insert(postgresSchema.trackedProducts)
          .values(chunk)
          .onConflictDoUpdate({
            target: [
              postgresSchema.trackedProducts.marketplaceCode,
              postgresSchema.trackedProducts.productRef,
            ],
            set: {
              productUrl: sql`excluded.product_url`,
              watchedBrandId: sql`excluded.watched_brand_id`,
              viaBrandRef: sql`excluded.via_brand_ref`,
              viaSearchTerm: sql`excluded.via_search_term`,
              brandName: sql`excluded.brand_name`,
              brandRef: sql`excluded.brand_ref`,
              categoryRef: sql`excluded.category_ref`,
              categoryName: sql`excluded.category_name`,
              ratingCount: sql`excluded.rating_count`,
              ratingAverage: sql`excluded.rating_average`,
              lastSweptAt: sql`excluded.last_swept_at`,
            },
          }),
      mysql: (db) =>
        db
          .insert(mysqlSchema.trackedProducts)
          .values(chunk)
          .onDuplicateKeyUpdate({
            set: {
              productUrl: sql`values(product_url)`,
              watchedBrandId: sql`values(watched_brand_id)`,
              viaBrandRef: sql`values(via_brand_ref)`,
              viaSearchTerm: sql`values(via_search_term)`,
              brandName: sql`values(brand_name)`,
              brandRef: sql`values(brand_ref)`,
              categoryRef: sql`values(category_ref)`,
              categoryName: sql`values(category_name)`,
              ratingCount: sql`values(rating_count)`,
              ratingAverage: sql`values(rating_average)`,
              lastSweptAt: sql`values(last_swept_at)`,
            },
          }),
    });
  }
}

export async function addTrackedProduct(appDb: AppDatabase, row: TrackedProductRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.trackedProducts).values(row),
    postgres: (db) => db.insert(postgresSchema.trackedProducts).values(row),
    mysql: (db) => db.insert(mysqlSchema.trackedProducts).values(row),
  });
}

export async function listTrackedProducts(
  appDb: AppDatabase,
  options: { activeOnly?: boolean } = {},
): Promise<TrackedProductRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.trackedProducts)
        .where(options.activeOnly ? eq(sqliteSchema.trackedProducts.isActive, true) : undefined),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.trackedProducts)
        .where(options.activeOnly ? eq(postgresSchema.trackedProducts.isActive, true) : undefined),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.trackedProducts)
        .where(options.activeOnly ? eq(mysqlSchema.trackedProducts.isActive, true) : undefined),
  });
}

export async function findTrackedProductByRef(
  appDb: AppDatabase,
  marketplaceCode: string,
  productRef: string,
): Promise<TrackedProductRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.trackedProducts)
          .where(
            and(
              eq(sqliteSchema.trackedProducts.marketplaceCode, marketplaceCode),
              eq(sqliteSchema.trackedProducts.productRef, productRef),
            ),
          )
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.trackedProducts)
          .where(
            and(
              eq(postgresSchema.trackedProducts.marketplaceCode, marketplaceCode),
              eq(postgresSchema.trackedProducts.productRef, productRef),
            ),
          )
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.trackedProducts)
          .where(
            and(
              eq(mysqlSchema.trackedProducts.marketplaceCode, marketplaceCode),
              eq(mysqlSchema.trackedProducts.productRef, productRef),
            ),
          )
      )[0],
  });
}

export async function getTrackedProduct(
  appDb: AppDatabase,
  id: string,
): Promise<TrackedProductRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db.select().from(sqliteSchema.trackedProducts).where(eq(sqliteSchema.trackedProducts.id, id))
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.trackedProducts)
          .where(eq(postgresSchema.trackedProducts.id, id))
      )[0],
    mysql: async (db) =>
      (await db.select().from(mysqlSchema.trackedProducts).where(eq(mysqlSchema.trackedProducts.id, id)))[0],
  });
}

/** Set by the operator removing a tracked product from the list (doc 06 §12.2) — a hard
 * delete, since its observation history has no other purpose once tracking stops. */
export async function deleteTrackedProduct(appDb: AppDatabase, id: string): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.trackedProducts).where(eq(sqliteSchema.trackedProducts.id, id)),
    postgres: (db) =>
      db.delete(postgresSchema.trackedProducts).where(eq(postgresSchema.trackedProducts.id, id)),
    mysql: (db) => db.delete(mysqlSchema.trackedProducts).where(eq(mysqlSchema.trackedProducts.id, id)),
  });
}

export interface TrackedProductObservationRow {
  readonly id: string;
  readonly trackedProductId: string;
  readonly observedAt: number;
  /** `noOffers` is a look that succeeded and found nobody selling — never a failure. */
  readonly status: 'ok' | 'noOffers' | 'parseFailed' | 'fetchFailed';
  readonly rank: number | null;
  readonly sellerName: string | null;
  readonly sellerRef: string | null;
  readonly price: bigint | null;
  readonly finalPrice: bigint | null;
  readonly offeredStock: number | null;
  /**
   * The rest of the offer (2026-09-03). Optional on the interface rather than required-nullable
   * so the rows written before the columns existed, and the fixtures built by hand, keep
   * type-checking — `undefined` here means "this caller had nothing to say", which the insert
   * turns into the same `NULL` a read gives back. The scrape always sets all five.
   */
  readonly sellerRating?: number | null;
  readonly dispatchTime?: number | null;
  readonly hasPromotion?: boolean | null;
  readonly promotionText?: string | null;
  readonly listingRef?: string | null;
}

/**
 * Inserts offer rows verbatim, one per offer (or one status-only row on failure).
 *
 * Callers that scrape should use `recordTrackedProductLook` instead, which decides whether the
 * look is worth storing at all. This stays exported for the paths that already know the answer
 * — a failure row, a backfill, a test fixture.
 */
export async function insertTrackedProductObservations(
  appDb: AppDatabase,
  rows: readonly TrackedProductObservationRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.trackedProductObservations).values([...rows]),
    postgres: (db) => db.insert(postgresSchema.trackedProductObservations).values([...rows]),
    mysql: (db) => db.insert(mysqlSchema.trackedProductObservations).values([...rows]),
  });
}

/**
 * One completed look at one tracked product: the offers, and whether they differ from last time.
 *
 * `offersHash` is `null` for a **failed** look. A failure is always stored (its status row is
 * the record that we tried and could not read the page) and never touches the stored hash — if
 * a fetch failure cleared it, the next successful look would look like a change and store a
 * duplicate offer set, turning every transient network error into a fake price event.
 */
export interface TrackedProductLook {
  readonly trackedProductId: string;
  readonly observedAt: number;
  readonly offersHash: string | null;
  readonly rows: readonly TrackedProductObservationRow[];
}

/**
 * Stores a look, writing its offer rows **only when the offer set actually changed** (Faz 4,
 * 2026-08-28) — the `scrape_runs.payload_hash` trade from `competitor_observations`, applied
 * here now that a brand sweep can put thousands of products behind this job rather than the
 * few dozen the table was designed around. See the doc comment on `trackedProducts.lastOffersHash`.
 *
 * Always advances `last_scraped_at`, changed or not: "we looked" and "we saw something new" are
 * different facts, and a screen that reads the newest observation as the last look would report
 * a stable product as an unchecked one.
 *
 * `last_scraped_at` is guarded rather than assigned, like `competitor_sellers.last_seen_at`:
 * scrapes can finish out of order (a retry of an older cycle landing after a newer one), and a
 * "last looked at" that goes backwards would make the staleness reading oscillate. The hash is
 * written unguarded — it describes the rows just stored, and on the out-of-order path the newer
 * look has already stored its own.
 *
 * Returns whether anything was stored, so a caller can count real changes rather than looks.
 */
export async function recordTrackedProductLook(
  appDb: AppDatabase,
  look: TrackedProductLook,
): Promise<{ readonly changed: boolean }> {
  const previous = await getTrackedProduct(appDb, look.trackedProductId);
  // An unknown product is a caller bug, not a silent no-op: the FK would reject the rows anyway.
  if (!previous) {
    throw new Error(`recordTrackedProductLook: unknown tracked product ${look.trackedProductId}`);
  }

  const failed = look.offersHash === null;
  const changed = failed || look.offersHash !== (previous.lastOffersHash ?? null);

  /**
   * Availability, derived from the look's own rows rather than from what was stored.
   *
   * It has to be the rows, because a look whose offer set has not moved stores nothing at all —
   * and "we looked and the same three sellers were there" is exactly the case where the flag
   * must stay `true`. Read off `look.rows` it is correct whether or not the batch was written.
   *
   * A **failed** look leaves both fields alone. A page we could not read is not evidence that
   * nobody is selling, and writing `false` there would turn every network blip into a
   * lost-shelf finding.
   */
  const hasSellers = failed ? null : look.rows.some((row) => row.status === 'ok');

  if (changed) {
    await insertTrackedProductObservations(appDb, look.rows);
  }

  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.trackedProducts)
        .set({
          lastScrapedAt: sql`max(coalesce(${sqliteSchema.trackedProducts.lastScrapedAt}, 0), ${look.observedAt})`,
          ...(failed ? {} : { lastOffersHash: look.offersHash }),
          ...(hasSellers === null ? {} : { hasSellers }),
          // Only ever moves forward, and only on a look that saw somebody: this is
          // "when was a seller last on the page", not "when did we last look". Guarded
          // like `lastScrapedAt`, because a retry of an older cycle can land after a
          // newer one and a timestamp that goes backwards makes the age oscillate.
          ...(hasSellers
            ? {
                lastSellerSeenAt: sql`max(coalesce(${sqliteSchema.trackedProducts.lastSellerSeenAt}, 0), ${look.observedAt})`,
              }
            : {}),
        })
        .where(eq(sqliteSchema.trackedProducts.id, look.trackedProductId)),
    postgres: (db) =>
      db
        .update(postgresSchema.trackedProducts)
        .set({
          lastScrapedAt: sql`greatest(coalesce(${postgresSchema.trackedProducts.lastScrapedAt}, 0), ${look.observedAt})`,
          ...(failed ? {} : { lastOffersHash: look.offersHash }),
          ...(hasSellers === null ? {} : { hasSellers }),
          // Only ever moves forward, and only on a look that saw somebody: this is
          // "when was a seller last on the page", not "when did we last look". Guarded
          // like `lastScrapedAt`, because a retry of an older cycle can land after a
          // newer one and a timestamp that goes backwards makes the age oscillate.
          ...(hasSellers
            ? {
                lastSellerSeenAt: sql`greatest(coalesce(${postgresSchema.trackedProducts.lastSellerSeenAt}, 0), ${look.observedAt})`,
              }
            : {}),
        })
        .where(eq(postgresSchema.trackedProducts.id, look.trackedProductId)),
    mysql: (db) =>
      db
        .update(mysqlSchema.trackedProducts)
        .set({
          lastScrapedAt: sql`greatest(coalesce(${mysqlSchema.trackedProducts.lastScrapedAt}, 0), ${look.observedAt})`,
          ...(failed ? {} : { lastOffersHash: look.offersHash }),
          ...(hasSellers === null ? {} : { hasSellers }),
          // Only ever moves forward, and only on a look that saw somebody: this is
          // "when was a seller last on the page", not "when did we last look". Guarded
          // like `lastScrapedAt`, because a retry of an older cycle can land after a
          // newer one and a timestamp that goes backwards makes the age oscillate.
          ...(hasSellers
            ? {
                lastSellerSeenAt: sql`greatest(coalesce(${mysqlSchema.trackedProducts.lastSellerSeenAt}, 0), ${look.observedAt})`,
              }
            : {}),
        })
        .where(eq(mysqlSchema.trackedProducts.id, look.trackedProductId)),
  });

  return { changed };
}

/**
 * Every offer of every look since `sinceMs`, oldest first — the detail screen's whole payload
 * (doc 06 §12.2): the newest look is its "all sellers now" table and the looks before it are the
 * per-seller price history.
 *
 * Reading the window in one query rather than a look-at-a-time is what makes the per-seller
 * series possible at all: a seller that disappears from the page has no row in the newer looks,
 * and there is no other way to notice that than to have the older ones in hand. The window is
 * the caller's to bound; the tracked set is operator-curated and small (see the doc comment on
 * `trackedProductObservations` in `schema/sqlite.ts`).
 */
export async function trackedProductObservationsSince(
  appDb: AppDatabase,
  trackedProductId: string,
  sinceMs: number,
): Promise<TrackedProductObservationRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.trackedProductObservations)
        .where(
          and(
            eq(sqliteSchema.trackedProductObservations.trackedProductId, trackedProductId),
            gte(sqliteSchema.trackedProductObservations.observedAt, sinceMs),
          ),
        )
        .orderBy(
          asc(sqliteSchema.trackedProductObservations.observedAt),
          asc(sqliteSchema.trackedProductObservations.rank),
        ),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.trackedProductObservations)
        .where(
          and(
            eq(postgresSchema.trackedProductObservations.trackedProductId, trackedProductId),
            gte(postgresSchema.trackedProductObservations.observedAt, sinceMs),
          ),
        )
        .orderBy(
          asc(postgresSchema.trackedProductObservations.observedAt),
          asc(postgresSchema.trackedProductObservations.rank),
        ),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.trackedProductObservations)
        .where(
          and(
            eq(mysqlSchema.trackedProductObservations.trackedProductId, trackedProductId),
            gte(mysqlSchema.trackedProductObservations.observedAt, sinceMs),
          ),
        )
        .orderBy(
          asc(mysqlSchema.trackedProductObservations.observedAt),
          asc(mysqlSchema.trackedProductObservations.rank),
        ),
  }) as Promise<TrackedProductObservationRow[]>;
}

/** The latest look's offers (or its lone failure row) — the list screen's "current price/rank". */
export async function latestTrackedProductObservations(
  appDb: AppDatabase,
  trackedProductId: string,
): Promise<TrackedProductObservationRow[]> {
  return withDialect(appDb, {
    sqlite: async (db) => {
      const latest = (
        await db
          .select({ observedAt: sqliteSchema.trackedProductObservations.observedAt })
          .from(sqliteSchema.trackedProductObservations)
          .where(eq(sqliteSchema.trackedProductObservations.trackedProductId, trackedProductId))
          .orderBy(desc(sqliteSchema.trackedProductObservations.observedAt))
          .limit(1)
      )[0];
      if (!latest) return [];
      return db
        .select()
        .from(sqliteSchema.trackedProductObservations)
        .where(
          and(
            eq(sqliteSchema.trackedProductObservations.trackedProductId, trackedProductId),
            eq(sqliteSchema.trackedProductObservations.observedAt, latest.observedAt),
          ),
        )
        .orderBy(sqliteSchema.trackedProductObservations.rank);
    },
    postgres: async (db) => {
      const latest = (
        await db
          .select({ observedAt: postgresSchema.trackedProductObservations.observedAt })
          .from(postgresSchema.trackedProductObservations)
          .where(eq(postgresSchema.trackedProductObservations.trackedProductId, trackedProductId))
          .orderBy(desc(postgresSchema.trackedProductObservations.observedAt))
          .limit(1)
      )[0];
      if (!latest) return [];
      return db
        .select()
        .from(postgresSchema.trackedProductObservations)
        .where(
          and(
            eq(postgresSchema.trackedProductObservations.trackedProductId, trackedProductId),
            eq(postgresSchema.trackedProductObservations.observedAt, latest.observedAt),
          ),
        )
        .orderBy(postgresSchema.trackedProductObservations.rank);
    },
    mysql: async (db) => {
      const latest = (
        await db
          .select({ observedAt: mysqlSchema.trackedProductObservations.observedAt })
          .from(mysqlSchema.trackedProductObservations)
          .where(eq(mysqlSchema.trackedProductObservations.trackedProductId, trackedProductId))
          .orderBy(desc(mysqlSchema.trackedProductObservations.observedAt))
          .limit(1)
      )[0];
      if (!latest) return [];
      return db
        .select()
        .from(mysqlSchema.trackedProductObservations)
        .where(
          and(
            eq(mysqlSchema.trackedProductObservations.trackedProductId, trackedProductId),
            eq(mysqlSchema.trackedProductObservations.observedAt, latest.observedAt),
          ),
        )
        .orderBy(mysqlSchema.trackedProductObservations.rank);
    },
  }) as Promise<TrackedProductObservationRow[]>;
}

/**
 * Retention for `tracked_product_observations` (doc 05 §10).
 *
 * This table had no window until 2026-08-26 and grew without bound. It is written more densely
 * than `competitor_observations`, not less: there is no change-detection hash here, so **every**
 * offer of **every** successful look is stored (doc 05 §5 explains why that trade is acceptable
 * for a small, operator-curated set). The detail screen also reads a whole 30-day window per
 * view, so the window bounds a read cost as well as a write one.
 *
 * There is no proof-of-look row to preserve here, unlike `scrape_runs` — a failed look writes
 * its own row in this same table — so pruning is a plain cutoff.
 */
export async function pruneTrackedProductObservations(appDb: AppDatabase, cutoffMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .delete(sqliteSchema.trackedProductObservations)
        .where(lte(sqliteSchema.trackedProductObservations.observedAt, cutoffMs)),
    postgres: (db) =>
      db
        .delete(postgresSchema.trackedProductObservations)
        .where(lte(postgresSchema.trackedProductObservations.observedAt, cutoffMs)),
    mysql: (db) =>
      db
        .delete(mysqlSchema.trackedProductObservations)
        .where(lte(mysqlSchema.trackedProductObservations.observedAt, cutoffMs)),
  });
}

// --------------------------------------------------------------- rating history (doc 06)

export interface TrackedProductMetricRow {
  readonly id: string;
  readonly trackedProductId: string;
  readonly observedAt: number;
  readonly ratingCount: number | null;
  readonly ratingAverage: number | null;
}

/** Chunk size for `IN (...)` lookups — the same ceiling `upsertSweptProducts` writes at. */
const LOOKUP_CHUNK = 200;

/**
 * The tracked-product rows for a set of marketplace product refs, keyed by ref.
 *
 * Exists so a sweep can tell what it is about to change *before* it changes it: the rating
 * history's change detection compares the incoming count against the one already on the row,
 * and `tracked_products.rating_count` is the cheapest place that value lives. Chunked, because
 * a brand is thousands of refs and every driver has a parameter ceiling well below that.
 */
export async function findTrackedProductsByRefs(
  appDb: AppDatabase,
  marketplaceCode: string,
  productRefs: readonly string[],
): Promise<Map<string, TrackedProductRow>> {
  const found = new Map<string, TrackedProductRow>();
  for (let start = 0; start < productRefs.length; start += LOOKUP_CHUNK) {
    const chunk = productRefs.slice(start, start + LOOKUP_CHUNK);
    if (chunk.length === 0) continue;
    const rows = (await withDialect(appDb, {
      sqlite: (db) =>
        db
          .select()
          .from(sqliteSchema.trackedProducts)
          .where(
            and(
              eq(sqliteSchema.trackedProducts.marketplaceCode, marketplaceCode),
              inArray(sqliteSchema.trackedProducts.productRef, chunk),
            ),
          ),
      postgres: (db) =>
        db
          .select()
          .from(postgresSchema.trackedProducts)
          .where(
            and(
              eq(postgresSchema.trackedProducts.marketplaceCode, marketplaceCode),
              inArray(postgresSchema.trackedProducts.productRef, chunk),
            ),
          ),
      mysql: (db) =>
        db
          .select()
          .from(mysqlSchema.trackedProducts)
          .where(
            and(
              eq(mysqlSchema.trackedProducts.marketplaceCode, marketplaceCode),
              inArray(mysqlSchema.trackedProducts.productRef, chunk),
            ),
          ),
    })) as TrackedProductRow[];
    for (const row of rows) found.set(row.productRef, row);
  }
  return found;
}

export interface MetricSample {
  readonly id: string;
  readonly trackedProductId: string;
  readonly observedAt: number;
  readonly ratingCount: number | null;
  readonly ratingAverage: number | null;
  /**
   * The count already on the product row, before this sweep overwrote it. `undefined` for a
   * product this sweep is seeing for the first time.
   */
  readonly previousRatingCount: number | null | undefined;
}

/**
 * Appends rating history, writing **only** the samples whose count actually moved.
 *
 * This is the change detection the brand sweep needs to stay affordable. A daily sweep over two
 * brands is ~5,750 products; storing a row each would be over two million rows a year, almost
 * all of them saying "unchanged". A rating count moves slowly, so writing only transitions
 * collapses that by orders of magnitude and loses nothing: the series is a step function, and
 * each row's value holds until the next row.
 *
 * A product's **first** sample is always written when it has a readable count, so a series
 * starts at a known point rather than at whatever the second reading happened to be.
 *
 * A sample whose count is `null` is never written: that is our failure to read the page, not an
 * event in the product's life, and recording it would put a fake dip in every series.
 */
export async function recordTrackedProductMetrics(
  appDb: AppDatabase,
  samples: readonly MetricSample[],
): Promise<number> {
  const changed = samples.filter(
    (sample) => sample.ratingCount !== null && sample.ratingCount !== sample.previousRatingCount,
  );
  if (changed.length === 0) return 0;

  const rows = changed.map((sample) => ({
    id: sample.id,
    trackedProductId: sample.trackedProductId,
    observedAt: sample.observedAt,
    ratingCount: sample.ratingCount,
    ratingAverage: sample.ratingAverage,
  }));

  for (let start = 0; start < rows.length; start += LOOKUP_CHUNK) {
    const chunk = rows.slice(start, start + LOOKUP_CHUNK);
    await runDialect(appDb, {
      sqlite: (db) => db.insert(sqliteSchema.trackedProductMetrics).values(chunk),
      postgres: (db) => db.insert(postgresSchema.trackedProductMetrics).values(chunk),
      mysql: (db) => db.insert(mysqlSchema.trackedProductMetrics).values(chunk),
    });
  }
  return rows.length;
}

/** One product's rating series since `sinceMs`, oldest first — the detail screen's sparkline. */
export async function trackedProductMetricsSince(
  appDb: AppDatabase,
  trackedProductId: string,
  sinceMs: number,
): Promise<TrackedProductMetricRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.trackedProductMetrics)
        .where(
          and(
            eq(sqliteSchema.trackedProductMetrics.trackedProductId, trackedProductId),
            gte(sqliteSchema.trackedProductMetrics.observedAt, sinceMs),
          ),
        )
        .orderBy(asc(sqliteSchema.trackedProductMetrics.observedAt)),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.trackedProductMetrics)
        .where(
          and(
            eq(postgresSchema.trackedProductMetrics.trackedProductId, trackedProductId),
            gte(postgresSchema.trackedProductMetrics.observedAt, sinceMs),
          ),
        )
        .orderBy(asc(postgresSchema.trackedProductMetrics.observedAt)),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.trackedProductMetrics)
        .where(
          and(
            eq(mysqlSchema.trackedProductMetrics.trackedProductId, trackedProductId),
            gte(mysqlSchema.trackedProductMetrics.observedAt, sinceMs),
          ),
        )
        .orderBy(asc(mysqlSchema.trackedProductMetrics.observedAt)),
  }) as Promise<TrackedProductMetricRow[]>;
}

/**
 * Retention for `tracked_product_metrics` (doc 05 §10).
 *
 * A plain cutoff, like the observations next door. It costs the early part of a series, which
 * is the correct trade: the audit asks "is this product moving *now*", and a rating count from
 * beyond the window answers a question nobody is asking.
 */
export async function pruneTrackedProductMetrics(appDb: AppDatabase, cutoffMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .delete(sqliteSchema.trackedProductMetrics)
        .where(lte(sqliteSchema.trackedProductMetrics.observedAt, cutoffMs)),
    postgres: (db) =>
      db
        .delete(postgresSchema.trackedProductMetrics)
        .where(lte(postgresSchema.trackedProductMetrics.observedAt, cutoffMs)),
    mysql: (db) =>
      db
        .delete(mysqlSchema.trackedProductMetrics)
        .where(lte(mysqlSchema.trackedProductMetrics.observedAt, cutoffMs)),
  });
}

// --------------------------------------------------- the grid's paged query (doc 06, R-UI-5)

/**
 * Filters for the tracked-products grid. Composed structurally into `and()`/`eq()`/`like()`
 * predicates — never concatenated into SQL (doc 09 §20), the same rule `queryListings` follows.
 *
 * Tri-state booleans: `undefined` means "any", `true`/`false` mean exactly that.
 */
export interface TrackedProductQueryOptions {
  readonly watchedBrandId?: string;
  readonly marketplaceCode?: string;
  /** Structural text search over the product's label and its marketplace ref. */
  readonly text?: string;
  readonly categoryRef?: string;
  readonly isActive?: boolean;
  /**
   * Products the brand's **search term** found but its **brand id** did not — the marketplace
   * does not attribute them to the brand, yet they carry its name. This is the brand-misuse
   * shortlist, and it is a filter rather than a separate report because the operator needs it
   * beside every other column to judge it (api-references §1.7).
   */
  readonly searchTermOnly?: boolean;
  /** Products the marketplace itself reports as never rated (`rating_count = 0`). */
  readonly unratedOnly?: boolean;
  /**
   * Products whose last successful look found **nobody selling** — the lost-shelf shortlist.
   *
   * `= false`, never `is null`: a product the rotation has not reached yet has no sellers *that
   * we know of*, which is not the same claim and must not appear on a list an operator acts on.
   */
  readonly noSellerOnly?: boolean;
  readonly minRatingCount?: number;
  readonly sort?: 'label' | 'ratingCount' | 'categoryName' | 'lastSweptAt' | 'addedAt';
  readonly sortDir?: 'asc' | 'desc';
  readonly limit: number;
  readonly offset: number;
}

type TrackedSchema =
  | typeof sqliteSchema.trackedProducts
  | typeof postgresSchema.trackedProducts
  | typeof mysqlSchema.trackedProducts;

function buildTrackedWhere(t: TrackedSchema, options: TrackedProductQueryOptions) {
  const parts = [];
  if (options.watchedBrandId !== undefined) parts.push(eq(t.watchedBrandId, options.watchedBrandId));
  if (options.marketplaceCode !== undefined) parts.push(eq(t.marketplaceCode, options.marketplaceCode));
  if (options.categoryRef !== undefined) parts.push(eq(t.categoryRef, options.categoryRef));
  if (options.isActive !== undefined) parts.push(eq(t.isActive, options.isActive));
  if (options.searchTermOnly) {
    parts.push(and(eq(t.viaSearchTerm, true), eq(t.viaBrandRef, false)));
  }
  // `= 0`, never `is null`: a product whose rating we failed to read is not a dead product, and
  // offering it for removal on the strength of our own parse failure would be wrong.
  if (options.unratedOnly) parts.push(eq(t.ratingCount, 0));
  if (options.noSellerOnly) parts.push(eq(t.hasSellers, false));
  if (options.minRatingCount !== undefined) parts.push(gte(t.ratingCount, options.minRatingCount));
  if (options.text !== undefined && options.text.trim() !== '') {
    // A bound parameter, not interpolation.
    const pattern = `%${options.text.trim()}%`;
    parts.push(or(like(t.label, pattern), like(t.productRef, pattern)));
  }
  return parts.length === 0 ? undefined : and(...parts);
}

function trackedSortColumn(t: TrackedSchema, sort: TrackedProductQueryOptions['sort']) {
  switch (sort) {
    case 'ratingCount':
      return t.ratingCount;
    case 'categoryName':
      return t.categoryName;
    case 'lastSweptAt':
      return t.lastSweptAt;
    case 'addedAt':
      return t.addedAt;
    default:
      return t.label;
  }
}

/**
 * The ORDER BY for a sortable column, with nulls forced last in **both** directions.
 *
 * The three dialects disagree here and the disagreement is user-visible. PostgreSQL sorts nulls
 * **first** on `DESC` (its documented default); SQLite and MySQL sort them last. Most of the
 * sortable columns here are nullable — a product whose rating, category or sweep timestamp
 * could not be read — so "sort by most-reviewed" would have opened with a page of unreadable
 * rows on Postgres and with the actual answer on the other two. Caught by the cross-dialect
 * test, 2026-08-28.
 *
 * `col IS NULL` sorted ascending puts non-null first everywhere: Postgres yields a boolean
 * (false < true), SQLite and MySQL yield 0/1. No dialect needs a `NULLS LAST` clause, which
 * MySQL does not support anyway.
 */
function trackedOrderBy(column: AnyColumn, sortDir: 'asc' | 'desc' | undefined): SQL[] {
  const direction = sortDir === 'desc' ? desc : asc;
  return [sql`${column} is null`, direction(column)];
}

/**
 * Server-paged, server-filtered, server-sorted feed for the tracked-products grid.
 *
 * Replaces a full-table read that also ran one observation query per row. That was correct for
 * the operator-curated list it was written for — a handful of products added by link — and
 * collapses the moment a brand sweep puts thousands of rows in the same table: Whiskas alone is
 * 887, Royal Canin 4,863. Only `limit` rows leave the database, and the caller enriches only
 * those.
 */
export async function queryTrackedProducts(
  appDb: AppDatabase,
  options: TrackedProductQueryOptions,
): Promise<{ rows: TrackedProductRow[]; total: number }> {
  const { limit, offset } = options;
  return withDialect(appDb, {
    sqlite: async (db) => {
      const where = buildTrackedWhere(sqliteSchema.trackedProducts, options);
      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(sqliteSchema.trackedProducts)
          .where(where)
          .orderBy(
            ...trackedOrderBy(trackedSortColumn(sqliteSchema.trackedProducts, options.sort), options.sortDir),
          )
          .limit(limit)
          .offset(offset),
        db.select({ n: count() }).from(sqliteSchema.trackedProducts).where(where),
      ]);
      return { rows: rows as TrackedProductRow[], total: Number(totalRow[0]?.n ?? 0) };
    },
    postgres: async (db) => {
      const where = buildTrackedWhere(postgresSchema.trackedProducts, options);
      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(postgresSchema.trackedProducts)
          .where(where)
          .orderBy(
            ...trackedOrderBy(
              trackedSortColumn(postgresSchema.trackedProducts, options.sort),
              options.sortDir,
            ),
          )
          .limit(limit)
          .offset(offset),
        db.select({ n: count() }).from(postgresSchema.trackedProducts).where(where),
      ]);
      return { rows: rows as TrackedProductRow[], total: Number(totalRow[0]?.n ?? 0) };
    },
    mysql: async (db) => {
      const where = buildTrackedWhere(mysqlSchema.trackedProducts, options);
      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(mysqlSchema.trackedProducts)
          .where(where)
          .orderBy(
            ...trackedOrderBy(trackedSortColumn(mysqlSchema.trackedProducts, options.sort), options.sortDir),
          )
          .limit(limit)
          .offset(offset),
        db.select({ n: count() }).from(mysqlSchema.trackedProducts).where(where),
      ]);
      return { rows: rows as TrackedProductRow[], total: Number(totalRow[0]?.n ?? 0) };
    },
  });
}

/** Distinct categories present among tracked products, for the grid's category filter. */
export async function trackedProductCategories(
  appDb: AppDatabase,
  watchedBrandId?: string,
): Promise<{ ref: string; name: string; productCount: number }[]> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({
          ref: sqliteSchema.trackedProducts.categoryRef,
          name: sqliteSchema.trackedProducts.categoryName,
          n: count(),
        })
        .from(sqliteSchema.trackedProducts)
        .where(
          watchedBrandId === undefined
            ? undefined
            : eq(sqliteSchema.trackedProducts.watchedBrandId, watchedBrandId),
        )
        .groupBy(sqliteSchema.trackedProducts.categoryRef, sqliteSchema.trackedProducts.categoryName),
    postgres: (db) =>
      db
        .select({
          ref: postgresSchema.trackedProducts.categoryRef,
          name: postgresSchema.trackedProducts.categoryName,
          n: count(),
        })
        .from(postgresSchema.trackedProducts)
        .where(
          watchedBrandId === undefined
            ? undefined
            : eq(postgresSchema.trackedProducts.watchedBrandId, watchedBrandId),
        )
        .groupBy(postgresSchema.trackedProducts.categoryRef, postgresSchema.trackedProducts.categoryName),
    mysql: (db) =>
      db
        .select({
          ref: mysqlSchema.trackedProducts.categoryRef,
          name: mysqlSchema.trackedProducts.categoryName,
          n: count(),
        })
        .from(mysqlSchema.trackedProducts)
        .where(
          watchedBrandId === undefined
            ? undefined
            : eq(mysqlSchema.trackedProducts.watchedBrandId, watchedBrandId),
        )
        .groupBy(mysqlSchema.trackedProducts.categoryRef, mysqlSchema.trackedProducts.categoryName),
  })) as { ref: string | null; name: string | null; n: number }[];

  return rows
    .filter((row): row is { ref: string; name: string | null; n: number } => row.ref !== null)
    .map((row) => ({ ref: row.ref, name: row.name ?? row.ref, productCount: Number(row.n) }))
    .sort((a, b) => b.productCount - a.productCount);
}

/**
 * Switches a set of products on or off, in bulk.
 *
 * Deactivation, not deletion, is what the dead-product suggestion applies. The row and its
 * history stay; the sweep stops re-including it in what it watches. That keeps the operator's
 * decision reversible, which matters because the evidence behind it — "the marketplace has
 * never recorded a rating" — is a proxy, not a fact about sales.
 */
export async function setTrackedProductsActive(
  appDb: AppDatabase,
  ids: readonly string[],
  isActive: boolean,
): Promise<void> {
  for (let start = 0; start < ids.length; start += LOOKUP_CHUNK) {
    const chunk = ids.slice(start, start + LOOKUP_CHUNK);
    if (chunk.length === 0) continue;
    await runDialect(appDb, {
      sqlite: (db) =>
        db
          .update(sqliteSchema.trackedProducts)
          .set({ isActive })
          .where(inArray(sqliteSchema.trackedProducts.id, chunk)),
      postgres: (db) =>
        db
          .update(postgresSchema.trackedProducts)
          .set({ isActive })
          .where(inArray(postgresSchema.trackedProducts.id, chunk)),
      mysql: (db) =>
        db
          .update(mysqlSchema.trackedProducts)
          .set({ isActive })
          .where(inArray(mysqlSchema.trackedProducts.id, chunk)),
    });
  }
}

// ------------------------------------------------ reference prices (the brand's own list price)

/**
 * One line of an operator's price list, already parsed and validated
 * (`apps/web/src/lib/reference-price-import.ts`).
 *
 * Identified by **barcode**, or by a marketplace and that marketplace's product ref — never by
 * name. A barcode row deliberately has no marketplace: the same article carries the same barcode
 * everywhere, so one line of a brand's list prices the product on every marketplace it is
 * tracked on, which is the whole reason the cross-marketplace screen joins on it (doc 06 §12.4).
 */
export interface ReferencePriceAssignment {
  readonly barcode: string | null;
  readonly marketplaceCode: string | null;
  readonly productRef: string | null;
  /** Kuruş. */
  readonly referencePrice: bigint;
}

export interface ReferencePriceApplyResult {
  /** Tracked products whose reference price was written. */
  readonly productsMatched: number;
  /** List lines that matched no tracked product at all — the figure the screen reports back. */
  readonly linesUnmatched: number;
}

/**
 * Writes an operator's price list onto the tracked products it identifies.
 *
 * **Unmatched lines are reported, never guessed at.** A brand's list covers its whole catalogue
 * while the tracked set covers what a sweep found on one marketplace, so a partial match is the
 * normal outcome rather than an error — but it has to be *visible*, because "42 of 300 lines
 * matched" and "300 of 300" are the difference between a working import and a screen that will
 * quietly produce no findings for 86% of the list. The same reason the cross-marketplace screen
 * spends half its area on coverage.
 *
 * Products are updated grouped by price rather than one statement per row: a price list has far
 * fewer distinct prices than lines. Both the lookup and the update are chunked at `LOOKUP_CHUNK`,
 * since every driver's parameter ceiling sits well below a catalogue.
 */
export async function applyReferencePrices(
  appDb: AppDatabase,
  assignments: readonly ReferencePriceAssignment[],
  source: string | null,
  atMs: number,
): Promise<ReferencePriceApplyResult> {
  if (assignments.length === 0) return { productsMatched: 0, linesUnmatched: 0 };

  const byBarcode = new Map<string, bigint>();
  const byRef = new Map<string, bigint>();
  for (const a of assignments) {
    if (a.barcode !== null) byBarcode.set(a.barcode, a.referencePrice);
    else if (a.marketplaceCode !== null && a.productRef !== null) {
      byRef.set(`${a.marketplaceCode}::${a.productRef}`, a.referencePrice);
    }
  }

  /** productId → price. A product named twice by two lines takes the last one, as a map does. */
  const priceByProductId = new Map<string, bigint>();
  const matchedBarcodes = new Set<string>();
  const matchedRefs = new Set<string>();

  const barcodes = [...byBarcode.keys()];
  for (let start = 0; start < barcodes.length; start += LOOKUP_CHUNK) {
    const chunk = barcodes.slice(start, start + LOOKUP_CHUNK);
    if (chunk.length === 0) continue;
    const rows = (await withDialect(appDb, {
      sqlite: (db) =>
        db
          .select({ id: sqliteSchema.trackedProducts.id, barcode: sqliteSchema.trackedProducts.barcode })
          .from(sqliteSchema.trackedProducts)
          .where(inArray(sqliteSchema.trackedProducts.barcode, chunk)),
      postgres: (db) =>
        db
          .select({ id: postgresSchema.trackedProducts.id, barcode: postgresSchema.trackedProducts.barcode })
          .from(postgresSchema.trackedProducts)
          .where(inArray(postgresSchema.trackedProducts.barcode, chunk)),
      mysql: (db) =>
        db
          .select({ id: mysqlSchema.trackedProducts.id, barcode: mysqlSchema.trackedProducts.barcode })
          .from(mysqlSchema.trackedProducts)
          .where(inArray(mysqlSchema.trackedProducts.barcode, chunk)),
    })) as { id: string; barcode: string | null }[];
    for (const row of rows) {
      if (row.barcode === null) continue;
      const price = byBarcode.get(row.barcode);
      if (price === undefined) continue;
      priceByProductId.set(row.id, price);
      matchedBarcodes.add(row.barcode);
    }
  }

  // Refs are looked up per marketplace: the same digits are different products on different
  // marketplaces, so one `IN (...)` across both would match the wrong rows.
  const refsByMarketplace = new Map<string, string[]>();
  for (const key of byRef.keys()) {
    const [marketplaceCode = '', productRef = ''] = key.split('::');
    const list = refsByMarketplace.get(marketplaceCode) ?? [];
    list.push(productRef);
    refsByMarketplace.set(marketplaceCode, list);
  }
  for (const [marketplaceCode, refs] of refsByMarketplace) {
    const found = await findTrackedProductsByRefs(appDb, marketplaceCode, refs);
    for (const [productRef, row] of found) {
      const key = `${marketplaceCode}::${productRef}`;
      const price = byRef.get(key);
      if (price === undefined) continue;
      priceByProductId.set(row.id, price);
      matchedRefs.add(key);
    }
  }

  const idsByPrice = new Map<bigint, string[]>();
  for (const [id, price] of priceByProductId) {
    const list = idsByPrice.get(price) ?? [];
    list.push(id);
    idsByPrice.set(price, list);
  }

  for (const [price, ids] of idsByPrice) {
    for (let start = 0; start < ids.length; start += LOOKUP_CHUNK) {
      const chunk = ids.slice(start, start + LOOKUP_CHUNK);
      if (chunk.length === 0) continue;
      const set = {
        referencePrice: price,
        referencePriceSource: source,
        referencePriceUpdatedAt: atMs,
      };
      await runDialect(appDb, {
        sqlite: (db) =>
          db
            .update(sqliteSchema.trackedProducts)
            .set(set)
            .where(inArray(sqliteSchema.trackedProducts.id, chunk)),
        postgres: (db) =>
          db
            .update(postgresSchema.trackedProducts)
            .set(set)
            .where(inArray(postgresSchema.trackedProducts.id, chunk)),
        mysql: (db) =>
          db
            .update(mysqlSchema.trackedProducts)
            .set(set)
            .where(inArray(mysqlSchema.trackedProducts.id, chunk)),
      });
    }
  }

  return {
    productsMatched: priceByProductId.size,
    linesUnmatched: byBarcode.size - matchedBarcodes.size + (byRef.size - matchedRefs.size),
  };
}

/**
 * Clears the reference price on named products — the operator withdrawing a list price rather
 * than correcting it.
 *
 * Separate from `applyReferencePrices` rather than a `null` price through it, because the two are
 * different statements: a written price says "sell at this", and no price says "we have not
 * published one for this product". Clearing must also clear the source and the date, or the
 * screen would show a file name beside an empty price.
 */
export async function clearReferencePrices(appDb: AppDatabase, ids: readonly string[]): Promise<void> {
  for (let start = 0; start < ids.length; start += LOOKUP_CHUNK) {
    const chunk = ids.slice(start, start + LOOKUP_CHUNK);
    if (chunk.length === 0) continue;
    const set = { referencePrice: null, referencePriceSource: null, referencePriceUpdatedAt: null };
    await runDialect(appDb, {
      sqlite: (db) =>
        db
          .update(sqliteSchema.trackedProducts)
          .set(set)
          .where(inArray(sqliteSchema.trackedProducts.id, chunk)),
      postgres: (db) =>
        db
          .update(postgresSchema.trackedProducts)
          .set(set)
          .where(inArray(postgresSchema.trackedProducts.id, chunk)),
      mysql: (db) =>
        db.update(mysqlSchema.trackedProducts).set(set).where(inArray(mysqlSchema.trackedProducts.id, chunk)),
    });
  }
}

/**
 * How much of a brand's tracked catalogue carries a reference price — the coverage figure the
 * screens report beside any finding derived from one.
 *
 * It exists for the same reason the cross-marketplace screen leads with coverage: "no products
 * are below the list price" reads as good news and means nothing at all when only 12 of 887
 * products have a list price to be below.
 */
export async function referencePriceCoverage(
  appDb: AppDatabase,
  watchedBrandId?: string,
): Promise<{ readonly withPrice: number; readonly total: number }> {
  return withDialect(appDb, {
    sqlite: async (db) => {
      const where = watchedBrandId
        ? eq(sqliteSchema.trackedProducts.watchedBrandId, watchedBrandId)
        : undefined;
      const [totalRow, withRow] = await Promise.all([
        db.select({ n: count() }).from(sqliteSchema.trackedProducts).where(where),
        db
          .select({ n: count() })
          .from(sqliteSchema.trackedProducts)
          .where(and(where, isNotNull(sqliteSchema.trackedProducts.referencePrice))),
      ]);
      return { withPrice: Number(withRow[0]?.n ?? 0), total: Number(totalRow[0]?.n ?? 0) };
    },
    postgres: async (db) => {
      const where = watchedBrandId
        ? eq(postgresSchema.trackedProducts.watchedBrandId, watchedBrandId)
        : undefined;
      const [totalRow, withRow] = await Promise.all([
        db.select({ n: count() }).from(postgresSchema.trackedProducts).where(where),
        db
          .select({ n: count() })
          .from(postgresSchema.trackedProducts)
          .where(and(where, isNotNull(postgresSchema.trackedProducts.referencePrice))),
      ]);
      return { withPrice: Number(withRow[0]?.n ?? 0), total: Number(totalRow[0]?.n ?? 0) };
    },
    mysql: async (db) => {
      const where = watchedBrandId
        ? eq(mysqlSchema.trackedProducts.watchedBrandId, watchedBrandId)
        : undefined;
      const [totalRow, withRow] = await Promise.all([
        db.select({ n: count() }).from(mysqlSchema.trackedProducts).where(where),
        db
          .select({ n: count() })
          .from(mysqlSchema.trackedProducts)
          .where(and(where, isNotNull(mysqlSchema.trackedProducts.referencePrice))),
      ]);
      return { withPrice: Number(withRow[0]?.n ?? 0), total: Number(totalRow[0]?.n ?? 0) };
    },
  });
}

/**
 * Refreshes the rating a *product page* stated, from the deep scrape (2026-09-03).
 *
 * A second writer for `rating_count` / `rating_average`, and deliberately so — but only for
 * these two columns, which are **the marketplace's own statement about the product** rather than
 * anything an operator owns. `upsertSweptProducts` writes them once a day from the catalogue
 * card; the per-product scrape reads the same number off the same marketplace far more often,
 * and was discarding it. The two agree by construction because they are the same fact from the
 * same source; where they disagree, the fresher reading is the right one.
 *
 * Contrast `label`, `is_active` and the reference price, which no scrape may touch: those are an
 * operator's, and a nightly job overwriting them is the failure this distinction exists to name.
 *
 * `null` is never written. An unreadable rating is our failure, not an event in the product's
 * life, and storing it would erase a known count with an unknown one — the same rule
 * `recordTrackedProductMetrics` follows when it refuses to write a null sample.
 */
export async function setTrackedProductRating(
  appDb: AppDatabase,
  id: string,
  ratingCount: number | null,
  ratingAverage: number | null,
): Promise<void> {
  if (ratingCount === null && ratingAverage === null) return;
  const set = {
    ...(ratingCount === null ? {} : { ratingCount }),
    ...(ratingAverage === null ? {} : { ratingAverage }),
  };
  await runDialect(appDb, {
    sqlite: (db) =>
      db.update(sqliteSchema.trackedProducts).set(set).where(eq(sqliteSchema.trackedProducts.id, id)),
    postgres: (db) =>
      db.update(postgresSchema.trackedProducts).set(set).where(eq(postgresSchema.trackedProducts.id, id)),
    mysql: (db) =>
      db.update(mysqlSchema.trackedProducts).set(set).where(eq(mysqlSchema.trackedProducts.id, id)),
  });
}
