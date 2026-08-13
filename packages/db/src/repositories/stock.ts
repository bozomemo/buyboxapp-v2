/**
 * Repositories for `stock_items`, `stock_marketplace_prefs`, `bundles`, `bundle_members`
 * (doc 05 §3).
 */
import { and, eq } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export interface StockItemRow {
  readonly baseStockCode: string;
  readonly name: string;
  readonly unitCost: bigint;
  readonly unitStock: number;
  readonly sourceCode: string;
  readonly sourceRef: string | null;
  readonly costUpdatedAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Idempotent upsert keyed on `baseStockCode` (doc 01 §3). */
export async function upsertStockItem(appDb: AppDatabase, row: StockItemRow): Promise<void> {
  const { baseStockCode, createdAt, ...set } = row;
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(sqliteSchema.stockItems)
        .values(row)
        .onConflictDoUpdate({ target: sqliteSchema.stockItems.baseStockCode, set }),
    postgres: (db) =>
      db
        .insert(postgresSchema.stockItems)
        .values(row)
        .onConflictDoUpdate({ target: postgresSchema.stockItems.baseStockCode, set }),
    mysql: (db) => db.insert(mysqlSchema.stockItems).values(row).onDuplicateKeyUpdate({ set }),
  });
}

export async function getStockItem(
  appDb: AppDatabase,
  baseStockCode: string,
): Promise<StockItemRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.stockItems)
          .where(eq(sqliteSchema.stockItems.baseStockCode, baseStockCode))
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.stockItems)
          .where(eq(postgresSchema.stockItems.baseStockCode, baseStockCode))
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.stockItems)
          .where(eq(mysqlSchema.stockItems.baseStockCode, baseStockCode))
      )[0],
  });
}

export async function listStockItems(appDb: AppDatabase): Promise<StockItemRow[]> {
  return withDialect(appDb, {
    sqlite: (db) => db.select().from(sqliteSchema.stockItems),
    postgres: (db) => db.select().from(postgresSchema.stockItems),
    mysql: (db) => db.select().from(mysqlSchema.stockItems),
  });
}

export interface StockMarketplacePrefsRow {
  readonly baseStockCode: string;
  readonly marketplaceCode: string;
  readonly priceMultiplier: number;
  readonly autoRepriceEnabled: boolean;
  readonly updatedBy: string;
  readonly updatedAt: number;
}

/**
 * Insert default prefs the first time a base/marketplace pair is seen — does nothing if
 * a row already exists. Import flows must call this, never `upsertStockMarketplacePrefs`
 * directly, so an import can never clobber an operator's multiplier or automation switch
 * (doc 01 §3, doc 05 §3: "Never overwritten by an import").
 */
export async function ensureStockMarketplacePrefs(
  appDb: AppDatabase,
  row: StockMarketplacePrefsRow,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.stockMarketplacePrefs).values(row).onConflictDoNothing(),
    postgres: (db) => db.insert(postgresSchema.stockMarketplacePrefs).values(row).onConflictDoNothing(),
    mysql: (db) =>
      db
        .insert(mysqlSchema.stockMarketplacePrefs)
        .values(row)
        .onDuplicateKeyUpdate({ set: { baseStockCode: row.baseStockCode } }),
  });
}

/** Explicit operator-driven update — the only path that may change multiplier/automation. */
export async function updateStockMarketplacePrefs(
  appDb: AppDatabase,
  baseStockCode: string,
  marketplaceCode: string,
  set: Partial<Pick<StockMarketplacePrefsRow, 'priceMultiplier' | 'autoRepriceEnabled'>> & {
    updatedBy: string;
    updatedAt: number;
  },
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.stockMarketplacePrefs)
        .set(set)
        .where(
          and(
            eq(sqliteSchema.stockMarketplacePrefs.baseStockCode, baseStockCode),
            eq(sqliteSchema.stockMarketplacePrefs.marketplaceCode, marketplaceCode),
          ),
        ),
    postgres: (db) =>
      db
        .update(postgresSchema.stockMarketplacePrefs)
        .set(set)
        .where(
          and(
            eq(postgresSchema.stockMarketplacePrefs.baseStockCode, baseStockCode),
            eq(postgresSchema.stockMarketplacePrefs.marketplaceCode, marketplaceCode),
          ),
        ),
    mysql: (db) =>
      db
        .update(mysqlSchema.stockMarketplacePrefs)
        .set(set)
        .where(
          and(
            eq(mysqlSchema.stockMarketplacePrefs.baseStockCode, baseStockCode),
            eq(mysqlSchema.stockMarketplacePrefs.marketplaceCode, marketplaceCode),
          ),
        ),
  });
}

