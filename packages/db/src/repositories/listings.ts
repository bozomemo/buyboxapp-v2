/**
 * Repositories for `listings` and `listing_campaigns` (doc 05 §4).
 */
import { and, desc, eq, lt } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export interface ListingRow {
  readonly id: string;
  readonly marketplaceCode: string;
  readonly marketplaceListingId: string;
  readonly sellerStockCode: string;
  readonly baseStockCode: string | null;
  readonly unitCount: number;
  readonly isBundle: boolean;
  readonly productName: string;
  readonly price: bigint;
  readonly listPrice: bigint | null;
  readonly customerPrice: bigint | null;
  readonly offeredStock: number;
  readonly commissionRate: number | null;
  readonly vatRate: number | null;
  readonly dispatchTime: number | null;
  readonly isSalable: boolean;
  readonly isLocked: boolean;
  readonly isSuspended: boolean;
  readonly isFrozen: boolean;
  readonly isArchived: boolean;
  readonly isBlacklisted: boolean;
  readonly lockReasons: string | null;
  readonly deactivationReasons: string | null;
  readonly minPrice: bigint | null;
  readonly maxPrice: bigint | null;
  readonly allowIncrease: boolean;
  readonly allowDecrease: boolean;
  readonly repriceEnabled: boolean;
  readonly extra: string | null;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly updatedAt: number;
}

/**
 * Idempotent import upsert keyed on `(marketplaceCode, marketplaceListingId)`. Never touches
 * `id` (the primary key every FK — campaigns, repricing_state, price_submissions — points
 * at; the caller generates a fresh one for `values()` but an existing row must keep its own)
 * or `minPrice`/`maxPrice`/`allowIncrease`/`allowDecrease`/`repriceEnabled` — those are
 * operator-owned overrides an import must not clobber (doc 03 §3).
 */
export async function upsertListing(appDb: AppDatabase, row: ListingRow): Promise<void> {
  const {
    id: _id,
    marketplaceCode,
    marketplaceListingId,
    firstSeenAt,
    minPrice: _minPrice,
    maxPrice: _maxPrice,
    allowIncrease: _allowIncrease,
    allowDecrease: _allowDecrease,
    repriceEnabled: _repriceEnabled,
    ...set
  } = row;
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(sqliteSchema.listings)
        .values(row)
        .onConflictDoUpdate({
          target: [sqliteSchema.listings.marketplaceCode, sqliteSchema.listings.marketplaceListingId],
          set,
        }),
    postgres: (db) =>
      db
        .insert(postgresSchema.listings)
        .values(row)
        .onConflictDoUpdate({
          target: [postgresSchema.listings.marketplaceCode, postgresSchema.listings.marketplaceListingId],
          set,
        }),
    mysql: (db) => db.insert(mysqlSchema.listings).values(row).onDuplicateKeyUpdate({ set }),
  });
}

/**
 * The only path that may change the operator-owned override fields (doc 03 §3:
 * `minPrice`/`maxPrice`/`allowIncrease`/`allowDecrease`) and `repriceEnabled` — an
 * explicit UI/settings action, never an import. `upsertListing` deliberately excludes
 * these from its conflict update for exactly this reason.
 */
export async function setListingOverrides(
  appDb: AppDatabase,
  id: string,
  overrides: Partial<
    Pick<ListingRow, 'minPrice' | 'maxPrice' | 'allowIncrease' | 'allowDecrease' | 'repriceEnabled'>
  >,
  updatedAt: number,
): Promise<void> {
  const set = { ...overrides, updatedAt };
  await runDialect(appDb, {
    sqlite: (db) => db.update(sqliteSchema.listings).set(set).where(eq(sqliteSchema.listings.id, id)),
    postgres: (db) => db.update(postgresSchema.listings).set(set).where(eq(postgresSchema.listings.id, id)),
    mysql: (db) => db.update(mysqlSchema.listings).set(set).where(eq(mysqlSchema.listings.id, id)),
  });
}

export async function getListing(appDb: AppDatabase, id: string): Promise<ListingRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (await db.select().from(sqliteSchema.listings).where(eq(sqliteSchema.listings.id, id)))[0],
    postgres: async (db) =>
      (await db.select().from(postgresSchema.listings).where(eq(postgresSchema.listings.id, id)))[0],
    mysql: async (db) =>
      (await db.select().from(mysqlSchema.listings).where(eq(mysqlSchema.listings.id, id)))[0],
  });
}

