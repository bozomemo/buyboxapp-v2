/**
 * Repository for `commission_tariffs` (doc 17 §8.2) — the marketplace's per-product, per-period
 * commission bands, imported from its tariff workbook. Reporting only: the reseller profit
 * estimate reads it, nothing in the pricing path does.
 */
import type { CommissionTier } from '@buybox/core';
import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { withDialect } from '../with-dialect.js';

export interface CommissionTariffRow {
  readonly id: string;
  readonly marketplaceCode: string;
  /** `tariffProductKey` of the barcode or stock code (`packages/core`). */
  readonly productKey: string;
  readonly barcode: string | null;
  readonly sellerStockCode: string | null;
  readonly validFrom: number;
  readonly validUntil: number;
  readonly tiers: readonly CommissionTier[];
  readonly sourceFile: string;
  readonly importedAt: number;
}

interface StoredTier {
  readonly minPrice: string | null;
  readonly maxPrice: string | null;
  readonly rate: number;
}

function encodeTiers(tiers: readonly CommissionTier[]): string {
  return JSON.stringify(
    tiers.map((tier): StoredTier => ({
      minPrice: tier.minPrice === null ? null : tier.minPrice.toString(),
      maxPrice: tier.maxPrice === null ? null : tier.maxPrice.toString(),
      rate: tier.rate,
    })),
  );
}

function decodeTiers(json: string): CommissionTier[] {
  return (JSON.parse(json) as StoredTier[]).map((tier) => ({
    minPrice: tier.minPrice === null ? null : BigInt(tier.minPrice),
    maxPrice: tier.maxPrice === null ? null : BigInt(tier.maxPrice),
    rate: tier.rate,
  }));
}

function toStored(row: CommissionTariffRow) {
  const { tiers, ...rest } = row;
  return { ...rest, tiersJson: encodeTiers(tiers) };
}

const CHUNK = 200;

/**
 * Writes an import's tariffs **in one transaction**, replacing any already stored for the same
 * product and period start — a re-uploaded workbook corrects a period rather than doubling it.
 * Tariffs for other periods are left alone.
 */
export async function replaceTariffs(
  appDb: AppDatabase,
  rows: readonly CommissionTariffRow[],
): Promise<void> {
  if (rows.length === 0) return;
  // (marketplace, validFrom) → keys, so each delete is one indexed statement per chunk.
  const groups = new Map<string, { marketplaceCode: string; validFrom: number; keys: string[] }>();
  for (const row of rows) {
    const id = `${row.marketplaceCode}::${row.validFrom}`;
    const group = groups.get(id) ?? {
      marketplaceCode: row.marketplaceCode,
      validFrom: row.validFrom,
      keys: [],
    };
    group.keys.push(row.productKey);
    groups.set(id, group);
  }
  const deletes = [...groups.values()].flatMap((group) => {
    const out: { marketplaceCode: string; validFrom: number; keys: string[] }[] = [];
    for (let start = 0; start < group.keys.length; start += CHUNK) {
      out.push({ ...group, keys: group.keys.slice(start, start + CHUNK) });
    }
    return out;
  });
  const values = rows.map(toStored);

  if (appDb.dialect === 'sqlite') {
    const t = sqliteSchema.commissionTariffs;
    // better-sqlite3 transactions must run synchronously to completion — no `await` inside.
    appDb.db.transaction((tx) => {
      for (const d of deletes) {
        tx.delete(t)
          .where(
            and(
              eq(t.marketplaceCode, d.marketplaceCode),
              eq(t.validFrom, d.validFrom),
              inArray(t.productKey, d.keys),
            ),
          )
          .run();
      }
      for (let start = 0; start < values.length; start += CHUNK) {
        tx.insert(t)
          .values(values.slice(start, start + CHUNK))
          .run();
      }
    });
    return;
  }

  if (appDb.dialect === 'postgres') {
    const t = postgresSchema.commissionTariffs;
    await appDb.db.transaction(async (tx) => {
      for (const d of deletes) {
        await tx
          .delete(t)
          .where(
            and(
              eq(t.marketplaceCode, d.marketplaceCode),
              eq(t.validFrom, d.validFrom),
              inArray(t.productKey, d.keys),
            ),
          );
      }
      for (let start = 0; start < values.length; start += CHUNK) {
        await tx.insert(t).values(values.slice(start, start + CHUNK));
      }
    });
    return;
  }

  const t = mysqlSchema.commissionTariffs;
  await appDb.db.transaction(async (tx) => {
    for (const d of deletes) {
      await tx
        .delete(t)
        .where(
          and(
            eq(t.marketplaceCode, d.marketplaceCode),
            eq(t.validFrom, d.validFrom),
            inArray(t.productKey, d.keys),
          ),
        );
    }
    for (let start = 0; start < values.length; start += CHUNK) {
      await tx.insert(t).values(values.slice(start, start + CHUNK));
    }
  });
}

