/**
 * Barcodes on `tracked_products`, and the cross-marketplace match they make possible
 * (doc 05, doc 06 §12.5, Faz 8 2026-08-28).
 *
 * Two jobs live here and they are deliberately not one query:
 *
 * - **which products still need asking about** — the backfill's work list, ordered so the
 *   products a report is most likely to be about get their barcode first;
 * - **which products are the same product on two marketplaces** — the match itself, which is an
 *   equality join on `barcode` and nothing else.
 *
 * ⚠️ **The match is a barcode join, and never a name one.** No fuzzy title comparison, no
 * brand-plus-size heuristic, no "these look alike". A brand owner acts on this report — it is
 * how they see that the same product sells for 671 ₺ on one marketplace and 549 ₺ on another —
 * and a wrong row there is worse than a missing one. Products whose barcode is unknown are
 * simply absent from the match and counted, so the gap is visible rather than filled with
 * guesses.
 */
import { and, asc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { alias as mysqlAlias } from 'drizzle-orm/mysql-core';
import { alias as postgresAlias } from 'drizzle-orm/pg-core';
import { alias as sqliteAlias } from 'drizzle-orm/sqlite-core';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

/** A product the barcode backfill has not established an answer for yet. */
export interface BarcodeTarget {
  readonly id: string;
  readonly marketplaceCode: string;
  readonly productRef: string;
  readonly productUrl: string;
  readonly label: string;
}

/**
 * How many failed reads before a product leaves the work list.
 *
 * A failure is not an answer and never sets `barcode_resolved_at`, so without a ceiling the
 * permanently broken rows — a page describing a different article, a url that now 404s — sit at
 * the head of every run for ever, and a job that stops on consecutive failures makes no progress
 * at all. Three, because the failures worth retrying are transport hiccups and those do not
 * survive three attempts an hour apart; anything that does is broken in a way more requests will
 * not fix. Counted, not hidden: such rows are `failed` in the coverage figures.
 */
export const BARCODE_MAX_ATTEMPTS = 3;

/**
 * Products still worth asking about — never answered, and failed fewer than
 * `BARCODE_MAX_ATTEMPTS` times. Fewest attempts first, freshest sweep next.
 *
 * `barcode_resolved_at is null` is the first filter, not `barcode is null`. A product whose page
 * stated no barcode has been asked *and answered*; re-asking it every night would spend the slow
 * tier's entire budget on the products least likely to ever yield anything. Re-asking is a
 * deliberate act (`clearBarcodeResolution`), not the default.
 *
 * Ordering by attempts is what stops a handful of broken products starving the rest: a failure
 * costs that product its place in the queue rather than costing the queue its progress.
 */
export async function barcodeTargets(
  appDb: AppDatabase,
  marketplaceCode: string,
  limit: number,
): Promise<BarcodeTarget[]> {
  const rows = await withDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.trackedProducts;
      return db
        .select({
          id: t.id,
          marketplaceCode: t.marketplaceCode,
          productRef: t.productRef,
          productUrl: t.productUrl,
          label: t.label,
        })
        .from(t)
        .where(
          and(
            eq(t.marketplaceCode, marketplaceCode),
            eq(t.isActive, true),
            isNull(t.barcodeResolvedAt),
            lt(t.barcodeAttempts, BARCODE_MAX_ATTEMPTS),
          ),
        )
        .orderBy(asc(t.barcodeAttempts), sql`${t.lastSweptAt} desc`)
        .limit(limit);
    },
    postgres: (db) => {
      const t = postgresSchema.trackedProducts;
      return db
        .select({
          id: t.id,
          marketplaceCode: t.marketplaceCode,
          productRef: t.productRef,
          productUrl: t.productUrl,
          label: t.label,
        })
        .from(t)
        .where(
          and(
            eq(t.marketplaceCode, marketplaceCode),
            eq(t.isActive, true),
            isNull(t.barcodeResolvedAt),
            lt(t.barcodeAttempts, BARCODE_MAX_ATTEMPTS),
          ),
        )
        .orderBy(asc(t.barcodeAttempts), sql`${t.lastSweptAt} desc`)
        .limit(limit);
    },
    mysql: (db) => {
      const t = mysqlSchema.trackedProducts;
      return db
        .select({
          id: t.id,
          marketplaceCode: t.marketplaceCode,
          productRef: t.productRef,
          productUrl: t.productUrl,
          label: t.label,
        })
        .from(t)
        .where(
          and(
            eq(t.marketplaceCode, marketplaceCode),
            eq(t.isActive, true),
            isNull(t.barcodeResolvedAt),
            lt(t.barcodeAttempts, BARCODE_MAX_ATTEMPTS),
          ),
        )
        .orderBy(asc(t.barcodeAttempts), sql`${t.lastSweptAt} desc`)
        .limit(limit);
    },
  });
  return rows.map((row) => ({
    id: row.id,
    marketplaceCode: row.marketplaceCode,
    productRef: row.productRef,
    productUrl: row.productUrl,
    label: row.label,
  }));
}

