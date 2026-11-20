/**
 * The brand module's work queues (brand roadmap §6.8, §6.9).
 *
 * - **Linked cards for availability.** Every card linked to a brand product, with the shelf state
 *   its last successful look stored and the watched brand that scopes its seller policy. The
 *   judgement is `classifyAvailability` in `packages/core`; nothing here decides.
 * - **Unmatched cards.** Cards an **own** brand's catalogue sweep found that no brand product
 *   claims — "whose is this?" — which used to sink among thousands of rows on Takip Edilen
 *   Ürünler. A rival brand's cards are not ours to claim, and a card pasted by hand was put there
 *   on purpose, so neither is queued. "Bizim değil / önemsiz" sets `queue_dismissed_at` and the
 *   card stays out of the queue.
 */
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, notExists, sql } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

const ID_CHUNK = 200;

export interface LinkedCardForAvailability {
  readonly trackedProductId: string;
  readonly label: string;
  readonly productUrl: string;
  readonly marketplaceCode: string;
  readonly brandName: string | null;
  /** `null` until a successful look. */
  readonly hasSellers: boolean | null;
  readonly lastSellerSeenAt: number | null;
  readonly lastScrapedAt: number | null;
  readonly ratingCount: number | null;
  /** The sweep that found the card; `null` for one added by link. */
  readonly watchedBrandId: string | null;
  readonly watchedBrandGroupId: string | null;
  readonly brandProductId: string;
  readonly brandProductName: string;
  readonly unitMultiplier: number;
}

/** Every linked card, by product name then card label. */
export async function linkedCardsForAvailability(appDb: AppDatabase): Promise<LinkedCardForAvailability[]> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) => {
      const c = sqliteSchema.brandProductCards;
      const p = sqliteSchema.brandProducts;
      const t = sqliteSchema.trackedProducts;
      const w = sqliteSchema.watchedBrands;
      return db
        .select({
          trackedProductId: t.id,
          label: t.label,
          productUrl: t.productUrl,
          marketplaceCode: t.marketplaceCode,
          brandName: t.brandName,
          hasSellers: t.hasSellers,
          lastSellerSeenAt: t.lastSellerSeenAt,
          lastScrapedAt: t.lastScrapedAt,
          ratingCount: t.ratingCount,
          watchedBrandId: t.watchedBrandId,
          watchedBrandGroupId: w.groupId,
          brandProductId: p.id,
          brandProductName: p.name,
          unitMultiplier: c.unitMultiplier,
        })
        .from(c)
        .innerJoin(p, eq(p.id, c.brandProductId))
        .innerJoin(t, eq(t.id, c.trackedProductId))
        .leftJoin(w, eq(w.id, t.watchedBrandId))
        .orderBy(asc(p.name), asc(t.label));
    },
    postgres: (db) => {
      const c = postgresSchema.brandProductCards;
      const p = postgresSchema.brandProducts;
      const t = postgresSchema.trackedProducts;
      const w = postgresSchema.watchedBrands;
      return db
        .select({
          trackedProductId: t.id,
          label: t.label,
          productUrl: t.productUrl,
          marketplaceCode: t.marketplaceCode,
          brandName: t.brandName,
          hasSellers: t.hasSellers,
          lastSellerSeenAt: t.lastSellerSeenAt,
          lastScrapedAt: t.lastScrapedAt,
          ratingCount: t.ratingCount,
          watchedBrandId: t.watchedBrandId,
          watchedBrandGroupId: w.groupId,
          brandProductId: p.id,
          brandProductName: p.name,
          unitMultiplier: c.unitMultiplier,
        })
        .from(c)
        .innerJoin(p, eq(p.id, c.brandProductId))
        .innerJoin(t, eq(t.id, c.trackedProductId))
        .leftJoin(w, eq(w.id, t.watchedBrandId))
        .orderBy(asc(p.name), asc(t.label));
    },
    mysql: (db) => {
      const c = mysqlSchema.brandProductCards;
      const p = mysqlSchema.brandProducts;
      const t = mysqlSchema.trackedProducts;
      const w = mysqlSchema.watchedBrands;
      return db
        .select({
          trackedProductId: t.id,
          label: t.label,
          productUrl: t.productUrl,
          marketplaceCode: t.marketplaceCode,
          brandName: t.brandName,
          hasSellers: t.hasSellers,
          lastSellerSeenAt: t.lastSellerSeenAt,
          lastScrapedAt: t.lastScrapedAt,
          ratingCount: t.ratingCount,
          watchedBrandId: t.watchedBrandId,
          watchedBrandGroupId: w.groupId,
          brandProductId: p.id,
          brandProductName: p.name,
          unitMultiplier: c.unitMultiplier,
        })
        .from(c)
        .innerJoin(p, eq(p.id, c.brandProductId))
        .innerJoin(t, eq(t.id, c.trackedProductId))
        .leftJoin(w, eq(w.id, t.watchedBrandId))
        .orderBy(asc(p.name), asc(t.label));
    },
  })) as (Omit<LinkedCardForAvailability, 'hasSellers'> & { hasSellers: boolean | number | null })[];
  // MySQL hands a boolean back as 0/1.
  return rows.map((row) => ({ ...row, hasSellers: row.hasSellers === null ? null : Boolean(row.hasSellers) }));
}

