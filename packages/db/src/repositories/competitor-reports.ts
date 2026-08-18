/**
 * Seller-centric aggregations over the competitor archive (doc 06 §6, doc 12 Phase 10B).
 *
 * These are deliberately **`GROUP BY` queries, not row fetches.** The listing-centric reports
 * next door in `competition.ts` pull a bounded slice of rows and total them in JS, which is
 * sound while a report's scope is one listing: a listing produces at most a batch an hour, so
 * a month of it is a few hundred rows.
 *
 * A seller-centric report has no such bound — it spans every listing the seller appears on.
 * At the 2,000-listing target a single seller's 30-day profile is roughly 29,000 offer rows
 * and a six-month one is over 175,000, against `competitorObservationsInRange`'s 20,000-row
 * cap. Fetch-then-count there does not fail; it silently answers from the first 20,000 rows,
 * which is worse than failing. Counting in the database removes the cap from the question
 * entirely, and keeps the same shape when these queries are later repointed at the daily
 * rollup (doc 05 §10).
 *
 * Driver note: `count`/`sum`/`avg` come back as strings from node-postgres and as numbers or
 * strings from mysql2 depending on the type. Every numeric aggregate is therefore coerced with
 * `Number(...)` at the boundary of each branch rather than trusted as returned — money is the
 * one exception, and is handled explicitly below.
 */
import { and, eq, gte, isNotNull, isNull, lte, not, or, sql, type Column, type SQL } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { decodeSortableBigint } from '../sortable-bigint.js';
import { withDialect } from '../with-dialect.js';

/** One seller on one marketplace. A ref is a marketplace's own id and is not unique across them. */
export interface SellerKey {
  readonly marketplaceCode: string;
  readonly sellerRef: string;
}

export interface ReportWindow {
  readonly sinceMs: number;
  readonly untilMs: number;
  readonly marketplaceCode?: string;
  /**
   * Sellers to leave out — in practice our own stores (`marketplaces.merchant_ref`).
   *
   * We appear in our own competitor archive because the scrape records the whole offer list,
   * which is right: our rank is only meaningful next to the offers it is a rank among. But a
   * report of *competitors* that counts our own store answers the wrong question — it puts us
   * at the top of every overlap list, on 100% of our own listings, by construction.
   *
   * Excluded here rather than in the archive so the observation rows stay a faithful record of
   * what the page showed. Keyed by marketplace *and* ref, never by ref alone: the same digits
   * are different companies on different marketplaces.
   */
  readonly excludeSellers?: readonly SellerKey[];
  /**
   * Restrict to these sellers — the mirror of `excludeSellers`, and the reason the two live
   * together. The competitor list asks for everyone *except* our stores; the "how are we doing"
   * line on the same screen asks for *only* our stores. One query shape answers both, so the
   * two figures cannot drift apart through separate implementations.
   *
   * An empty array means "no seller matches" and returns nothing, which is different from
   * `undefined` ("no restriction"). Callers that pass a computed list of our own stores get the
   * safe reading when nothing is configured.
   */
  readonly onlySellers?: readonly SellerKey[];
}

/** `(marketplace = ? and seller = ?)` for one seller — the pair both filters are built from. */
function sellerMatches(marketplaceColumn: Column, sellerColumn: Column, seller: SellerKey): SQL {
  return and(eq(marketplaceColumn, seller.marketplaceCode), eq(sellerColumn, seller.sellerRef))!;
}

/**
 * `not(...)` per excluded seller. Returns `undefined` when there is nothing to exclude, which
 * composes with `and(...)` exactly like the other optional filters.
 */
function excludeSellersClause(
  marketplaceColumn: Column,
  sellerColumn: Column,
  window: ReportWindow,
): SQL | undefined {
  const excluded = window.excludeSellers;
  if (!excluded || excluded.length === 0) return undefined;
  return and(
    ...excluded.map((seller) => not(sellerMatches(marketplaceColumn, sellerColumn, seller))),
  );
}

/**
 * `or(...)` over the allowed sellers. An empty list yields a false predicate rather than no
 * predicate: "restrict to none of them" must return nothing, not everything.
 */