/**
 * Records the answer — including the answer "the page stated none", which is why `barcode` is
 * nullable here and `resolvedAt` is not.
 */
export async function setProductBarcode(
  appDb: AppDatabase,
  trackedProductId: string,
  barcode: string | null,
  resolvedAtMs: number,
): Promise<void> {
  const trimmed = barcode?.trim() ?? '';
  const value = trimmed === '' ? null : trimmed;
  // Attempts go back to zero on a successful read: the counter measures *unanswered* attempts,
  // and a product that answered has none.
  const answer = { barcode: value, barcodeResolvedAt: resolvedAtMs, barcodeAttempts: 0 };
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.trackedProducts)
        .set(answer)
        .where(eq(sqliteSchema.trackedProducts.id, trackedProductId)),
    postgres: (db) =>
      db
        .update(postgresSchema.trackedProducts)
        .set(answer)
        .where(eq(postgresSchema.trackedProducts.id, trackedProductId)),
    mysql: (db) =>
      db
        .update(mysqlSchema.trackedProducts)
        .set(answer)
        .where(eq(mysqlSchema.trackedProducts.id, trackedProductId)),
  });
}

/**
 * Records that a read failed, without recording an answer.
 *
 * Incremented in SQL rather than read-then-written: two workers asking about the same product
 * would otherwise both read 1 and both write 2, and a broken product could outlive its ceiling
 * indefinitely at one lost increment per race.
 */
export async function recordBarcodeAttemptFailed(
  appDb: AppDatabase,
  trackedProductId: string,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.trackedProducts)
        .set({ barcodeAttempts: sql`${sqliteSchema.trackedProducts.barcodeAttempts} + 1` })
        .where(eq(sqliteSchema.trackedProducts.id, trackedProductId)),
    postgres: (db) =>
      db
        .update(postgresSchema.trackedProducts)
        .set({ barcodeAttempts: sql`${postgresSchema.trackedProducts.barcodeAttempts} + 1` })
        .where(eq(postgresSchema.trackedProducts.id, trackedProductId)),
    mysql: (db) =>
      db
        .update(mysqlSchema.trackedProducts)
        .set({ barcodeAttempts: sql`${mysqlSchema.trackedProducts.barcodeAttempts} + 1` })
        .where(eq(mysqlSchema.trackedProducts.id, trackedProductId)),
  });
}

/** Puts a product back on the work list — an operator action, never an automatic one. */
export async function clearBarcodeResolution(
  appDb: AppDatabase,
  trackedProductId: string,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.trackedProducts)
        .set({ barcode: null, barcodeResolvedAt: null, barcodeAttempts: 0 })
        .where(eq(sqliteSchema.trackedProducts.id, trackedProductId)),
    postgres: (db) =>
      db
        .update(postgresSchema.trackedProducts)
        .set({ barcode: null, barcodeResolvedAt: null, barcodeAttempts: 0 })
        .where(eq(postgresSchema.trackedProducts.id, trackedProductId)),
    mysql: (db) =>
      db
        .update(mysqlSchema.trackedProducts)
        .set({ barcode: null, barcodeResolvedAt: null, barcodeAttempts: 0 })
        .where(eq(mysqlSchema.trackedProducts.id, trackedProductId)),
  });
}

export interface BarcodeCoverage {
  readonly total: number;
  /** Asked and answered with a barcode. */
  readonly resolved: number;
  /** Asked, and the page stated none — a finished product, not a pending one. */
  readonly statedNone: number;
  /**
   * Asked `BARCODE_MAX_ATTEMPTS` times and never answered — off the work list. Its own number,
   * because counting these among `pending` would report a product nobody will ask about again as
   * one whose turn simply has not come.
   */
  readonly failed: number;
  /** Never asked, or asked fewer times than the ceiling allows. */
  readonly pending: number;
}

/**
 * How much of a marketplace's tracked catalogue can take part in a match.
 *
 * Reported beside every match so the gap is a number on the screen. A match over 40% of a
 * catalogue that looks like a match over all of it is the failure this exists to prevent.
 */
export async function barcodeCoverage(
  appDb: AppDatabase,
  marketplaceCode: string,
): Promise<BarcodeCoverage> {
  const counts = (
    t:
      | typeof sqliteSchema.trackedProducts
      | typeof postgresSchema.trackedProducts
      | typeof mysqlSchema.trackedProducts,
  ) => ({
    total: sql<number>`count(*)`,
    resolved: sql<number>`sum(case when ${t.barcode} is not null then 1 else 0 end)`,
    statedNone: sql<number>`sum(case when ${t.barcodeResolvedAt} is not null and ${t.barcode} is null then 1 else 0 end)`,
    failed: sql<number>`sum(case when ${t.barcodeResolvedAt} is null and ${t.barcodeAttempts} >= ${BARCODE_MAX_ATTEMPTS} then 1 else 0 end)`,
  });

  const rows = await withDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.trackedProducts;
      return db
        .select(counts(t))
        .from(t)
        .where(and(eq(t.marketplaceCode, marketplaceCode), eq(t.isActive, true)));
    },
    postgres: (db) => {
      const t = postgresSchema.trackedProducts;
      return db
        .select(counts(t))
        .from(t)
        .where(and(eq(t.marketplaceCode, marketplaceCode), eq(t.isActive, true)));
    },
    mysql: (db) => {
      const t = mysqlSchema.trackedProducts;
      return db
        .select(counts(t))
        .from(t)
        .where(and(eq(t.marketplaceCode, marketplaceCode), eq(t.isActive, true)));
    },
  });

  const row = rows[0];
  const total = Number(row?.total ?? 0);
  const resolved = Number(row?.resolved ?? 0);
  const statedNone = Number(row?.statedNone ?? 0);
  const failed = Number(row?.failed ?? 0);
  return { total, resolved, statedNone, failed, pending: total - resolved - statedNone - failed };
}

