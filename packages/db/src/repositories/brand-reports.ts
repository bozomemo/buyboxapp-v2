/**
 * Seller- and product-centric aggregations over the **brand** archive (doc 06 §12.4, Faz 4) —
 * the tracked-product analogue of `competitor-reports.ts`.
 *
 * Same shape, different question. `competitor-reports.ts` asks "who competes with us on the
 * listings we sell", so it groups `competitor_observations` by way of `listings`. This asks
 * "who sells the brand we own", so it groups `tracked_product_observations` by way of
 * `tracked_products`. A brand owner may have no listing at all on the marketplace they are
 * auditing, which is precisely why the two cannot share a query.
 *
 * `GROUP BY` in the database, not fetch-then-count in JS, for the reason the competitor file
 * gives at more length: a seller-centric report spans every product the seller appears on, and
 * a brand sweep puts thousands of products behind it (887 for Whiskas, 4,863 for Royal Canin).
 * Counting rows in JS there does not fail — it silently answers from whatever slice was
 * fetched, which is worse.
 *
 * ⚠️ Everything here is **reporting**. Nothing in the pricing path reads `tracked_products` or
 * anything computed from it (doc 07 §2.1) — `Reprice` and `ObserveBuybox` only ever query
 * `listings`, so there is no flag to check because there is no listing row for that code to see.
 *
 * Driver note, as next door: `count`/`sum`/`avg` come back as strings from node-postgres and as
 * numbers or strings from mysql2 depending on the type, so every numeric aggregate is coerced
 * with `Number(...)` at the boundary of its branch rather than trusted as returned. Money is
 * the exception and is decoded explicitly — see `decodeSqliteMoney`.
 */
import { and, eq, gte, inArray, isNotNull, isNull, lte, not, or, sql, type Column, type SQL } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { decodeSortableBigint } from '../sortable-bigint.js';
import { withDialect } from '../with-dialect.js';
import type { SellerKey } from './competitor-reports.js';

export type { SellerKey };

/**
 * The scope of a brand report.
 *
 * Either scoping field may be omitted; a report with neither is every tracked product, which is
 * the right default for an install that watches one brand and a wrong-looking number for one
 * that watches six. The screens always pass a scope.
 *
 * A **group** (Mars) is scoped by expanding it to its brands' ids before calling, rather than by
 * a third join through `watched_brands`. Expanding at the caller keeps this query flat and lets
 * the same field answer "these two brands" — a question the hierarchy cannot express but an
 * auditor comparing Whiskas against Royal Canin asks immediately.
 */
export interface BrandReportWindow {
  readonly sinceMs: number;
  readonly untilMs: number;
  readonly marketplaceCode?: string;
  /**
   * Restrict to these watched brands. `undefined` means no restriction; an **empty array means
   * no brand matches** and returns nothing, which is the safe reading for a caller that expanded
   * a group with no brands in it. (A group that has just been created must report zero, not
   * everything.)
   */
  readonly watchedBrandIds?: readonly string[];
  /**
   * Sellers to leave out — in practice the brand owner's own store, or an authorised
   * distributor whose presence in every figure would drown the sellers the audit is about.
   *
   * Excluded here rather than in the archive, so the observation rows stay a faithful record of
   * what the page showed. Keyed by marketplace *and* ref, never by ref alone: the same digits
   * are different companies on different marketplaces.
   */
  readonly excludeSellers?: readonly SellerKey[];
}

type ObservationsTable =
  | typeof sqliteSchema.trackedProductObservations
  | typeof postgresSchema.trackedProductObservations
  | typeof mysqlSchema.trackedProductObservations;

type ProductsTable =
  | typeof sqliteSchema.trackedProducts
  | typeof postgresSchema.trackedProducts
  | typeof mysqlSchema.trackedProducts;

/** `(marketplace = ? and seller = ?)` for one seller. */
function sellerMatches(marketplaceColumn: Column, sellerColumn: Column, seller: SellerKey): SQL {
  return and(eq(marketplaceColumn, seller.marketplaceCode), eq(sellerColumn, seller.sellerRef))!;
}

/** `not(...)` per excluded seller; `undefined` when there is nothing to exclude. */
function excludeSellersClause(
  marketplaceColumn: Column,
  sellerColumn: Column,
  window: BrandReportWindow,
): SQL | undefined {
  const excluded = window.excludeSellers;
  if (!excluded || excluded.length === 0) return undefined;
  return and(...excluded.map((seller) => not(sellerMatches(marketplaceColumn, sellerColumn, seller))));
}

/**
 * The scope predicate, written once for all three dialects (the same union-of-table-types trick
 * `buildTrackedWhere` uses). Two identical predicates written out per branch is how the brand
 * filter and the marketplace filter drift apart on one engine only.
 */
function brandScopeClause(p: ProductsTable, window: BrandReportWindow): SQL | undefined {
  const parts: SQL[] = [];
  if (window.marketplaceCode !== undefined) parts.push(eq(p.marketplaceCode, window.marketplaceCode));
  const brandIds = window.watchedBrandIds;
  if (brandIds !== undefined) {
    parts.push(brandIds.length === 0 ? sql`1 = 0` : inArray(p.watchedBrandId, [...brandIds]));
  }
  return parts.length === 0 ? undefined : and(...parts);
}

/** Only successful looks carry prices; a `parseFailed`/`fetchFailed` row is a status, not an offer. */
function priceRowsClause(o: ObservationsTable, window: BrandReportWindow): SQL {
  return and(
    gte(o.observedAt, window.sinceMs),
    lte(o.observedAt, window.untilMs),
    eq(o.status, 'ok'),
    isNotNull(o.price),
  )!;
}

/**
 * A successful look, price or not — deliberately weaker than `priceRowsClause`.
 *
 * Every aggregate in this file needs a price, because it is averaging one. `sellerProductTargets`
 * needs only to know the seller was *on that page*, and an offer whose price node was unreadable
 * still proves that. Reusing the stricter clause there would quietly skip exactly the products a
 * seller with malformed prices appears on.
 */
function okRowsClause(o: ObservationsTable, window: BrandReportWindow): SQL {
  return and(gte(o.observedAt, window.sinceMs), lte(o.observedAt, window.untilMs), eq(o.status, 'ok'))!;
}

/**
 * Money aggregates need one dialect-aware step. SQLite stores kuruş as the zero-padded sortable
 * text `sortable-bigint.ts` defines — `min()`/`max()` over it are correct precisely because that
 * encoding sorts lexicographically in numeric order, but what comes back is the encoding, not
 * the number. PostgreSQL and MySQL return their native 64-bit integer.
 */
function decodeSqliteMoney(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  return decodeSortableBigint(String(value));
}

function decodeNativeMoney(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  return BigInt(value as string | number | bigint);
}

/**
 * The one place SQLite's money encoding has to become a *number* rather than a comparison.
 *
 * Everything else about that encoding works untouched: `min`, `max`, `order by` and `=` are all
 * correct on the padded text, which is the whole point of it. Percentage deviation is not — it
 * is arithmetic, and `'100000000000000012345' / 2` is nonsense.
 *
 * The sign digit is stripped and the magnitude cast: `substr(price, 2)` is 20 zero-padded
 * digits, well inside SQLite's 64-bit integer once the padding is dropped. Guarded on the sign
 * digit rather than assumed, so a negative value (which a price should never be, and which
 * would decode to a wrong magnitude here) yields `null` and drops out of the average instead of
 * quietly poisoning it.
 */