function onlySellersClause(
  marketplaceColumn: Column,
  sellerColumn: Column,
  window: ReportWindow,
): SQL | undefined {
  const only = window.onlySellers;
  if (only === undefined) return undefined;
  if (only.length === 0) return sql`1 = 0`;
  return or(...only.map((seller) => sellerMatches(marketplaceColumn, sellerColumn, seller)));
}

/**
 * Money aggregates need one dialect-aware step that nothing else here does. SQLite stores
 * kuruş as the zero-padded sortable text `sortable-bigint.ts` defines — `min()`/`max()` over
 * it are correct precisely because that encoding sorts lexicographically in numeric order, but
 * what comes back is the encoding, not the number. PostgreSQL and MySQL return their native
 * 64-bit integer. Each branch decodes its own representation so callers see `bigint` kuruş
 * regardless of engine (the hard rule: money is never a JS `number`, in any layer).
 */
function decodeSqliteMoney(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  return decodeSortableBigint(String(value));
}

function decodeNativeMoney(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  return BigInt(value as string | number | bigint);
}

/** One row per identified seller, across every listing they were seen on in the window. */
export interface SellerAggregateRow {
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  /**
   * The name as recorded on the observations *in this window*, not the seller's name today.
   * A historical report should read the way the archive read at the time; the current name
   * lives on `competitor_sellers` and callers that want it join for it.
   */
  readonly observedName: string;
  /** How many of our listings this seller was seen on — the "overlap" figure. */
  readonly listingCount: number;
  /** Offer rows: how many recorded seller sets included them. */
  readonly observationCount: number;
  /** Of those, how many had them at rank 1. */
  readonly buyboxCount: number;
  readonly avgRank: number | null;
  readonly minPrice: bigint | null;
  readonly maxPrice: bigint | null;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
}

interface RawSellerAggregate {
  marketplaceCode: string;
  sellerRef: string | null;
  observedName: string | null;
  listingCount: unknown;
  observationCount: unknown;
  buyboxCount: unknown;
  avgRank: unknown;
  minPrice: unknown;
  maxPrice: unknown;
  firstSeenAt: unknown;
  lastSeenAt: unknown;
}

function toSellerRow(
  r: RawSellerAggregate,
  decodeMoney: (v: unknown) => bigint | null,
): SellerAggregateRow {
  return {
    marketplaceCode: r.marketplaceCode,
    sellerRef: r.sellerRef as string, // guaranteed by the `isNotNull` predicate on every branch
    observedName: r.observedName ?? '',
    listingCount: Number(r.listingCount),
    observationCount: Number(r.observationCount),
    buyboxCount: Number(r.buyboxCount),
    avgRank: r.avgRank === null || r.avgRank === undefined ? null : Number(r.avgRank),
    minPrice: decodeMoney(r.minPrice),
    maxPrice: decodeMoney(r.maxPrice),
    firstSeenAt: Number(r.firstSeenAt),
    lastSeenAt: Number(r.lastSeenAt),
  };
}

/**
 * The `/competitors/sellers` list (doc 06 §6): who competes with us, and on how much of the
 * catalogue. Ordered by overlap descending — "who do we compete with most" is not a separate
 * report, it is this list's default order.
 *
 * **Only identified sellers appear.** `competitor_observations.seller_ref` is nullable, and an
 * offer with no merchant id cannot be attributed to anyone across time — grouping those by
 * display name is exactly the identity mistake doc 05 §5 refuses to make. They are not
 * silently dropped either: `countUnidentifiedObservations` reports the residue so a screen can
 * say how much of the window it is not describing.
 */
