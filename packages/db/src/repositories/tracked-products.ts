/**
 * Repositories for `tracked_products` and `tracked_product_observations` (doc 06 §12.2,
 * customer feedback 2026-08-25). See the doc comment on `trackedProducts` in
 * `schema/sqlite.ts` for why this is a wholly separate table from `listings` rather than a
 * listing row with the sale-facing fields left null.
 */
import { and, asc, desc, eq, gte } from 'drizzle-orm';
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
  readonly status: 'ok' | 'parseFailed' | 'fetchFailed';
  readonly rank: number | null;
  readonly sellerName: string | null;
  readonly sellerRef: string | null;
  readonly price: bigint | null;
  readonly finalPrice: bigint | null;
  readonly offeredStock: number | null;
}

/** Always inserted, one row per offer (or one status-only row on failure) — no change-detection
 * hash here; see the doc comment on `trackedProductObservations` in `schema/sqlite.ts`. */
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