export async function getStockMarketplacePrefs(
  appDb: AppDatabase,
  baseStockCode: string,
  marketplaceCode: string,
): Promise<StockMarketplacePrefsRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.stockMarketplacePrefs)
          .where(
            and(
              eq(sqliteSchema.stockMarketplacePrefs.baseStockCode, baseStockCode),
              eq(sqliteSchema.stockMarketplacePrefs.marketplaceCode, marketplaceCode),
            ),
          )
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.stockMarketplacePrefs)
          .where(
            and(
              eq(postgresSchema.stockMarketplacePrefs.baseStockCode, baseStockCode),
              eq(postgresSchema.stockMarketplacePrefs.marketplaceCode, marketplaceCode),
            ),
          )
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.stockMarketplacePrefs)
          .where(
            and(
              eq(mysqlSchema.stockMarketplacePrefs.baseStockCode, baseStockCode),
              eq(mysqlSchema.stockMarketplacePrefs.marketplaceCode, marketplaceCode),
            ),
          )
      )[0],
  });
}

export interface BundleMemberRow {
  readonly memberStockCode: string;
  readonly quantity: number;
}

/**
 * Replaces a bundle's definition atomically: upsert the `bundles` row, delete its
 * current members, insert the new set. Matches the ERP bundle-table refresh described in
 * doc 01 §6, minus the legacy quantity-1 and five-member limitations.
 */
export async function replaceBundle(
  appDb: AppDatabase,
  bundleStockCode: string,
  name: string,
  members: readonly BundleMemberRow[],
  nowMs: number,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: async (db) => {
      db.transaction((tx) => {
        tx.insert(sqliteSchema.bundles)
          .values({ bundleStockCode, name, createdAt: nowMs, updatedAt: nowMs })
          .onConflictDoUpdate({
            target: sqliteSchema.bundles.bundleStockCode,
            set: { name, updatedAt: nowMs },
          })
          .run();
        tx.delete(sqliteSchema.bundleMembers)
          .where(eq(sqliteSchema.bundleMembers.bundleStockCode, bundleStockCode))
          .run();
        if (members.length > 0) {
          tx.insert(sqliteSchema.bundleMembers)
            .values(members.map((m) => ({ bundleStockCode, ...m })))
            .run();
        }
      });
    },
    postgres: async (db) => {
      await db.transaction(async (tx) => {
        await tx
          .insert(postgresSchema.bundles)
          .values({ bundleStockCode, name, createdAt: nowMs, updatedAt: nowMs })
          .onConflictDoUpdate({
            target: postgresSchema.bundles.bundleStockCode,
            set: { name, updatedAt: nowMs },
          });
        await tx
          .delete(postgresSchema.bundleMembers)
          .where(eq(postgresSchema.bundleMembers.bundleStockCode, bundleStockCode));
        if (members.length > 0) {
          await tx
            .insert(postgresSchema.bundleMembers)
            .values(members.map((m) => ({ bundleStockCode, ...m })));
        }
      });
    },
    mysql: async (db) => {
      await db.transaction(async (tx) => {
        await tx
          .insert(mysqlSchema.bundles)
          .values({ bundleStockCode, name, createdAt: nowMs, updatedAt: nowMs })
          .onDuplicateKeyUpdate({ set: { name, updatedAt: nowMs } });
        await tx
          .delete(mysqlSchema.bundleMembers)
          .where(eq(mysqlSchema.bundleMembers.bundleStockCode, bundleStockCode));
        if (members.length > 0) {
          await tx.insert(mysqlSchema.bundleMembers).values(members.map((m) => ({ bundleStockCode, ...m })));
        }
      });
    },
  });
}

export async function getBundleMembers(
  appDb: AppDatabase,
  bundleStockCode: string,
): Promise<BundleMemberRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({
          memberStockCode: sqliteSchema.bundleMembers.memberStockCode,
          quantity: sqliteSchema.bundleMembers.quantity,
        })
        .from(sqliteSchema.bundleMembers)
        .where(eq(sqliteSchema.bundleMembers.bundleStockCode, bundleStockCode)),
    postgres: (db) =>
      db
        .select({
          memberStockCode: postgresSchema.bundleMembers.memberStockCode,
          quantity: postgresSchema.bundleMembers.quantity,
        })
        .from(postgresSchema.bundleMembers)
        .where(eq(postgresSchema.bundleMembers.bundleStockCode, bundleStockCode)),
    mysql: (db) =>
      db
        .select({
          memberStockCode: mysqlSchema.bundleMembers.memberStockCode,
          quantity: mysqlSchema.bundleMembers.quantity,
        })
        .from(mysqlSchema.bundleMembers)
        .where(eq(mysqlSchema.bundleMembers.bundleStockCode, bundleStockCode)),
  });
}