export async function sellerAggregatesInRange(
  appDb: AppDatabase,
  window: ReportWindow,
): Promise<SellerAggregateRow[]> {
  return withDialect(appDb, {
    sqlite: async (db) => {
      const co = sqliteSchema.competitorObservations;
      const l = sqliteSchema.listings;
      const rows = await db
        .select({
          marketplaceCode: l.marketplaceCode,
          sellerRef: co.sellerRef,
          observedName: sql<string>`max(${co.sellerName})`,
          listingCount: sql<number>`count(distinct ${co.listingId})`,
          observationCount: sql<number>`count(*)`,
          buyboxCount: sql<number>`sum(case when ${co.rank} = 1 then 1 else 0 end)`,
          avgRank: sql<number>`avg(${co.rank})`,
          minPrice: sql<string | null>`min(${co.price})`,
          maxPrice: sql<string | null>`max(${co.price})`,
          firstSeenAt: sql<number>`min(${co.observedAt})`,
          lastSeenAt: sql<number>`max(${co.observedAt})`,
        })
        .from(co)
        .innerJoin(l, eq(l.id, co.listingId))
        .where(
          and(
            gte(co.observedAt, window.sinceMs),
            lte(co.observedAt, window.untilMs),
            isNotNull(co.sellerRef),
            window.marketplaceCode ? eq(l.marketplaceCode, window.marketplaceCode) : undefined,
            excludeSellersClause(l.marketplaceCode, co.sellerRef, window),
            onlySellersClause(l.marketplaceCode, co.sellerRef, window),
          ),
        )
        .groupBy(l.marketplaceCode, co.sellerRef)
        .orderBy(sql`count(distinct ${co.listingId}) desc`);
      return rows.map((r) => toSellerRow(r, decodeSqliteMoney));
    },
    postgres: async (db) => {
      const co = postgresSchema.competitorObservations;
      const l = postgresSchema.listings;
      const rows = await db
        .select({
          marketplaceCode: l.marketplaceCode,
          sellerRef: co.sellerRef,
          observedName: sql<string>`max(${co.sellerName})`,
          listingCount: sql<number>`count(distinct ${co.listingId})`,
          observationCount: sql<number>`count(*)`,
          buyboxCount: sql<number>`sum(case when ${co.rank} = 1 then 1 else 0 end)`,
          avgRank: sql<number>`avg(${co.rank})`,
          minPrice: sql<string | null>`min(${co.price})`,
          maxPrice: sql<string | null>`max(${co.price})`,
          firstSeenAt: sql<number>`min(${co.observedAt})`,
          lastSeenAt: sql<number>`max(${co.observedAt})`,
        })
        .from(co)
        .innerJoin(l, eq(l.id, co.listingId))
        .where(
          and(
            gte(co.observedAt, window.sinceMs),
            lte(co.observedAt, window.untilMs),
            isNotNull(co.sellerRef),
            window.marketplaceCode ? eq(l.marketplaceCode, window.marketplaceCode) : undefined,
            excludeSellersClause(l.marketplaceCode, co.sellerRef, window),
            onlySellersClause(l.marketplaceCode, co.sellerRef, window),
          ),
        )
        .groupBy(l.marketplaceCode, co.sellerRef)
        .orderBy(sql`count(distinct ${co.listingId}) desc`);
      return rows.map((r) => toSellerRow(r, decodeNativeMoney));
    },
    mysql: async (db) => {
      const co = mysqlSchema.competitorObservations;
      const l = mysqlSchema.listings;
      const rows = await db
        .select({
          marketplaceCode: l.marketplaceCode,
          sellerRef: co.sellerRef,
          observedName: sql<string>`max(${co.sellerName})`,
          listingCount: sql<number>`count(distinct ${co.listingId})`,
          observationCount: sql<number>`count(*)`,
          buyboxCount: sql<number>`sum(case when ${co.rank} = 1 then 1 else 0 end)`,
          avgRank: sql<number>`avg(${co.rank})`,
          minPrice: sql<string | null>`min(${co.price})`,
          maxPrice: sql<string | null>`max(${co.price})`,
          firstSeenAt: sql<number>`min(${co.observedAt})`,
          lastSeenAt: sql<number>`max(${co.observedAt})`,
        })
        .from(co)
        .innerJoin(l, eq(l.id, co.listingId))
        .where(
          and(
            gte(co.observedAt, window.sinceMs),
            lte(co.observedAt, window.untilMs),
            isNotNull(co.sellerRef),
            window.marketplaceCode ? eq(l.marketplaceCode, window.marketplaceCode) : undefined,
            excludeSellersClause(l.marketplaceCode, co.sellerRef, window),
            onlySellersClause(l.marketplaceCode, co.sellerRef, window),
          ),
        )
        .groupBy(l.marketplaceCode, co.sellerRef)
        .orderBy(sql`count(distinct ${co.listingId}) desc`);
      return rows.map((r) => toSellerRow(r, decodeNativeMoney));
    },
  });
}