const sqliteNumericPrice = (column: Column): SQL<number | null> =>
  sql<number | null>`case when substr(${column}, 1, 1) = '1' then cast(substr(${column}, 2) as integer) end`;

/**
 * Per product, over the window: the price band the market actually traded in.
 *
 * Answers the "dönem içi en yüksek / en düşük" half of the product row. The *current* half —
 * how many sellers there are right now, and the median and spread among them — is computed in
 * JS from the latest look's offers (`lib/price-stats.ts` in the web app), because a median has
 * no exact cross-dialect SQL form and a look is at most a few dozen rows. Splitting it that way
 * keeps both halves exact rather than making the period figures approximate to match.
 *
 * Bounded by `productIds` on purpose: this feeds a server-paged grid, so the caller passes the
 * page's ids and gets one query rather than one query per row.
 */
export interface BrandProductPeriodStats {
  readonly trackedProductId: string;
  readonly minPrice: bigint | null;
  readonly maxPrice: bigint | null;
  /** Distinct identified sellers seen across the whole window, not just the latest look. */
  readonly sellerCount: number;
  /**
   * How many **distinct stored looks** fall in the window.
   *
   * Since Faz 4 a look is stored only when the offer set changed, so this counts *changes*, not
   * observations. A product with one row here has not been looked at once — it has been looked
   * at every day and never moved. `tracked_products.last_scraped_at` is the figure that answers
   * "when did we last check".
   */
  readonly changeCount: number;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
}

interface RawPeriodStats {
  trackedProductId: string;
  minPrice: unknown;
  maxPrice: unknown;
  sellerCount: unknown;
  changeCount: unknown;
  firstSeenAt: unknown;
  lastSeenAt: unknown;
}

function toPeriodStats(
  r: RawPeriodStats,
  decodeMoney: (v: unknown) => bigint | null,
): BrandProductPeriodStats {
  return {
    trackedProductId: r.trackedProductId,
    minPrice: decodeMoney(r.minPrice),
    maxPrice: decodeMoney(r.maxPrice),
    sellerCount: Number(r.sellerCount),
    changeCount: Number(r.changeCount),
    firstSeenAt: Number(r.firstSeenAt),
    lastSeenAt: Number(r.lastSeenAt),
  };
}

export async function trackedProductPeriodStats(
  appDb: AppDatabase,
  productIds: readonly string[],
  window: BrandReportWindow,
): Promise<Map<string, BrandProductPeriodStats>> {
  if (productIds.length === 0) return new Map();
  const ids = [...productIds];

  const rows = await withDialect(appDb, {
    sqlite: async (db) => {
      const o = sqliteSchema.trackedProductObservations;
      return (
        await db
          .select({
            trackedProductId: o.trackedProductId,
            minPrice: sql<string | null>`min(${o.price})`,
            maxPrice: sql<string | null>`max(${o.price})`,
            sellerCount: sql<number>`count(distinct ${o.sellerRef})`,
            changeCount: sql<number>`count(distinct ${o.observedAt})`,
            firstSeenAt: sql<number>`min(${o.observedAt})`,
            lastSeenAt: sql<number>`max(${o.observedAt})`,
          })
          .from(o)
          .where(and(inArray(o.trackedProductId, ids), priceRowsClause(o, window)))
          .groupBy(o.trackedProductId)
      ).map((r) => toPeriodStats(r, decodeSqliteMoney));
    },
    postgres: async (db) => {
      const o = postgresSchema.trackedProductObservations;
      return (
        await db
          .select({
            trackedProductId: o.trackedProductId,
            minPrice: sql<string | null>`min(${o.price})`,
            maxPrice: sql<string | null>`max(${o.price})`,
            sellerCount: sql<number>`count(distinct ${o.sellerRef})`,
            changeCount: sql<number>`count(distinct ${o.observedAt})`,
            firstSeenAt: sql<number>`min(${o.observedAt})`,
            lastSeenAt: sql<number>`max(${o.observedAt})`,
          })
          .from(o)
          .where(and(inArray(o.trackedProductId, ids), priceRowsClause(o, window)))
          .groupBy(o.trackedProductId)
      ).map((r) => toPeriodStats(r, decodeNativeMoney));
    },
    mysql: async (db) => {
      const o = mysqlSchema.trackedProductObservations;
      return (
        await db
          .select({
            trackedProductId: o.trackedProductId,
            minPrice: sql<string | null>`min(${o.price})`,
            maxPrice: sql<string | null>`max(${o.price})`,
            sellerCount: sql<number>`count(distinct ${o.sellerRef})`,
            changeCount: sql<number>`count(distinct ${o.observedAt})`,
            firstSeenAt: sql<number>`min(${o.observedAt})`,
            lastSeenAt: sql<number>`max(${o.observedAt})`,
          })
          .from(o)
          .where(and(inArray(o.trackedProductId, ids), priceRowsClause(o, window)))
          .groupBy(o.trackedProductId)
      ).map((r) => toPeriodStats(r, decodeNativeMoney));
    },
  });

  return new Map(rows.map((row) => [row.trackedProductId, row]));
}

/**
 * One row per identified seller, across every tracked product they were seen on in the window —
 * the brand-side answer to "who sells my products, and how".
 *
 * **Only identified sellers appear.** `tracked_product_observations.seller_ref` is nullable, and
 * an offer with no merchant id cannot be attributed to anyone across time; grouping those by
 * display name is the identity mistake doc 05 §5 refuses to make, and it is exactly the mistake
 * that would put a real company's behaviour on an unrelated one's audit row.
 * `countUnidentifiedTrackedObservations` reports the residue so a screen can state its own
 * blind spot rather than imply the list is exhaustive.
 */