/** One product carried by both marketplaces, joined on its barcode. */
export interface CrossMarketplaceMatch {
  readonly barcode: string;
  readonly leftId: string;
  readonly leftProductRef: string;
  readonly leftLabel: string;
  readonly leftUrl: string;
  readonly rightId: string;
  readonly rightProductRef: string;
  readonly rightLabel: string;
  readonly rightUrl: string;
}

/**
 * Products present on both marketplaces, matched on barcode alone.
 *
 * A self-join on the same table, `left` being `leftMarketplace`'s rows and `right` being
 * `rightMarketplace`'s. One barcode can legitimately appear more than once on a side — two
 * sellers' listings of the same physical article — so this can return several rows per barcode,
 * and it does rather than picking one: choosing a winner would be inventing a fact the data does
 * not contain.
 */
export async function crossMarketplaceMatches(
  appDb: AppDatabase,
  leftMarketplace: string,
  rightMarketplace: string,
  limit: number,
): Promise<CrossMarketplaceMatch[]> {
  // Written out per dialect on purpose. A shared select/join builder cannot be typed across the
  // three column unions without erasing the very types that catch a mistyped column — the same
  // conclusion `brandReportsRepo.sellerProductTargets` reached.
  const rows = await withDialect(appDb, {
    sqlite: (db) => {
      const l = sqliteSchema.trackedProducts;
      const r = sqliteAlias(sqliteSchema.trackedProducts, 'right_products');
      return db
        .select({
          barcode: l.barcode,
          leftId: l.id,
          leftProductRef: l.productRef,
          leftLabel: l.label,
          leftUrl: l.productUrl,
          rightId: r.id,
          rightProductRef: r.productRef,
          rightLabel: r.label,
          rightUrl: r.productUrl,
        })
        .from(l)
        .innerJoin(r, eq(l.barcode, r.barcode))
        .where(
          and(
            isNotNull(l.barcode),
            eq(l.marketplaceCode, leftMarketplace),
            eq(r.marketplaceCode, rightMarketplace),
            eq(l.isActive, true),
            eq(r.isActive, true),
          ),
        )
        .orderBy(asc(l.barcode))
        .limit(limit);
    },
    postgres: (db) => {
      const l = postgresSchema.trackedProducts;
      const r = postgresAlias(postgresSchema.trackedProducts, 'right_products');
      return db
        .select({
          barcode: l.barcode,
          leftId: l.id,
          leftProductRef: l.productRef,
          leftLabel: l.label,
          leftUrl: l.productUrl,
          rightId: r.id,
          rightProductRef: r.productRef,
          rightLabel: r.label,
          rightUrl: r.productUrl,
        })
        .from(l)
        .innerJoin(r, eq(l.barcode, r.barcode))
        .where(
          and(
            isNotNull(l.barcode),
            eq(l.marketplaceCode, leftMarketplace),
            eq(r.marketplaceCode, rightMarketplace),
            eq(l.isActive, true),
            eq(r.isActive, true),
          ),
        )
        .orderBy(asc(l.barcode))
        .limit(limit);
    },
    mysql: (db) => {
      const l = mysqlSchema.trackedProducts;
      const r = mysqlAlias(mysqlSchema.trackedProducts, 'right_products');
      return db
        .select({
          barcode: l.barcode,
          leftId: l.id,
          leftProductRef: l.productRef,
          leftLabel: l.label,
          leftUrl: l.productUrl,
          rightId: r.id,
          rightProductRef: r.productRef,
          rightLabel: r.label,
          rightUrl: r.productUrl,
        })
        .from(l)
        .innerJoin(r, eq(l.barcode, r.barcode))
        .where(
          and(
            isNotNull(l.barcode),
            eq(l.marketplaceCode, leftMarketplace),
            eq(r.marketplaceCode, rightMarketplace),
            eq(l.isActive, true),
            eq(r.isActive, true),
          ),
        )
        .orderBy(asc(l.barcode))
        .limit(limit);
    },
  });

  return rows.map((row) => ({
    barcode: String(row.barcode),
    leftId: row.leftId,
    leftProductRef: row.leftProductRef,
    leftLabel: row.leftLabel,
    leftUrl: row.leftUrl,
    rightId: row.rightId,
    rightProductRef: row.rightProductRef,
    rightLabel: row.rightLabel,
    rightUrl: row.rightUrl,
  }));
}