/**
 * Offer rows in the window that carry no merchant id, and so appear in no seller's figures.
 * Reported next to the seller list so the screen can state its own blind spot rather than
 * imply the list is exhaustive.
 */
export async function countUnidentifiedObservations(
  appDb: AppDatabase,
  window: ReportWindow,
): Promise<number> {
  const value = await withDialect(appDb, {
    sqlite: async (db) => {
      const co = sqliteSchema.competitorObservations;
      const l = sqliteSchema.listings;
      return (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(co)
          .innerJoin(l, eq(l.id, co.listingId))
          .where(
            and(
              gte(co.observedAt, window.sinceMs),
              lte(co.observedAt, window.untilMs),
              isNull(co.sellerRef),
              window.marketplaceCode ? eq(l.marketplaceCode, window.marketplaceCode) : undefined,
            ),
          )
      )[0]?.n;
    },
    postgres: async (db) => {
      const co = postgresSchema.competitorObservations;
      const l = postgresSchema.listings;
      return (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(co)
          .innerJoin(l, eq(l.id, co.listingId))
          .where(
            and(
              gte(co.observedAt, window.sinceMs),
              lte(co.observedAt, window.untilMs),
              isNull(co.sellerRef),
              window.marketplaceCode ? eq(l.marketplaceCode, window.marketplaceCode) : undefined,
            ),
          )
      )[0]?.n;
    },
    mysql: async (db) => {
      const co = mysqlSchema.competitorObservations;
      const l = mysqlSchema.listings;
      return (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(co)
          .innerJoin(l, eq(l.id, co.listingId))
          .where(
            and(
              gte(co.observedAt, window.sinceMs),
              lte(co.observedAt, window.untilMs),
              isNull(co.sellerRef),
              window.marketplaceCode ? eq(l.marketplaceCode, window.marketplaceCode) : undefined,
            ),
          )
      )[0]?.n;
    },
  });
  return Number(value ?? 0);
}

/** One row per listing a given seller was seen on — the seller-detail breakdown. */
export interface SellerListingRow {
  readonly listingId: string;
  /** The seller's name as carried by the offers on this listing, for callers with no durable record yet. */
  readonly observedName: string;
  readonly marketplaceListingId: string;
  readonly productName: string;
  readonly baseStockCode: string | null;
  readonly ourPrice: bigint;
  readonly observationCount: number;
  readonly buyboxCount: number;
  readonly avgRank: number | null;
  readonly minPrice: bigint | null;
  readonly maxPrice: bigint | null;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
}

interface RawSellerListing {
  listingId: string;
  observedName: string | null;
  marketplaceListingId: string;
  productName: string;
  baseStockCode: string | null;
  ourPrice: unknown;
  observationCount: unknown;
  buyboxCount: unknown;
  avgRank: unknown;
  minPrice: unknown;
  maxPrice: unknown;
  firstSeenAt: unknown;
  lastSeenAt: unknown;
}

function toSellerListingRow(
  r: RawSellerListing,
  decodeMoney: (v: unknown) => bigint | null,
): SellerListingRow {
  return {
    listingId: r.listingId,
    observedName: r.observedName ?? '',
    marketplaceListingId: r.marketplaceListingId,
    productName: r.productName,
    baseStockCode: r.baseStockCode,
    // Not an aggregate: `listings.price` is grouped by, so it comes back through the driver's
    // own column decoding and is already a bigint on every dialect.
    ourPrice: r.ourPrice as bigint,
    observationCount: Number(r.observationCount),
    buyboxCount: Number(r.buyboxCount),
    avgRank: r.avgRank === null || r.avgRank === undefined ? null : Number(r.avgRank),
    minPrice: decodeMoney(r.minPrice),
    maxPrice: decodeMoney(r.maxPrice),
    firstSeenAt: Number(r.firstSeenAt),
    lastSeenAt: Number(r.lastSeenAt),
  };
}

/**
 * `/competitors/sellers/[marketplace]/[ref]`: every product of ours this seller competed on in
 * the window, with how they priced against us.
 *
 * `sellerRefs` is a list rather than a single ref so a caller can pass the expansion of a
 * seller **group** (`competitorSellersRepo.expandSellerGroup`) and get one combined view of a
 * company across marketplaces — the whole point of grouping.
 */