/**
 * The tariff in force at `atMs` for each of `productKeys`. Where two stored periods overlap, the
 * one that started later wins — it is the newer statement. Keys with no current tariff are
 * absent from the map, which the estimate reports as "no tariff" rather than a rate.
 */
export async function currentTariffs(
  appDb: AppDatabase,
  marketplaceCode: string,
  productKeys: readonly string[],
  atMs: number,
): Promise<Map<string, CommissionTier[]>> {
  const result = new Map<string, CommissionTier[]>();
  const unique = [...new Set(productKeys)];
  for (let start = 0; start < unique.length; start += CHUNK) {
    const chunk = unique.slice(start, start + CHUNK);
    const rows = (await withDialect(appDb, {
      sqlite: (db) => {
        const t = sqliteSchema.commissionTariffs;
        return db
          .select({ productKey: t.productKey, tiersJson: t.tiersJson })
          .from(t)
          .where(
            and(
              eq(t.marketplaceCode, marketplaceCode),
              inArray(t.productKey, chunk),
              lte(t.validFrom, atMs),
              gt(t.validUntil, atMs),
            ),
          )
          .orderBy(desc(t.validFrom));
      },
      postgres: (db) => {
        const t = postgresSchema.commissionTariffs;
        return db
          .select({ productKey: t.productKey, tiersJson: t.tiersJson })
          .from(t)
          .where(
            and(
              eq(t.marketplaceCode, marketplaceCode),
              inArray(t.productKey, chunk),
              lte(t.validFrom, atMs),
              gt(t.validUntil, atMs),
            ),
          )
          .orderBy(desc(t.validFrom));
      },
      mysql: (db) => {
        const t = mysqlSchema.commissionTariffs;
        return db
          .select({ productKey: t.productKey, tiersJson: t.tiersJson })
          .from(t)
          .where(
            and(
              eq(t.marketplaceCode, marketplaceCode),
              inArray(t.productKey, chunk),
              lte(t.validFrom, atMs),
              gt(t.validUntil, atMs),
            ),
          )
          .orderBy(desc(t.validFrom));
      },
    })) as { productKey: string; tiersJson: string }[];
    // Newest first, so the first row seen for a key is the one that applies.
    for (const row of rows) {
      if (!result.has(row.productKey)) result.set(row.productKey, decodeTiers(row.tiersJson));
    }
  }
  return result;
}

export interface TariffPeriodSummary {
  readonly marketplaceCode: string;
  readonly validFrom: number;
  readonly validUntil: number;
  readonly products: number;
  readonly lastImportedAt: number;
}

/** The stored periods, newest first — what the settings screen lists. */
export async function listTariffPeriods(appDb: AppDatabase, limit = 20): Promise<TariffPeriodSummary[]> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.commissionTariffs;
      return db
        .select({
          marketplaceCode: t.marketplaceCode,
          validFrom: t.validFrom,
          validUntil: t.validUntil,
          products: sql<number>`count(*)`,
          lastImportedAt: sql<number>`max(${t.importedAt})`,
        })
        .from(t)
        .groupBy(t.marketplaceCode, t.validFrom, t.validUntil)
        .orderBy(desc(t.validFrom))
        .limit(limit);
    },
    postgres: (db) => {
      const t = postgresSchema.commissionTariffs;
      return db
        .select({
          marketplaceCode: t.marketplaceCode,
          validFrom: t.validFrom,
          validUntil: t.validUntil,
          products: sql<number>`count(*)`,
          lastImportedAt: sql<number>`max(${t.importedAt})`,
        })
        .from(t)
        .groupBy(t.marketplaceCode, t.validFrom, t.validUntil)
        .orderBy(desc(t.validFrom))
        .limit(limit);
    },
    mysql: (db) => {
      const t = mysqlSchema.commissionTariffs;
      return db
        .select({
          marketplaceCode: t.marketplaceCode,
          validFrom: t.validFrom,
          validUntil: t.validUntil,
          products: sql<number>`count(*)`,
          lastImportedAt: sql<number>`max(${t.importedAt})`,
        })
        .from(t)
        .groupBy(t.marketplaceCode, t.validFrom, t.validUntil)
        .orderBy(desc(t.validFrom))
        .limit(limit);
    },
  })) as TariffPeriodSummary[];
  // `count(*)` and `max()` come back as strings on PostgreSQL and MySQL.
  return rows.map((row) => ({
    ...row,
    validFrom: Number(row.validFrom),
    validUntil: Number(row.validUntil),
    products: Number(row.products),
    lastImportedAt: Number(row.lastImportedAt),
  }));
}