export interface UnmatchedCardQuery {
  readonly limit: number;
  readonly offset: number;
  /** Cards added at or after this instant count as new (the queue's "bu hafta" figure). */
  readonly newSinceMs: number;
  readonly marketplaceCode?: string;
  /** `true`: the cards set aside instead of the queue. */
  readonly dismissed?: boolean;
}

export interface UnmatchedCard {
  readonly id: string;
  readonly marketplaceCode: string;
  readonly productRef: string;
  readonly productUrl: string;
  readonly label: string;
  readonly brandName: string | null;
  readonly barcode: string | null;
  readonly ratingCount: number | null;
  readonly hasSellers: boolean | null;
  /** When a sweep first found the card. */
  readonly addedAt: number;
  readonly lastScrapedAt: number | null;
  readonly isFavourite: boolean;
  readonly queueDismissedAt: number | null;
  readonly watchedBrandId: string;
  readonly watchedBrandLabel: string;
}

export interface UnmatchedCardPage {
  readonly rows: UnmatchedCard[];
  readonly total: number;
  /** Of `total`, added at or after `newSinceMs`. */
  readonly newCount: number;
}

type RawUnmatched = Omit<UnmatchedCard, 'hasSellers' | 'isFavourite'> & {
  hasSellers: boolean | number | null;
  isFavourite: boolean | number;
};