export async function sellerListingBreakdown(
  appDb: AppDatabase,
  window: ReportWindow,
  sellerRefs: readonly string[],
): Promise<SellerListingRow[]> {
  if (sellerRefs.length === 0) return [];
  const refs = [...sellerRefs];
  return withDialect(appDb, {
    sqlite: async (db) => {
      const co = sqliteSchema.competitorObservations;
      const l = sqliteSchema.listings;
      const rows = await db
        .select({
          listingId: co.listingId,
          observedName: sql<string>`max(${co.sellerName})`,
          marketplaceListingId: l.marketplaceListingId,
          productName: l.productName,
          baseStockCode: l.baseStockCode,
          ourPrice: l.price,
          observationCount: sql<number>`count(*)`,
          buyboxCount: sql<number>`sum(case when ${co.rank} = 1 then 1 else 0 end)`,
          avgRank: sql<number>`avg(${co.rank})`,
          minPrice: sql<string | null>`min(${co.price})`,
          maxPrice: sql<string | null>`max(${co.price})`,
          firstSeenAt: sql<number>`min(${co.observedAt})`,
          lastSeenAt: sql<number>`max(${co.observedAt})`,
        })
        .from(co)
        .innerJoin(l, eq(l.id, co.listingId))
        .where(
          and(
            gte(co.observedAt, window.sinceMs),
            lte(co.observedAt, window.untilMs),
            sql`${co.sellerRef} in ${refs}`,
            window.marketplaceCode ? eq(l.marketplaceCode, window.marketplaceCode) : undefined,
          ),
        )
        .groupBy(co.listingId, l.marketplaceListingId, l.productName, l.baseStockCode, l.price)
        .orderBy(sql`max(${co.observedAt}) desc`);
      return rows.map((r) => toSellerListingRow(r, decodeSqliteMoney));
    },
    postgres: async (db) => {
      const co = postgresSchema.competitorObservations;
      const l = postgresSchema.listings;
      const rows = await db
        .select({
          listingId: co.listingId,
          observedName: sql<string>`max(${co.sellerName})`,
          marketplaceListingId: l.marketplaceListingId,
          productName: l.productName,
          baseStockCode: l.baseStockCode,
          ourPrice: l.price,
          observationCount: sql<number>`count(*)`,
          buyboxCount: sql<number>`sum(case when ${co.rank} = 1 then 1 else 0 end)`,
          avgRank: sql<number>`avg(${co.rank})`,
          minPrice: sql<string | null>`min(${co.price})`,
          maxPrice: sql<string | null>`max(${co.price})`,
          firstSeenAt: sql<number>`min(${co.observedAt})`,
          lastSeenAt: sql<number>`max(${co.observedAt})`,
        })
        .from(co)
        .innerJoin(l, eq(l.id, co.listingId))
        .where(
          and(
            gte(co.observedAt, window.sinceMs),
            lte(co.observedAt, window.untilMs),
            sql`${co.sellerRef} in ${refs}`,
            window.marketplaceCode ? eq(l.marketplaceCode, window.marketplaceCode) : undefined,
          ),
        )
        .groupBy(co.listingId, l.marketplaceListingId, l.productName, l.baseStockCode, l.price)
        .orderBy(sql`max(${co.observedAt}) desc`);
      return rows.map((r) => toSellerListingRow(r, decodeNativeMoney));
    },
    mysql: async (db) => {
      const co = mysqlSchema.competitorObservations;
      const l = mysqlSchema.listings;
      const rows = await db
        .select({
          listingId: co.listingId,
          observedName: sql<string>`max(${co.sellerName})`,
          marketplaceListingId: l.marketplaceListingId,
          productName: l.productName,
          baseStockCode: l.baseStockCode,
          ourPrice: l.price,
          observationCount: sql<number>`count(*)`,
          buyboxCount: sql<number>`sum(case when ${co.rank} = 1 then 1 else 0 end)`,
          avgRank: sql<number>`avg(${co.rank})`,
          minPrice: sql<string | null>`min(${co.price})`,
          maxPrice: sql<string | null>`max(${co.price})`,
          firstSeenAt: sql<number>`min(${co.observedAt})`,
          lastSeenAt: sql<number>`max(${co.observedAt})`,
        })
        .from(co)
        .innerJoin(l, eq(l.id, co.listingId))
        .where(
          and(
            gte(co.observedAt, window.sinceMs),
            lte(co.observedAt, window.untilMs),
            sql`${co.sellerRef} in ${refs}`,
            window.marketplaceCode ? eq(l.marketplaceCode, window.marketplaceCode) : undefined,
          ),
        )
        .groupBy(co.listingId, l.marketplaceListingId, l.productName, l.baseStockCode, l.price)
        .orderBy(sql`max(${co.observedAt}) desc`);
      return rows.map((r) => toSellerListingRow(r, decodeNativeMoney));
    },
  });
}