export async function findListingByMarketplaceId(
  appDb: AppDatabase,
  marketplaceCode: string,
  marketplaceListingId: string,
): Promise<ListingRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.listings)
          .where(
            and(
              eq(sqliteSchema.listings.marketplaceCode, marketplaceCode),
              eq(sqliteSchema.listings.marketplaceListingId, marketplaceListingId),
            ),
          )
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.listings)
          .where(
            and(
              eq(postgresSchema.listings.marketplaceCode, marketplaceCode),
              eq(postgresSchema.listings.marketplaceListingId, marketplaceListingId),
            ),
          )
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.listings)
          .where(
            and(
              eq(mysqlSchema.listings.marketplaceCode, marketplaceCode),
              eq(mysqlSchema.listings.marketplaceListingId, marketplaceListingId),
            ),
          )
      )[0],
  });
}

export async function listRepriceableListings(
  appDb: AppDatabase,
  marketplaceCode: string,
): Promise<ListingRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.listings)
        .where(
          and(
            eq(sqliteSchema.listings.marketplaceCode, marketplaceCode),
            eq(sqliteSchema.listings.isSalable, true),
            eq(sqliteSchema.listings.repriceEnabled, true),
          ),
        ),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.listings)
        .where(
          and(
            eq(postgresSchema.listings.marketplaceCode, marketplaceCode),
            eq(postgresSchema.listings.isSalable, true),
            eq(postgresSchema.listings.repriceEnabled, true),
          ),
        ),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.listings)
        .where(
          and(
            eq(mysqlSchema.listings.marketplaceCode, marketplaceCode),
            eq(mysqlSchema.listings.isSalable, true),
            eq(mysqlSchema.listings.repriceEnabled, true),
          ),
        ),
  });
}

/**
 * The stale sweep (doc 05 §4: "`last_seen_at` drives the stale sweep: listings not seen
 * in the last N imports are marked inactive rather than deleted"). The schema has no
 * separate "active" flag, so this sets `isArchived = true` — the closest of the existing
 * status flags to "no longer actively tracked" — for every listing of the marketplace
 * whose `lastSeenAt` predates `cutoffMs`. Only ever called after a *fully successful*
 * import (doc 12 Phase 5.3): a partial failure must not archive listings the import
 * simply didn't get to.
 */
export async function sweepStaleListings(
  appDb: AppDatabase,
  marketplaceCode: string,
  cutoffMs: number,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.listings)
        .set({ isArchived: true })
        .where(
          and(
            eq(sqliteSchema.listings.marketplaceCode, marketplaceCode),
            lt(sqliteSchema.listings.lastSeenAt, cutoffMs),
          ),
        ),
    postgres: (db) =>
      db
        .update(postgresSchema.listings)
        .set({ isArchived: true })
        .where(
          and(
            eq(postgresSchema.listings.marketplaceCode, marketplaceCode),
            lt(postgresSchema.listings.lastSeenAt, cutoffMs),
          ),
        ),
    mysql: (db) =>
      db
        .update(mysqlSchema.listings)
        .set({ isArchived: true })
        .where(
          and(
            eq(mysqlSchema.listings.marketplaceCode, marketplaceCode),
            lt(mysqlSchema.listings.lastSeenAt, cutoffMs),
          ),
        ),
  });
}

export interface ListingCampaignRow {
  readonly id: string;
  readonly listingId: string;
  readonly finalPrice: bigint;
  readonly storeSharePct: number;
  readonly startsAt: number | null;
  readonly endsAt: number | null;
  readonly observedAt: number;
}

/** Append-only — doc 05 §4: "1..N per listing; the legacy kept only the first." */
export async function insertListingCampaign(appDb: AppDatabase, row: ListingCampaignRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.listingCampaigns).values(row),
    postgres: (db) => db.insert(postgresSchema.listingCampaigns).values(row),
    mysql: (db) => db.insert(mysqlSchema.listingCampaigns).values(row),
  });
}

export async function latestListingCampaign(
  appDb: AppDatabase,
  listingId: string,
): Promise<ListingCampaignRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.listingCampaigns)
          .where(eq(sqliteSchema.listingCampaigns.listingId, listingId))
          .orderBy(desc(sqliteSchema.listingCampaigns.observedAt))
          .limit(1)
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.listingCampaigns)
          .where(eq(postgresSchema.listingCampaigns.listingId, listingId))
          .orderBy(desc(postgresSchema.listingCampaigns.observedAt))
          .limit(1)
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.listingCampaigns)
          .where(eq(mysqlSchema.listingCampaigns.listingId, listingId))
          .orderBy(desc(mysqlSchema.listingCampaigns.observedAt))
          .limit(1)
      )[0],
  });
}