export interface BrandSellerAggregateRow {
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  /** The name as recorded on the observations *in this window*, not the seller's name today. */
  readonly observedName: string;
  /** How many of the brand's products this seller was seen on. */
  readonly productCount: number;
  readonly observationCount: number;
  /** Of those, how many had them at rank 1 — the buybox holder as the page presented it. */
  readonly buyboxCount: number;
  /**
   * Of those, how many were the **cheapest offer in their own look**.
   *
   * Deliberately separate from `buyboxCount`. Trendyol's rank 1 is who wins the buybox, which
   * is not the same as who is cheapest — the marketplace weighs delivery and seller score too.
   * A seller who is cheapest far more often than they hold the buybox is a different finding
   * from one who holds it without being cheapest, and collapsing the two would hide both.
   *
   * Ties count for everyone who matched the minimum: two sellers at the same lowest price were
   * both the cheapest, and picking one by row order would be an arbitrary fact about storage.
   */
  readonly cheapestCount: number;
  /**
   * Mean deviation from the market, in percent, negative meaning below it — the "piyasanın çok
   * altında satan var mı" figure.
   *
   * The market baseline is the **mean price of the seller's own look**: every offer on that
   * product at that moment, including sellers the report excludes, because the question is how
   * this seller sits against the market rather than against the report's subset.
   *
   * Mean, not median, and that is a deliberate narrowing of what Faz 4 promised. An exact
   * median has no portable SQL form across SQLite, PostgreSQL and MySQL, and three separate
   * window-function implementations of a fiddly query is a worse risk than a well-labelled
   * mean. The median that *is* exact — over one look's few dozen offers — is computed in JS on
   * the product row instead. If a brand's outlier sellers ever drag this figure enough to
   * matter, the fix is a stored per-look median at write time, not an approximation here.
   */
  readonly avgDeviationPct: number | null;
  /**
   * How many of those observations the deviation could actually be measured on.
   *
   * Not the same as `observationCount`: a look whose market average came out at zero — every
   * offer unreadable, or a single free item — is counted as an observation and contributes
   * nothing to the mean. Reported because Faz 6 subtracts one product's contribution from this
   * mean to ask "how does this seller price *everything else*", and that subtraction is only
   * arithmetic if both sides are counted over the same rows.
   */
  readonly comparedCount: number;
  readonly minPrice: bigint | null;
  readonly maxPrice: bigint | null;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
}

interface RawSellerAggregate {
  marketplaceCode: string;
  sellerRef: string | null;
  observedName: string | null;
  productCount: unknown;
  observationCount: unknown;
  buyboxCount: unknown;
  cheapestCount: unknown;
  avgDeviationPct: unknown;
  comparedCount: unknown;
  minPrice: unknown;
  maxPrice: unknown;
  firstSeenAt: unknown;
  lastSeenAt: unknown;
}

function toSellerRow(
  r: RawSellerAggregate,
  decodeMoney: (v: unknown) => bigint | null,
): BrandSellerAggregateRow {
  return {
    marketplaceCode: r.marketplaceCode,
    sellerRef: r.sellerRef as string, // guaranteed by the `isNotNull` predicate on every branch
    observedName: r.observedName ?? '',
    productCount: Number(r.productCount),
    observationCount: Number(r.observationCount),
    buyboxCount: Number(r.buyboxCount),
    cheapestCount: Number(r.cheapestCount),
    avgDeviationPct:
      r.avgDeviationPct === null || r.avgDeviationPct === undefined ? null : Number(r.avgDeviationPct),
    comparedCount: Number(r.comparedCount),
    minPrice: decodeMoney(r.minPrice),
    maxPrice: decodeMoney(r.maxPrice),
    firstSeenAt: Number(r.firstSeenAt),
    lastSeenAt: Number(r.lastSeenAt),
  };
}