/**
 * Scrape coverage for the window, as counts rather than rows (doc 06 §6 "observation
 * coverage"). This is the denominator every other figure on a seller screen rests on: 397
 * successful scrapes and 433 failed ones — the live archive's own numbers before Playwright
 * landed — describe a very different report from the same seller counts with full coverage.
 */
export interface CoverageSummary {
  readonly ok: number;
  readonly parseFailed: number;
  readonly fetchFailed: number;
  readonly firstAt: number | null;
  readonly lastOkAt: number | null;
}

export async function coverageInRange(
  appDb: AppDatabase,
  window: ReportWindow,
): Promise<CoverageSummary> {
  const rows = await withDialect(appDb, {
    sqlite: async (db) => {
      const sr = sqliteSchema.scrapeRuns;
      const l = sqliteSchema.listings;
      return db
        .select({
          status: sr.status,
          n: sql<number>`count(*)`,
          firstAt: sql<number>`min(${sr.observedAt})`,
          lastAt: sql<number>`max(${sr.observedAt})`,
        })
        .from(sr)
        .innerJoin(l, eq(l.id, sr.listingId))
        .where(
          and(
            gte(sr.observedAt, window.sinceMs),
            lte(sr.observedAt, window.untilMs),
            window.marketplaceCode ? eq(l.marketplaceCode, window.marketplaceCode) : undefined,
          ),
        )
        .groupBy(sr.status);
    },
    postgres: async (db) => {
      const sr = postgresSchema.scrapeRuns;
      const l = postgresSchema.listings;
      return db
        .select({
          status: sr.status,
          n: sql<number>`count(*)`,
          firstAt: sql<number>`min(${sr.observedAt})`,
          lastAt: sql<number>`max(${sr.observedAt})`,
        })
        .from(sr)
        .innerJoin(l, eq(l.id, sr.listingId))
        .where(
          and(
            gte(sr.observedAt, window.sinceMs),
            lte(sr.observedAt, window.untilMs),
            window.marketplaceCode ? eq(l.marketplaceCode, window.marketplaceCode) : undefined,
          ),
        )
        .groupBy(sr.status);
    },
    mysql: async (db) => {
      const sr = mysqlSchema.scrapeRuns;
      const l = mysqlSchema.listings;
      return db
        .select({
          status: sr.status,
          n: sql<number>`count(*)`,
          firstAt: sql<number>`min(${sr.observedAt})`,
          lastAt: sql<number>`max(${sr.observedAt})`,
        })
        .from(sr)
        .innerJoin(l, eq(l.id, sr.listingId))
        .where(
          and(
            gte(sr.observedAt, window.sinceMs),
            lte(sr.observedAt, window.untilMs),
            window.marketplaceCode ? eq(l.marketplaceCode, window.marketplaceCode) : undefined,
          ),
        )
        .groupBy(sr.status);
    },
  });

  const byStatus = (status: string) => rows.find((r) => r.status === status);
  const firsts = rows.map((r) => Number(r.firstAt)).filter((n) => Number.isFinite(n));
  return {
    ok: Number(byStatus('ok')?.n ?? 0),
    parseFailed: Number(byStatus('parseFailed')?.n ?? 0),
    fetchFailed: Number(byStatus('fetchFailed')?.n ?? 0),
    firstAt: firsts.length > 0 ? Math.min(...firsts) : null,
    // Freshness is measured from successful looks only. A job failing every hour is not a
    // fresh report, and reading `max(observed_at)` across all statuses would say it was.
    lastOkAt: byStatus('ok') ? Number(byStatus('ok')!.lastAt) : null,
  };
}