/** Most reviewed first (the best sellers matter most), unrated last, then by label. */
export async function queryUnmatchedCards(appDb: AppDatabase, query: UnmatchedCardQuery): Promise<UnmatchedCardPage> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.trackedProducts;
      const w = sqliteSchema.watchedBrands;
      const c = sqliteSchema.brandProductCards;
      const where = and(
        eq(w.isOwnBrand, true),
        query.dismissed ? isNotNull(t.queueDismissedAt) : isNull(t.queueDismissedAt),
        notExists(db.select({ one: sql`1` }).from(c).where(eq(c.trackedProductId, t.id))),
        query.marketplaceCode === undefined ? undefined : eq(t.marketplaceCode, query.marketplaceCode),
      );
      return db
        .select({
          id: t.id,
          marketplaceCode: t.marketplaceCode,
          productRef: t.productRef,
          productUrl: t.productUrl,
          label: t.label,
          brandName: t.brandName,
          barcode: t.barcode,
          ratingCount: t.ratingCount,
          hasSellers: t.hasSellers,
          addedAt: t.addedAt,
          lastScrapedAt: t.lastScrapedAt,
          isFavourite: t.isFavourite,
          queueDismissedAt: t.queueDismissedAt,
          watchedBrandId: w.id,
          watchedBrandLabel: w.label,
        })
        .from(t)
        .innerJoin(w, eq(w.id, t.watchedBrandId))
        .where(where)
        // Nulls last on every dialect: `x is null` sorts false first everywhere.
        .orderBy(sql`${t.ratingCount} is null`, desc(t.ratingCount), asc(t.label), asc(t.id))
        .limit(query.limit)
        .offset(query.offset);
    },
    postgres: (db) => {
      const t = postgresSchema.trackedProducts;
      const w = postgresSchema.watchedBrands;
      const c = postgresSchema.brandProductCards;
      const where = and(
        eq(w.isOwnBrand, true),
        query.dismissed ? isNotNull(t.queueDismissedAt) : isNull(t.queueDismissedAt),
        notExists(db.select({ one: sql`1` }).from(c).where(eq(c.trackedProductId, t.id))),
        query.marketplaceCode === undefined ? undefined : eq(t.marketplaceCode, query.marketplaceCode),
      );
      return db
        .select({
          id: t.id,
          marketplaceCode: t.marketplaceCode,
          productRef: t.productRef,
          productUrl: t.productUrl,
          label: t.label,
          brandName: t.brandName,
          barcode: t.barcode,
          ratingCount: t.ratingCount,
          hasSellers: t.hasSellers,
          addedAt: t.addedAt,
          lastScrapedAt: t.lastScrapedAt,
          isFavourite: t.isFavourite,
          queueDismissedAt: t.queueDismissedAt,
          watchedBrandId: w.id,
          watchedBrandLabel: w.label,
        })
        .from(t)
        .innerJoin(w, eq(w.id, t.watchedBrandId))
        .where(where)
        // Nulls last on every dialect: `x is null` sorts false first everywhere.
        .orderBy(sql`${t.ratingCount} is null`, desc(t.ratingCount), asc(t.label), asc(t.id))
        .limit(query.limit)
        .offset(query.offset);
    },
    mysql: (db) => {
      const t = mysqlSchema.trackedProducts;
      const w = mysqlSchema.watchedBrands;
      const c = mysqlSchema.brandProductCards;
      const where = and(
        eq(w.isOwnBrand, true),
        query.dismissed ? isNotNull(t.queueDismissedAt) : isNull(t.queueDismissedAt),
        notExists(db.select({ one: sql`1` }).from(c).where(eq(c.trackedProductId, t.id))),
        query.marketplaceCode === undefined ? undefined : eq(t.marketplaceCode, query.marketplaceCode),
      );
      return db
        .select({
          id: t.id,
          marketplaceCode: t.marketplaceCode,
          productRef: t.productRef,
          productUrl: t.productUrl,
          label: t.label,
          brandName: t.brandName,
          barcode: t.barcode,
          ratingCount: t.ratingCount,
          hasSellers: t.hasSellers,
          addedAt: t.addedAt,
          lastScrapedAt: t.lastScrapedAt,
          isFavourite: t.isFavourite,
          queueDismissedAt: t.queueDismissedAt,
          watchedBrandId: w.id,
          watchedBrandLabel: w.label,
        })
        .from(t)
        .innerJoin(w, eq(w.id, t.watchedBrandId))
        .where(where)
        // Nulls last on every dialect: `x is null` sorts false first everywhere.
        .orderBy(sql`${t.ratingCount} is null`, desc(t.ratingCount), asc(t.label), asc(t.id))
        .limit(query.limit)
        .offset(query.offset);
    },
  })) as RawUnmatched[];
  const totals = (await withDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.trackedProducts;
      const w = sqliteSchema.watchedBrands;
      const c = sqliteSchema.brandProductCards;
      const where = and(
        eq(w.isOwnBrand, true),
        query.dismissed ? isNotNull(t.queueDismissedAt) : isNull(t.queueDismissedAt),
        notExists(db.select({ one: sql`1` }).from(c).where(eq(c.trackedProductId, t.id))),
        query.marketplaceCode === undefined ? undefined : eq(t.marketplaceCode, query.marketplaceCode),
      );
      return db
        .select({
          total: count(),
          newCount: sql<number>`sum(case when ${t.addedAt} >= ${query.newSinceMs} then 1 else 0 end)`,
        })
        .from(t)
        .innerJoin(w, eq(w.id, t.watchedBrandId))
        .where(where);
    },
    postgres: (db) => {
      const t = postgresSchema.trackedProducts;
      const w = postgresSchema.watchedBrands;
      const c = postgresSchema.brandProductCards;
      const where = and(
        eq(w.isOwnBrand, true),
        query.dismissed ? isNotNull(t.queueDismissedAt) : isNull(t.queueDismissedAt),
        notExists(db.select({ one: sql`1` }).from(c).where(eq(c.trackedProductId, t.id))),
        query.marketplaceCode === undefined ? undefined : eq(t.marketplaceCode, query.marketplaceCode),
      );
      return db
        .select({
          total: count(),
          newCount: sql<number>`sum(case when ${t.addedAt} >= ${query.newSinceMs} then 1 else 0 end)`,
        })
        .from(t)
        .innerJoin(w, eq(w.id, t.watchedBrandId))
        .where(where);
    },
    mysql: (db) => {
      const t = mysqlSchema.trackedProducts;
      const w = mysqlSchema.watchedBrands;
      const c = mysqlSchema.brandProductCards;
      const where = and(
        eq(w.isOwnBrand, true),
        query.dismissed ? isNotNull(t.queueDismissedAt) : isNull(t.queueDismissedAt),
        notExists(db.select({ one: sql`1` }).from(c).where(eq(c.trackedProductId, t.id))),
        query.marketplaceCode === undefined ? undefined : eq(t.marketplaceCode, query.marketplaceCode),
      );
      return db
        .select({
          total: count(),
          newCount: sql<number>`sum(case when ${t.addedAt} >= ${query.newSinceMs} then 1 else 0 end)`,
        })
        .from(t)
        .innerJoin(w, eq(w.id, t.watchedBrandId))
        .where(where);
    },
  })) as { total: number | string; newCount: number | string | null }[];
  return {
    rows: rows.map((row) => ({
      ...row,
      hasSellers: row.hasSellers === null ? null : Boolean(row.hasSellers),
      isFavourite: Boolean(row.isFavourite),
    })),
    total: Number(totals[0]?.total ?? 0),
    newCount: Number(totals[0]?.newCount ?? 0),
  };
}

/** Sets cards aside (`atMs`) or puts them back in the queue (`null`). */
export async function setQueueDismissed(appDb: AppDatabase, ids: readonly string[], atMs: number | null): Promise<void> {
  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    const chunk = ids.slice(start, start + ID_CHUNK);
    if (chunk.length === 0) continue;
    await runDialect(appDb, {
      sqlite: (db) =>
        db.update(sqliteSchema.trackedProducts).set({ queueDismissedAt: atMs }).where(inArray(sqliteSchema.trackedProducts.id, chunk)),
      postgres: (db) =>
        db.update(postgresSchema.trackedProducts).set({ queueDismissedAt: atMs }).where(inArray(postgresSchema.trackedProducts.id, chunk)),
      mysql: (db) =>
        db.update(mysqlSchema.trackedProducts).set({ queueDismissedAt: atMs }).where(inArray(mysqlSchema.trackedProducts.id, chunk)),
    });
  }
}