export async function brandSellerAggregatesInRange(
  appDb: AppDatabase,
  window: BrandReportWindow,
): Promise<BrandSellerAggregateRow[]> {
  return withDialect(appDb, {
    sqlite: async (db) => {
      const o = sqliteSchema.trackedProductObservations;
      const p = sqliteSchema.trackedProducts;
      // One row per look: what the market looked like at that moment. Scoped only by the window
      // — never by `excludeSellers` — because the baseline is the whole page, not the subset the
      // report is about.
      const look = db
        .select({
          trackedProductId: o.trackedProductId,
          observedAt: o.observedAt,
          minPrice: sql<string>`min(${o.price})`.as('look_min_price'),
          avgPrice: sql<number>`avg(${sqliteNumericPrice(o.price)})`.as('look_avg_price'),
        })
        .from(o)
        .where(priceRowsClause(o, window))
        .groupBy(o.trackedProductId, o.observedAt)
        .as('look');

      const rows = await db
        .select({
          marketplaceCode: p.marketplaceCode,
          sellerRef: o.sellerRef,
          observedName: sql<string>`max(${o.sellerName})`,
          productCount: sql<number>`count(distinct ${o.trackedProductId})`,
          observationCount: sql<number>`count(*)`,
          buyboxCount: sql<number>`sum(case when ${o.rank} = 1 then 1 else 0 end)`,
          cheapestCount: sql<number>`sum(case when ${o.price} = ${look.minPrice} then 1 else 0 end)`,
          avgDeviationPct: sql<number | null>`avg(
            case when ${look.avgPrice} > 0
              then (${sqliteNumericPrice(o.price)} - ${look.avgPrice}) * 100.0 / ${look.avgPrice}
            end
          )`,
          comparedCount: sql<number>`sum(case when ${look.avgPrice} > 0 then 1 else 0 end)`,
          minPrice: sql<string | null>`min(${o.price})`,
          maxPrice: sql<string | null>`max(${o.price})`,
          firstSeenAt: sql<number>`min(${o.observedAt})`,
          lastSeenAt: sql<number>`max(${o.observedAt})`,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .innerJoin(
          look,
          and(eq(look.trackedProductId, o.trackedProductId), eq(look.observedAt, o.observedAt)),
        )
        .where(
          and(
            priceRowsClause(o, window),
            isNotNull(o.sellerRef),
            brandScopeClause(p, window),
            excludeSellersClause(p.marketplaceCode, o.sellerRef, window),
          ),
        )
        .groupBy(p.marketplaceCode, o.sellerRef)
        .orderBy(sql`count(distinct ${o.trackedProductId}) desc`);
      return rows.map((r) => toSellerRow(r, decodeSqliteMoney));
    },
    postgres: async (db) => {
      const o = postgresSchema.trackedProductObservations;
      const p = postgresSchema.trackedProducts;
      const look = db
        .select({
          trackedProductId: o.trackedProductId,
          observedAt: o.observedAt,
          minPrice: sql<string>`min(${o.price})`.as('look_min_price'),
          avgPrice: sql<number>`avg(${o.price})`.as('look_avg_price'),
        })
        .from(o)
        .where(priceRowsClause(o, window))
        .groupBy(o.trackedProductId, o.observedAt)
        .as('look');

      const rows = await db
        .select({
          marketplaceCode: p.marketplaceCode,
          sellerRef: o.sellerRef,
          observedName: sql<string>`max(${o.sellerName})`,
          productCount: sql<number>`count(distinct ${o.trackedProductId})`,
          observationCount: sql<number>`count(*)`,
          buyboxCount: sql<number>`sum(case when ${o.rank} = 1 then 1 else 0 end)`,
          cheapestCount: sql<number>`sum(case when ${o.price} = ${look.minPrice} then 1 else 0 end)`,
          avgDeviationPct: sql<number | null>`avg(
            case when ${look.avgPrice} > 0
              then (${o.price} - ${look.avgPrice}) * 100.0 / ${look.avgPrice}
            end
          )`,
          comparedCount: sql<number>`sum(case when ${look.avgPrice} > 0 then 1 else 0 end)`,
          minPrice: sql<string | null>`min(${o.price})`,
          maxPrice: sql<string | null>`max(${o.price})`,
          firstSeenAt: sql<number>`min(${o.observedAt})`,
          lastSeenAt: sql<number>`max(${o.observedAt})`,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .innerJoin(
          look,
          and(eq(look.trackedProductId, o.trackedProductId), eq(look.observedAt, o.observedAt)),
        )
        .where(
          and(
            priceRowsClause(o, window),
            isNotNull(o.sellerRef),
            brandScopeClause(p, window),
            excludeSellersClause(p.marketplaceCode, o.sellerRef, window),
          ),
        )
        .groupBy(p.marketplaceCode, o.sellerRef)
        .orderBy(sql`count(distinct ${o.trackedProductId}) desc`);
      return rows.map((r) => toSellerRow(r, decodeNativeMoney));
    },
    mysql: async (db) => {
      const o = mysqlSchema.trackedProductObservations;
      const p = mysqlSchema.trackedProducts;
      const look = db
        .select({
          trackedProductId: o.trackedProductId,
          observedAt: o.observedAt,
          minPrice: sql<string>`min(${o.price})`.as('look_min_price'),
          avgPrice: sql<number>`avg(${o.price})`.as('look_avg_price'),
        })
        .from(o)
        .where(priceRowsClause(o, window))
        .groupBy(o.trackedProductId, o.observedAt)
        .as('look');

      const rows = await db
        .select({
          marketplaceCode: p.marketplaceCode,
          sellerRef: o.sellerRef,
          observedName: sql<string>`max(${o.sellerName})`,
          productCount: sql<number>`count(distinct ${o.trackedProductId})`,
          observationCount: sql<number>`count(*)`,
          buyboxCount: sql<number>`sum(case when ${o.rank} = 1 then 1 else 0 end)`,
          cheapestCount: sql<number>`sum(case when ${o.price} = ${look.minPrice} then 1 else 0 end)`,
          avgDeviationPct: sql<number | null>`avg(
            case when ${look.avgPrice} > 0
              then (${o.price} - ${look.avgPrice}) * 100.0 / ${look.avgPrice}
            end
          )`,
          comparedCount: sql<number>`sum(case when ${look.avgPrice} > 0 then 1 else 0 end)`,
          minPrice: sql<string | null>`min(${o.price})`,
          maxPrice: sql<string | null>`max(${o.price})`,
          firstSeenAt: sql<number>`min(${o.observedAt})`,
          lastSeenAt: sql<number>`max(${o.observedAt})`,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .innerJoin(
          look,
          and(eq(look.trackedProductId, o.trackedProductId), eq(look.observedAt, o.observedAt)),
        )
        .where(
          and(
            priceRowsClause(o, window),
            isNotNull(o.sellerRef),
            brandScopeClause(p, window),
            excludeSellersClause(p.marketplaceCode, o.sellerRef, window),
          ),
        )
        .groupBy(p.marketplaceCode, o.sellerRef)
        .orderBy(sql`count(distinct ${o.trackedProductId}) desc`);
      return rows.map((r) => toSellerRow(r, decodeNativeMoney));
    },
  });
}

/**
 * One seller's activity across the **tracked products** they were seen on, one row per product.
 *
 * The brand-side answer to `competitorReportsRepo.sellerListingBreakdown`, and it exists because
 * that function cannot answer for this seller at all: it joins `competitor_observations` to
 * `listings`, so a seller who competes only on products we do not sell comes back as an empty
 * result. On a brand-owner install that is the *normal* case — the audit is about the whole
 * marketplace, not about our own shelf — and a finding saying "this seller held the buybox on 5
 * products" led to a screen showing none of them (doc 06 §12.4).
 *
 * Same aggregation as `brandSellerAggregatesInRange`, transposed: that one groups by seller to
 * rank sellers within a brand, this one fixes the seller and groups by product to say *which*
 * products. The market baseline is identical — the mean price of the product's own look,
 * including sellers a report excludes — so a figure here and a figure there describe the same
 * behaviour and can be read against each other.
 *
 * `sellers` is a **list** so a caller can pass an expanded `competitor_seller_groups` membership
 * (doc 05 §5) and get the whole company across marketplaces in one table. Rows stay keyed per
 * marketplace, because the same digits are different firms on different marketplaces.
 */
export interface SellerTrackedProductRow {
  readonly trackedProductId: string;
  readonly marketplaceCode: string;
  readonly productLabel: string;
  /** The brand as the marketplace attributes it — `null` when the sweep recorded none. */
  readonly brandName: string | null;
  /** Which watched brand's sweep put this product in the archive; `null` for a hand-added one. */
  readonly watchedBrandId: string | null;
  /** The name on the observations *in this window*, not the seller's name today. */
  readonly observedName: string;
  readonly observationCount: number;
  readonly buyboxCount: number;
  readonly cheapestCount: number;
  /** See `BrandSellerAggregateRow.avgDeviationPct` — mean, negative meaning below the market. */
  readonly avgDeviationPct: number | null;
  readonly comparedCount: number;
  readonly minPrice: bigint | null;
  readonly maxPrice: bigint | null;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
}

interface RawSellerProductRow {
  trackedProductId: string;
  marketplaceCode: string;
  productLabel: string | null;
  brandName: string | null;
  watchedBrandId: string | null;
  observedName: string | null;
  observationCount: unknown;
  buyboxCount: unknown;
  cheapestCount: unknown;
  avgDeviationPct: unknown;
  comparedCount: unknown;
  minPrice: unknown;
  maxPrice: unknown;
  firstSeenAt: unknown;
  lastSeenAt: unknown;
}

function toSellerProductRow(
  r: RawSellerProductRow,
  decodeMoney: (v: unknown) => bigint | null,
): SellerTrackedProductRow {
  return {
    trackedProductId: r.trackedProductId,
    marketplaceCode: r.marketplaceCode,
    productLabel: r.productLabel ?? '',
    brandName: r.brandName ?? null,
    watchedBrandId: r.watchedBrandId ?? null,
    observedName: r.observedName ?? '',
    observationCount: Number(r.observationCount),
    buyboxCount: Number(r.buyboxCount),
    cheapestCount: Number(r.cheapestCount),
    avgDeviationPct:
      r.avgDeviationPct === null || r.avgDeviationPct === undefined ? null : Number(r.avgDeviationPct),
    comparedCount: Number(r.comparedCount),
    minPrice: decodeMoney(r.minPrice),
    maxPrice: decodeMoney(r.maxPrice),
    firstSeenAt: Number(r.firstSeenAt),
    lastSeenAt: Number(r.lastSeenAt),
  };
}

/** `(marketplace = ? and seller = ?) or (…)` over a whole group; `1 = 0` for an empty list. */
function anySellerMatches(
  marketplaceColumn: Column,
  sellerColumn: Column,
  sellers: readonly SellerKey[],
): SQL {
  if (sellers.length === 0) return sql`1 = 0`;
  return or(...sellers.map((seller) => sellerMatches(marketplaceColumn, sellerColumn, seller)))!;
}

export async function sellerTrackedProductBreakdown(
  appDb: AppDatabase,
  window: BrandReportWindow,
  sellers: readonly SellerKey[],
  limit: number,
): Promise<SellerTrackedProductRow[]> {
  if (sellers.length === 0) return [];
  return withDialect(appDb, {
    sqlite: async (db) => {
      const o = sqliteSchema.trackedProductObservations;
      const p = sqliteSchema.trackedProducts;
      // Scoped only by the window — never by the seller filter — because the baseline is what
      // the whole page showed at that moment, not what this one seller was doing on it.
      const look = db
        .select({
          trackedProductId: o.trackedProductId,
          observedAt: o.observedAt,
          minPrice: sql<string>`min(${o.price})`.as('look_min_price'),
          avgPrice: sql<number>`avg(${sqliteNumericPrice(o.price)})`.as('look_avg_price'),
        })
        .from(o)
        .where(priceRowsClause(o, window))
        .groupBy(o.trackedProductId, o.observedAt)
        .as('look');

      const rows = await db
        .select({
          trackedProductId: o.trackedProductId,
          marketplaceCode: p.marketplaceCode,
          productLabel: sql<string>`max(${p.label})`,
          brandName: sql<string | null>`max(${p.brandName})`,
          watchedBrandId: sql<string | null>`max(${p.watchedBrandId})`,
          observedName: sql<string>`max(${o.sellerName})`,
          observationCount: sql<number>`count(*)`,
          buyboxCount: sql<number>`sum(case when ${o.rank} = 1 then 1 else 0 end)`,
          cheapestCount: sql<number>`sum(case when ${o.price} = ${look.minPrice} then 1 else 0 end)`,
          avgDeviationPct: sql<number | null>`avg(
            case when ${look.avgPrice} > 0
              then (${sqliteNumericPrice(o.price)} - ${look.avgPrice}) * 100.0 / ${look.avgPrice}
            end
          )`,
          comparedCount: sql<number>`sum(case when ${look.avgPrice} > 0 then 1 else 0 end)`,
          minPrice: sql<string | null>`min(${o.price})`,
          maxPrice: sql<string | null>`max(${o.price})`,
          firstSeenAt: sql<number>`min(${o.observedAt})`,
          lastSeenAt: sql<number>`max(${o.observedAt})`,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .innerJoin(
          look,
          and(eq(look.trackedProductId, o.trackedProductId), eq(look.observedAt, o.observedAt)),
        )
        .where(
          and(
            priceRowsClause(o, window),
            isNotNull(o.sellerRef),
            brandScopeClause(p, window),
            anySellerMatches(p.marketplaceCode, o.sellerRef, sellers),
          ),
        )
        .groupBy(o.trackedProductId, p.marketplaceCode)
        // Most recently seen first: the freshest row is the one an operator acting on a finding
        // wants at the top, and it is a stable order for the ceiling below to cut at.
        .orderBy(sql`max(${o.observedAt}) desc`)
        .limit(limit);
      return rows.map((r) => toSellerProductRow(r, decodeSqliteMoney));
    },
    postgres: async (db) => {
      const o = postgresSchema.trackedProductObservations;
      const p = postgresSchema.trackedProducts;
      const look = db
        .select({
          trackedProductId: o.trackedProductId,
          observedAt: o.observedAt,
          minPrice: sql<string>`min(${o.price})`.as('look_min_price'),
          avgPrice: sql<number>`avg(${o.price})`.as('look_avg_price'),
        })
        .from(o)
        .where(priceRowsClause(o, window))
        .groupBy(o.trackedProductId, o.observedAt)
        .as('look');

      const rows = await db
        .select({
          trackedProductId: o.trackedProductId,
          marketplaceCode: p.marketplaceCode,
          productLabel: sql<string>`max(${p.label})`,
          brandName: sql<string | null>`max(${p.brandName})`,
          watchedBrandId: sql<string | null>`max(${p.watchedBrandId})`,
          observedName: sql<string>`max(${o.sellerName})`,
          observationCount: sql<number>`count(*)`,
          buyboxCount: sql<number>`sum(case when ${o.rank} = 1 then 1 else 0 end)`,
          cheapestCount: sql<number>`sum(case when ${o.price} = ${look.minPrice} then 1 else 0 end)`,
          avgDeviationPct: sql<number | null>`avg(
            case when ${look.avgPrice} > 0
              then (${o.price} - ${look.avgPrice}) * 100.0 / ${look.avgPrice}
            end
          )`,
          comparedCount: sql<number>`sum(case when ${look.avgPrice} > 0 then 1 else 0 end)`,
          minPrice: sql<string | null>`min(${o.price})`,
          maxPrice: sql<string | null>`max(${o.price})`,
          firstSeenAt: sql<number>`min(${o.observedAt})`,
          lastSeenAt: sql<number>`max(${o.observedAt})`,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .innerJoin(
          look,
          and(eq(look.trackedProductId, o.trackedProductId), eq(look.observedAt, o.observedAt)),
        )
        .where(
          and(
            priceRowsClause(o, window),
            isNotNull(o.sellerRef),
            brandScopeClause(p, window),
            anySellerMatches(p.marketplaceCode, o.sellerRef, sellers),
          ),
        )
        .groupBy(o.trackedProductId, p.marketplaceCode)
        .orderBy(sql`max(${o.observedAt}) desc`)
        .limit(limit);
      return rows.map((r) => toSellerProductRow(r, decodeNativeMoney));
    },
    mysql: async (db) => {
      const o = mysqlSchema.trackedProductObservations;
      const p = mysqlSchema.trackedProducts;
      const look = db
        .select({
          trackedProductId: o.trackedProductId,
          observedAt: o.observedAt,
          minPrice: sql<string>`min(${o.price})`.as('look_min_price'),
          avgPrice: sql<number>`avg(${o.price})`.as('look_avg_price'),
        })
        .from(o)
        .where(priceRowsClause(o, window))
        .groupBy(o.trackedProductId, o.observedAt)
        .as('look');

      const rows = await db
        .select({
          trackedProductId: o.trackedProductId,
          marketplaceCode: p.marketplaceCode,
          productLabel: sql<string>`max(${p.label})`,
          brandName: sql<string | null>`max(${p.brandName})`,
          watchedBrandId: sql<string | null>`max(${p.watchedBrandId})`,
          observedName: sql<string>`max(${o.sellerName})`,
          observationCount: sql<number>`count(*)`,
          buyboxCount: sql<number>`sum(case when ${o.rank} = 1 then 1 else 0 end)`,
          cheapestCount: sql<number>`sum(case when ${o.price} = ${look.minPrice} then 1 else 0 end)`,
          avgDeviationPct: sql<number | null>`avg(
            case when ${look.avgPrice} > 0
              then (${o.price} - ${look.avgPrice}) * 100.0 / ${look.avgPrice}
            end
          )`,
          comparedCount: sql<number>`sum(case when ${look.avgPrice} > 0 then 1 else 0 end)`,
          minPrice: sql<string | null>`min(${o.price})`,
          maxPrice: sql<string | null>`max(${o.price})`,
          firstSeenAt: sql<number>`min(${o.observedAt})`,
          lastSeenAt: sql<number>`max(${o.observedAt})`,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .innerJoin(
          look,
          and(eq(look.trackedProductId, o.trackedProductId), eq(look.observedAt, o.observedAt)),
        )
        .where(
          and(
            priceRowsClause(o, window),
            isNotNull(o.sellerRef),
            brandScopeClause(p, window),
            anySellerMatches(p.marketplaceCode, o.sellerRef, sellers),
          ),
        )
        .groupBy(o.trackedProductId, p.marketplaceCode)
        .orderBy(sql`max(${o.observedAt}) desc`)
        .limit(limit);
      return rows.map((r) => toSellerProductRow(r, decodeNativeMoney));
    },
  });
}

/**
 * Offer rows in the window that carry no merchant id, and so appear in no seller's figures.
 * Reported next to the seller list so the screen can state its own blind spot.
 */
export async function countUnidentifiedTrackedObservations(
  appDb: AppDatabase,
  window: BrandReportWindow,
): Promise<number> {
  const value = await withDialect(appDb, {
    sqlite: async (db) => {
      const o = sqliteSchema.trackedProductObservations;
      const p = sqliteSchema.trackedProducts;
      return (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(o)
          .innerJoin(p, eq(p.id, o.trackedProductId))
          .where(and(priceRowsClause(o, window), isNull(o.sellerRef), brandScopeClause(p, window)))
      )[0]?.n;
    },
    postgres: async (db) => {
      const o = postgresSchema.trackedProductObservations;
      const p = postgresSchema.trackedProducts;
      return (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(o)
          .innerJoin(p, eq(p.id, o.trackedProductId))
          .where(and(priceRowsClause(o, window), isNull(o.sellerRef), brandScopeClause(p, window)))
      )[0]?.n;
    },
    mysql: async (db) => {
      const o = mysqlSchema.trackedProductObservations;
      const p = mysqlSchema.trackedProducts;
      return (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(o)
          .innerJoin(p, eq(p.id, o.trackedProductId))
          .where(and(priceRowsClause(o, window), isNull(o.sellerRef), brandScopeClause(p, window)))
      )[0]?.n;
    },
  });
  return Number(value ?? 0);
}

/**
 * Per seller **and product**, the ones sitting furthest below the market (doc 06 §12.4, Faz 6).
 *
 * Feeds the "deep discount on a single line" finding: a seller whose prices are unremarkable
 * everywhere except one product. That question cannot be answered from the seller aggregate,
 * which has already averaged the outlier away — it needs the pair.
 *
 * ⚠️ **Bounded by the threshold, not by the catalogue.** The full cross product of sellers and
 * products is enormous (Royal Canin alone is 4,863 products), so the operator's own
 * `deepDiscountPct` is pushed down into a `HAVING` and only pairs beyond it come back, ordered
 * worst-first and capped by `limit`. Raising the threshold on screen therefore fetches *less*,
 * not more, which is the right way round for a number an operator is invited to play with.
 *
 * The seller's mean over everything *else* is not queried: it follows arithmetically from the
 * aggregate's `avgDeviationPct` and `comparedCount` minus this pair's, which is why both rows
 * carry a compared count over the identical row set.
 */
export interface BrandSellerProductDeviationRow {
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  readonly trackedProductId: string;
  readonly productLabel: string;
  /** Negative: how far below the mean of each look this seller sat, averaged over the window. */
  readonly avgDeviationPct: number;
  readonly comparedCount: number;
}

export interface WorstDeviationOptions {
  /** Positive whole percent. Only pairs at or beyond this far **below** the market come back. */
  readonly maxDeviationPct: number;
  readonly limit: number;
}

interface RawDeviationRow {
  marketplaceCode: string;
  sellerRef: string | null;
  trackedProductId: string;
  productLabel: string | null;
  avgDeviationPct: unknown;
  comparedCount: unknown;
}

function toDeviationRow(r: RawDeviationRow): BrandSellerProductDeviationRow {
  return {
    marketplaceCode: r.marketplaceCode,
    sellerRef: r.sellerRef as string, // guaranteed by the `isNotNull` predicate on every branch
    trackedProductId: r.trackedProductId,
    productLabel: r.productLabel ?? '',
    avgDeviationPct: Number(r.avgDeviationPct),
    comparedCount: Number(r.comparedCount),
  };
}

export async function worstSellerProductDeviations(
  appDb: AppDatabase,
  window: BrandReportWindow,
  options: WorstDeviationOptions,
): Promise<BrandSellerProductDeviationRow[]> {
  const ceiling = -Math.abs(options.maxDeviationPct);
  return withDialect(appDb, {
    sqlite: async (db) => {
      const o = sqliteSchema.trackedProductObservations;
      const p = sqliteSchema.trackedProducts;
      const look = db
        .select({
          trackedProductId: o.trackedProductId,
          observedAt: o.observedAt,
          avgPrice: sql<number>`avg(${sqliteNumericPrice(o.price)})`.as('look_avg_price'),
        })
        .from(o)
        .where(priceRowsClause(o, window))
        .groupBy(o.trackedProductId, o.observedAt)
        .as('look');

      const deviation = sql<number>`avg(
        case when ${look.avgPrice} > 0
          then (${sqliteNumericPrice(o.price)} - ${look.avgPrice}) * 100.0 / ${look.avgPrice}
        end
      )`;

      const rows = await db
        .select({
          marketplaceCode: p.marketplaceCode,
          sellerRef: o.sellerRef,
          trackedProductId: o.trackedProductId,
          productLabel: sql<string>`max(${p.label})`,
          avgDeviationPct: deviation,
          comparedCount: sql<number>`sum(case when ${look.avgPrice} > 0 then 1 else 0 end)`,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .innerJoin(
          look,
          and(eq(look.trackedProductId, o.trackedProductId), eq(look.observedAt, o.observedAt)),
        )
        .where(
          and(
            priceRowsClause(o, window),
            isNotNull(o.sellerRef),
            brandScopeClause(p, window),
            excludeSellersClause(p.marketplaceCode, o.sellerRef, window),
          ),
        )
        .groupBy(p.marketplaceCode, o.sellerRef, o.trackedProductId)
        .having(sql`${deviation} <= ${ceiling}`)
        .orderBy(sql`${deviation} asc`)
        .limit(options.limit);
      return rows.map(toDeviationRow);
    },
    postgres: async (db) => {
      const o = postgresSchema.trackedProductObservations;
      const p = postgresSchema.trackedProducts;
      const look = db
        .select({
          trackedProductId: o.trackedProductId,
          observedAt: o.observedAt,
          avgPrice: sql<number>`avg(${o.price})`.as('look_avg_price'),
        })
        .from(o)
        .where(priceRowsClause(o, window))
        .groupBy(o.trackedProductId, o.observedAt)
        .as('look');

      const deviation = sql<number>`avg(
        case when ${look.avgPrice} > 0
          then (${o.price} - ${look.avgPrice}) * 100.0 / ${look.avgPrice}
        end
      )`;

      const rows = await db
        .select({
          marketplaceCode: p.marketplaceCode,
          sellerRef: o.sellerRef,
          trackedProductId: o.trackedProductId,
          productLabel: sql<string>`max(${p.label})`,
          avgDeviationPct: deviation,
          comparedCount: sql<number>`sum(case when ${look.avgPrice} > 0 then 1 else 0 end)`,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .innerJoin(
          look,
          and(eq(look.trackedProductId, o.trackedProductId), eq(look.observedAt, o.observedAt)),
        )
        .where(
          and(
            priceRowsClause(o, window),
            isNotNull(o.sellerRef),
            brandScopeClause(p, window),
            excludeSellersClause(p.marketplaceCode, o.sellerRef, window),
          ),
        )
        .groupBy(p.marketplaceCode, o.sellerRef, o.trackedProductId)
        .having(sql`${deviation} <= ${ceiling}`)
        .orderBy(sql`${deviation} asc`)
        .limit(options.limit);
      return rows.map(toDeviationRow);
    },
    mysql: async (db) => {
      const o = mysqlSchema.trackedProductObservations;
      const p = mysqlSchema.trackedProducts;
      const look = db
        .select({
          trackedProductId: o.trackedProductId,
          observedAt: o.observedAt,
          avgPrice: sql<number>`avg(${o.price})`.as('look_avg_price'),
        })
        .from(o)
        .where(priceRowsClause(o, window))
        .groupBy(o.trackedProductId, o.observedAt)
        .as('look');

      const deviation = sql<number>`avg(
        case when ${look.avgPrice} > 0
          then (${o.price} - ${look.avgPrice}) * 100.0 / ${look.avgPrice}
        end
      )`;

      const rows = await db
        .select({
          marketplaceCode: p.marketplaceCode,
          sellerRef: o.sellerRef,
          trackedProductId: o.trackedProductId,
          productLabel: sql<string>`max(${p.label})`,
          avgDeviationPct: deviation,
          comparedCount: sql<number>`sum(case when ${look.avgPrice} > 0 then 1 else 0 end)`,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .innerJoin(
          look,
          and(eq(look.trackedProductId, o.trackedProductId), eq(look.observedAt, o.observedAt)),
        )
        .where(
          and(
            priceRowsClause(o, window),
            isNotNull(o.sellerRef),
            brandScopeClause(p, window),
            excludeSellersClause(p.marketplaceCode, o.sellerRef, window),
          ),
        )
        .groupBy(p.marketplaceCode, o.sellerRef, o.trackedProductId)
        .having(sql`${deviation} <= ${ceiling}`)
        .orderBy(sql`${deviation} asc`)
        .limit(options.limit);
      return rows.map(toDeviationRow);
    },
  });
}

/**
 * The raw observations a finding was derived from (doc 06 §12.4, Faz 6).
 *
 * Faz 6's definition of done is that every finding opens to the thing it came out of, and the
 * thing it came out of is **the look**: one product at one moment, with every offer that was on
 * the page. Returning only the subject's own rows would show a price with nothing to read it
 * against — and "22% below the market" is a statement about the other rows, not about that one.
 *
 * Two queries rather than one: the looks the subject appears in, most recent first and capped;
 * then every offer belonging to those looks. A single query would either fetch the whole window
 * or hand back a page of rows torn out of the middle of a look, which is not evidence.
 */
export interface EvidenceOffer {
  readonly sellerRef: string | null;
  readonly sellerName: string | null;
  readonly rank: number | null;
  readonly price: bigint | null;
  readonly finalPrice: bigint | null;
  readonly offeredStock: number | null;
}

export interface EvidenceLook {
  readonly trackedProductId: string;
  readonly productLabel: string;
  readonly productUrl: string;
  readonly marketplaceCode: string;
  readonly observedAt: number;
  readonly offers: readonly EvidenceOffer[];
}

export interface EvidenceQuery {
  readonly sinceMs: number;
  readonly untilMs: number;
  /** Present for a seller-subject finding; the looks this seller appeared in. */
  readonly seller?: SellerKey;
  /** Present for a product-subject finding; that product's looks. Both may be given together. */
  readonly trackedProductId?: string;
  /** How many looks to open. A handful is evidence; a hundred is another report. */
  readonly limit: number;
}

interface LookKey {
  trackedProductId: string;
  observedAt: number;
}

export async function evidenceLooks(appDb: AppDatabase, query: EvidenceQuery): Promise<EvidenceLook[]> {
  const window: BrandReportWindow = { sinceMs: query.sinceMs, untilMs: query.untilMs };

  return withDialect(appDb, {
    sqlite: async (db) => {
      const o = sqliteSchema.trackedProductObservations;
      const p = sqliteSchema.trackedProducts;
      const keys = (await db
        .selectDistinct({ trackedProductId: o.trackedProductId, observedAt: o.observedAt })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .where(and(priceRowsClause(o, window), evidenceSubjectClause(o, p, query)))
        .orderBy(sql`${o.observedAt} desc`)
        .limit(query.limit)) as LookKey[];
      if (keys.length === 0) return [];
      const rows = await db
        .select({
          trackedProductId: o.trackedProductId,
          observedAt: o.observedAt,
          productLabel: p.label,
          productUrl: p.productUrl,
          marketplaceCode: p.marketplaceCode,
          sellerRef: o.sellerRef,
          sellerName: o.sellerName,
          rank: o.rank,
          price: o.price,
          finalPrice: o.finalPrice,
          offeredStock: o.offeredStock,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .where(lookKeysClause(o, keys))
        .orderBy(sql`${o.observedAt} desc`, sql`${o.rank} asc`);
      return groupEvidence(keys, rows);
    },
    postgres: async (db) => {
      const o = postgresSchema.trackedProductObservations;
      const p = postgresSchema.trackedProducts;
      const keys = (await db
        .selectDistinct({ trackedProductId: o.trackedProductId, observedAt: o.observedAt })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .where(and(priceRowsClause(o, window), evidenceSubjectClause(o, p, query)))
        .orderBy(sql`${o.observedAt} desc`)
        .limit(query.limit)) as LookKey[];
      if (keys.length === 0) return [];
      const rows = await db
        .select({
          trackedProductId: o.trackedProductId,
          observedAt: o.observedAt,
          productLabel: p.label,
          productUrl: p.productUrl,
          marketplaceCode: p.marketplaceCode,
          sellerRef: o.sellerRef,
          sellerName: o.sellerName,
          rank: o.rank,
          price: o.price,
          finalPrice: o.finalPrice,
          offeredStock: o.offeredStock,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .where(lookKeysClause(o, keys))
        .orderBy(sql`${o.observedAt} desc`, sql`${o.rank} asc`);
      return groupEvidence(keys, rows);
    },
    mysql: async (db) => {
      const o = mysqlSchema.trackedProductObservations;
      const p = mysqlSchema.trackedProducts;
      const keys = (await db
        .selectDistinct({ trackedProductId: o.trackedProductId, observedAt: o.observedAt })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .where(and(priceRowsClause(o, window), evidenceSubjectClause(o, p, query)))
        .orderBy(sql`${o.observedAt} desc`)
        .limit(query.limit)) as LookKey[];
      if (keys.length === 0) return [];
      const rows = await db
        .select({
          trackedProductId: o.trackedProductId,
          observedAt: o.observedAt,
          productLabel: p.label,
          productUrl: p.productUrl,
          marketplaceCode: p.marketplaceCode,
          sellerRef: o.sellerRef,
          sellerName: o.sellerName,
          rank: o.rank,
          price: o.price,
          finalPrice: o.finalPrice,
          offeredStock: o.offeredStock,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .where(lookKeysClause(o, keys))
        .orderBy(sql`${o.observedAt} desc`, sql`${o.rank} asc`);
      return groupEvidence(keys, rows);
    },
  });
}

/** Which looks to open: the seller's, the product's, or the intersection when both are given. */
function evidenceSubjectClause(
  o: ObservationsTable,
  p: ProductsTable,
  query: EvidenceQuery,
): SQL | undefined {
  const parts: SQL[] = [];
  if (query.trackedProductId !== undefined) parts.push(eq(o.trackedProductId, query.trackedProductId));
  if (query.seller !== undefined) {
    parts.push(sellerMatches(p.marketplaceCode, o.sellerRef, query.seller));
  }
  return parts.length === 0 ? undefined : and(...parts);
}

/**
 * `(product, moment) in (…)` written as an OR of pairs.
 *
 * A row-value `IN` would be shorter and MySQL and PostgreSQL both take it, but SQLite does not,
 * and the list is at most `limit` long — bounded by the caller, not by the archive.
 */
function lookKeysClause(o: ObservationsTable, keys: readonly LookKey[]): SQL {
  return or(
    ...keys.map((key) => and(eq(o.trackedProductId, key.trackedProductId), eq(o.observedAt, key.observedAt))!),
  )!;
}

interface RawEvidenceRow {
  trackedProductId: string;
  observedAt: number;
  productLabel: string;
  productUrl: string;
  marketplaceCode: string;
  sellerRef: string | null;
  sellerName: string | null;
  rank: number | null;
  /**
   * Already a `bigint`: these are the money **columns**, whose custom type decodes on the way
   * out on every dialect. The aggregate queries next door decode by hand only because they
   * build raw SQL expressions, which bypass that mapping entirely.
   */
  price: bigint | null;
  finalPrice: bigint | null;
  offeredStock: number | null;
}

/**
 * Groups the offer rows back into looks, in the order the keys came back — newest first.
 *
 * Driven by `keys` rather than by the rows so a look that turns out to hold only unpriced
 * offers still appears, as an empty one. Silently dropping it would show the operator a gap in
 * the history where what actually happened was a look that read nothing.
 */
function groupEvidence(keys: readonly LookKey[], rows: readonly RawEvidenceRow[]): EvidenceLook[] {
  const byKey = new Map<string, RawEvidenceRow[]>();
  for (const row of rows) {
    const k = `${row.trackedProductId}::${row.observedAt}`;
    const list = byKey.get(k);
    if (list) list.push(row);
    else byKey.set(k, [row]);
  }
  return keys.flatMap((key) => {
    const group = byKey.get(`${key.trackedProductId}::${key.observedAt}`);
    if (group === undefined || group.length === 0) return [];
    const first = group[0]!;
    return [
      {
        trackedProductId: key.trackedProductId,
        observedAt: Number(key.observedAt),
        productLabel: first.productLabel,
        productUrl: first.productUrl,
        marketplaceCode: first.marketplaceCode,
        offers: group.map((row) => ({
          sellerRef: row.sellerRef,
          sellerName: row.sellerName,
          rank: row.rank === null ? null : Number(row.rank),
          price: row.price,
          finalPrice: row.finalPrice,
          offeredStock: row.offeredStock === null ? null : Number(row.offeredStock),
        })),
      },
    ];
  });
}

/** A product page a seller was seen on, and when — the way in to a merchant-scoped request. */
export interface SellerProductTarget {
  readonly trackedProductId: string;
  readonly marketplaceCode: string;
  /** Trendyol `contentId` / Hepsiburada SKU — `ProductPageRef.contentId`. */
  readonly productRef: string;
  readonly productUrl: string;
  readonly lastSeenAt: number;
}

/**
 * Product pages this seller was recently observed offering, newest first.
 *
 * Faz 7 resolves a seller's identity *through* a product page requested as that merchant, so it
 * needs a page the seller is actually on. Several are returned rather than one, and that is the
 * point: a seller can be gone from a product between the last look and the resolution, and the
 * page then comes back describing whoever holds the buybox instead — an `identityMismatch`, the
 * one failure that must never be stored. The caller walks the list until one page answers about
 * the right firm.
 *
 * Ordered by *most recently seen*, because the freshest look is the likeliest to still be true.
 */
export async function sellerProductTargets(
  appDb: AppDatabase,
  seller: SellerKey,
  window: BrandReportWindow,
  limit: number,
): Promise<SellerProductTarget[]> {
  // Written out per dialect, like every other query here: a shared builder cannot be typed
  // across the three column unions without erasing the very types that catch a mistyped column.
  const rows = await withDialect(appDb, {
    sqlite: (db) => {
      const o = sqliteSchema.trackedProductObservations;
      const p = sqliteSchema.trackedProducts;
      return db
        .select({
          trackedProductId: o.trackedProductId,
          marketplaceCode: p.marketplaceCode,
          productRef: p.productRef,
          productUrl: p.productUrl,
          lastSeenAt: sql<number>`max(${o.observedAt})`,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .where(and(okRowsClause(o, window), sellerMatches(p.marketplaceCode, o.sellerRef, seller)))
        .groupBy(o.trackedProductId, p.marketplaceCode, p.productRef, p.productUrl)
        .orderBy(sql`max(${o.observedAt}) desc`)
        .limit(limit);
    },
    postgres: (db) => {
      const o = postgresSchema.trackedProductObservations;
      const p = postgresSchema.trackedProducts;
      return db
        .select({
          trackedProductId: o.trackedProductId,
          marketplaceCode: p.marketplaceCode,
          productRef: p.productRef,
          productUrl: p.productUrl,
          lastSeenAt: sql<number>`max(${o.observedAt})`,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .where(and(okRowsClause(o, window), sellerMatches(p.marketplaceCode, o.sellerRef, seller)))
        .groupBy(o.trackedProductId, p.marketplaceCode, p.productRef, p.productUrl)
        .orderBy(sql`max(${o.observedAt}) desc`)
        .limit(limit);
    },
    mysql: (db) => {
      const o = mysqlSchema.trackedProductObservations;
      const p = mysqlSchema.trackedProducts;
      return db
        .select({
          trackedProductId: o.trackedProductId,
          marketplaceCode: p.marketplaceCode,
          productRef: p.productRef,
          productUrl: p.productUrl,
          lastSeenAt: sql<number>`max(${o.observedAt})`,
        })
        .from(o)
        .innerJoin(p, eq(p.id, o.trackedProductId))
        .where(and(okRowsClause(o, window), sellerMatches(p.marketplaceCode, o.sellerRef, seller)))
        .groupBy(o.trackedProductId, p.marketplaceCode, p.productRef, p.productUrl)
        .orderBy(sql`max(${o.observedAt}) desc`)
        .limit(limit);
    },
  });

  // `max(...)` comes back as a string from node-postgres and mysql2; coerced at the boundary
  // like every other aggregate in this file.
  return rows.map((row) => ({
    trackedProductId: row.trackedProductId,
    marketplaceCode: row.marketplaceCode,
    productRef: row.productRef,
    productUrl: row.productUrl,
    lastSeenAt: Number(row.lastSeenAt),
  }));
}