/** A distinct (product, marketplace, seller) sighting — the input to cross-marketplace overlap. */
export interface ProductSellerTuple {
  readonly baseStockCode: string;
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  readonly observedName: string;
  readonly productName: string;
}

/**
 * Distinct product/marketplace/seller sightings in the window, for the cross-marketplace
 * overlap export (doc 12 Phase 10B): "which of our products sell on both marketplaces, with the
 * same competitor on both".
 *
 * Returned as distinct tuples rather than a finished report because the last step — deciding
 * that Trendyol's seller X *is* Hepsiburada's seller Y — is an operator assertion held in
 * `competitor_seller_groups`, not something SQL can join its way to. `DISTINCT` collapses a
 * window's worth of repeated observations to one row per pairing first, so what the caller
 * groups is a few thousand rows rather than the whole archive.
 *
 * Listings with no `base_stock_code` are excluded: without one there is no identity tying the
 * two marketplaces' listings to the same product, which is the entire question here.
 */
export async function productSellerTuplesInRange(
  appDb: AppDatabase,
  window: ReportWindow,
  limit = 50_000,
): Promise<ProductSellerTuple[]> {
  const rows = await withDialect(appDb, {
    sqlite: (db) => {
      const co = sqliteSchema.competitorObservations;
      const l = sqliteSchema.listings;
      return db
        .selectDistinct({
          baseStockCode: l.baseStockCode,
          marketplaceCode: l.marketplaceCode,
          sellerRef: co.sellerRef,
          observedName: co.sellerName,
          productName: l.productName,
        })
        .from(co)
        .innerJoin(l, eq(l.id, co.listingId))
        .where(
          and(
            gte(co.observedAt, window.sinceMs),
            lte(co.observedAt, window.untilMs),
            isNotNull(co.sellerRef),
            isNotNull(l.baseStockCode),
            excludeSellersClause(l.marketplaceCode, co.sellerRef, window),
            onlySellersClause(l.marketplaceCode, co.sellerRef, window),
          ),
        )
        .limit(limit);
    },
    postgres: (db) => {
      const co = postgresSchema.competitorObservations;
      const l = postgresSchema.listings;
      return db
        .selectDistinct({
          baseStockCode: l.baseStockCode,
          marketplaceCode: l.marketplaceCode,
          sellerRef: co.sellerRef,
          observedName: co.sellerName,
          productName: l.productName,
        })
        .from(co)
        .innerJoin(l, eq(l.id, co.listingId))
        .where(
          and(
            gte(co.observedAt, window.sinceMs),
            lte(co.observedAt, window.untilMs),
            isNotNull(co.sellerRef),
            isNotNull(l.baseStockCode),
            excludeSellersClause(l.marketplaceCode, co.sellerRef, window),
            onlySellersClause(l.marketplaceCode, co.sellerRef, window),
          ),
        )
        .limit(limit);
    },
    mysql: (db) => {
      const co = mysqlSchema.competitorObservations;
      const l = mysqlSchema.listings;
      return db
        .selectDistinct({
          baseStockCode: l.baseStockCode,
          marketplaceCode: l.marketplaceCode,
          sellerRef: co.sellerRef,
          observedName: co.sellerName,
          productName: l.productName,
        })
        .from(co)
        .innerJoin(l, eq(l.id, co.listingId))
        .where(
          and(
            gte(co.observedAt, window.sinceMs),
            lte(co.observedAt, window.untilMs),
            isNotNull(co.sellerRef),
            isNotNull(l.baseStockCode),
            excludeSellersClause(l.marketplaceCode, co.sellerRef, window),
            onlySellersClause(l.marketplaceCode, co.sellerRef, window),
          ),
        )
        .limit(limit);
    },
  });
  return rows.map((r) => ({
    baseStockCode: r.baseStockCode as string,
    marketplaceCode: r.marketplaceCode,
    sellerRef: r.sellerRef as string,
    observedName: r.observedName,
    productName: r.productName,
  }));
}
