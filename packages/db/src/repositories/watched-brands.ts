/**
 * Repositories for `watched_brand_groups` and `watched_brands` — the brand-owner audit
 * module's registry (doc 06, api-references §1.7).
 *
 * See the doc comments on those tables in `schema/sqlite.ts` for why a watched brand is a
 * different thing from the `brands` row that `catalogRepo` serves: that one is our own
 * catalogue's taxonomy, derived from listings we sell; this one is mostly products we do not
 * sell, on a marketplace where we may have no presence at all.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export interface WatchedBrandGroupRow {
  readonly id: string;
  readonly name: string;
  readonly note: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface WatchedBrandRow {
  readonly id: string;
  readonly groupId: string;
  readonly marketplaceCode: string;
  readonly label: string;
  readonly brandRef: string | null;
  readonly searchTerm: string | null;
  readonly isActive: boolean;
  readonly lastSweptAt: number | null;
  readonly lastSweepProductCount: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Raised when a watched brand would be stored with neither selector set.
 *
 * Enforced here rather than in the schema because no dialect this project supports can express
 * "at least one of two nullable columns is non-null" portably — SQLite and Postgres have CHECK
 * constraints, MySQL's support is version-dependent, and Drizzle Kit would emit three different
 * things. One guarded write path is simpler to reason about than three constraints that might
 * drift, and the API route surfaces it as a field error rather than a 500.
 */
export class WatchedBrandSelectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatchedBrandSelectorError';
  }
}

function requireSelector(brandRef: string | null, searchTerm: string | null): void {
  const hasBrandRef = brandRef !== null && brandRef.trim() !== '';
  const hasSearchTerm = searchTerm !== null && searchTerm.trim() !== '';
  if (!hasBrandRef && !hasSearchTerm) {
    throw new WatchedBrandSelectorError(
      'A watched brand needs at least one of brandRef or searchTerm — it cannot be swept otherwise',
    );
  }
}

// ---------------------------------------------------------------------------- groups

export async function createWatchedBrandGroup(appDb: AppDatabase, row: WatchedBrandGroupRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.watchedBrandGroups).values(row),
    postgres: (db) => db.insert(postgresSchema.watchedBrandGroups).values(row),
    mysql: (db) => db.insert(mysqlSchema.watchedBrandGroups).values(row),
  });
}

export async function listWatchedBrandGroups(appDb: AppDatabase): Promise<WatchedBrandGroupRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db.select().from(sqliteSchema.watchedBrandGroups).orderBy(asc(sqliteSchema.watchedBrandGroups.name)),
    postgres: (db) =>
      db.select().from(postgresSchema.watchedBrandGroups).orderBy(asc(postgresSchema.watchedBrandGroups.name)),
    mysql: (db) =>
      db.select().from(mysqlSchema.watchedBrandGroups).orderBy(asc(mysqlSchema.watchedBrandGroups.name)),
  }) as Promise<WatchedBrandGroupRow[]>;
}

export async function renameWatchedBrandGroup(
  appDb: AppDatabase,
  id: string,
  name: string,
  note: string | null,
  updatedAt: number,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.watchedBrandGroups)
        .set({ name, note, updatedAt })
        .where(eq(sqliteSchema.watchedBrandGroups.id, id)),
    postgres: (db) =>
      db
        .update(postgresSchema.watchedBrandGroups)
        .set({ name, note, updatedAt })
        .where(eq(postgresSchema.watchedBrandGroups.id, id)),
    mysql: (db) =>
      db
        .update(mysqlSchema.watchedBrandGroups)
        .set({ name, note, updatedAt })
        .where(eq(mysqlSchema.watchedBrandGroups.id, id)),
  });
}

/**
 * Deletes a group and, by `cascade`, its watched brands.
 *
 * The tracked products those brands discovered are **not** deleted: their `watched_brand_id`
 * goes null (`set null` on that foreign key). Removing a brand from the watch list is a
 * decision about what to keep sweeping, not a reason to destroy observation history the
 * operator may still be reading.
 */
export async function deleteWatchedBrandGroup(appDb: AppDatabase, id: string): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db.delete(sqliteSchema.watchedBrandGroups).where(eq(sqliteSchema.watchedBrandGroups.id, id)),
    postgres: (db) =>
      db.delete(postgresSchema.watchedBrandGroups).where(eq(postgresSchema.watchedBrandGroups.id, id)),
    mysql: (db) =>
      db.delete(mysqlSchema.watchedBrandGroups).where(eq(mysqlSchema.watchedBrandGroups.id, id)),
  });
}

// ---------------------------------------------------------------------------- brands

/** @throws {WatchedBrandSelectorError} when neither selector is set. */
export async function createWatchedBrand(appDb: AppDatabase, row: WatchedBrandRow): Promise<void> {
  requireSelector(row.brandRef, row.searchTerm);
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.watchedBrands).values(row),
    postgres: (db) => db.insert(postgresSchema.watchedBrands).values(row),
    mysql: (db) => db.insert(mysqlSchema.watchedBrands).values(row),
  });
}

export async function listWatchedBrands(
  appDb: AppDatabase,
  options: { readonly activeOnly?: boolean; readonly groupId?: string } = {},
): Promise<WatchedBrandRow[]> {
  const conditions = <T extends { isActive: unknown; groupId: unknown }>(t: T) => {
    const parts = [];
    if (options.activeOnly) parts.push(eq(t.isActive as never, true));
    if (options.groupId !== undefined) parts.push(eq(t.groupId as never, options.groupId));
    return parts.length === 0 ? undefined : and(...parts);
  };
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.watchedBrands)
        .where(conditions(sqliteSchema.watchedBrands))
        .orderBy(asc(sqliteSchema.watchedBrands.label)),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.watchedBrands)
        .where(conditions(postgresSchema.watchedBrands))
        .orderBy(asc(postgresSchema.watchedBrands.label)),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.watchedBrands)
        .where(conditions(mysqlSchema.watchedBrands))
        .orderBy(asc(mysqlSchema.watchedBrands.label)),
  }) as Promise<WatchedBrandRow[]>;
}

export async function getWatchedBrand(appDb: AppDatabase, id: string): Promise<WatchedBrandRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (await db.select().from(sqliteSchema.watchedBrands).where(eq(sqliteSchema.watchedBrands.id, id)))[0],
    postgres: async (db) =>
      (await db.select().from(postgresSchema.watchedBrands).where(eq(postgresSchema.watchedBrands.id, id)))[0],
    mysql: async (db) =>
      (await db.select().from(mysqlSchema.watchedBrands).where(eq(mysqlSchema.watchedBrands.id, id)))[0],
  }) as Promise<WatchedBrandRow | undefined>;
}

export interface WatchedBrandUpdate {
  readonly label: string;
  readonly brandRef: string | null;
  readonly searchTerm: string | null;
  readonly isActive: boolean;
  readonly updatedAt: number;
}

/** @throws {WatchedBrandSelectorError} when the update would leave neither selector set. */
export async function updateWatchedBrand(
  appDb: AppDatabase,
  id: string,
  update: WatchedBrandUpdate,
): Promise<void> {
  requireSelector(update.brandRef, update.searchTerm);
  await runDialect(appDb, {
    sqlite: (db) =>
      db.update(sqliteSchema.watchedBrands).set(update).where(eq(sqliteSchema.watchedBrands.id, id)),
    postgres: (db) =>
      db.update(postgresSchema.watchedBrands).set(update).where(eq(postgresSchema.watchedBrands.id, id)),
    mysql: (db) =>
      db.update(mysqlSchema.watchedBrands).set(update).where(eq(mysqlSchema.watchedBrands.id, id)),
  });
}

export async function deleteWatchedBrand(appDb: AppDatabase, id: string): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.watchedBrands).where(eq(sqliteSchema.watchedBrands.id, id)),
    postgres: (db) => db.delete(postgresSchema.watchedBrands).where(eq(postgresSchema.watchedBrands.id, id)),
    mysql: (db) => db.delete(mysqlSchema.watchedBrands).where(eq(mysqlSchema.watchedBrands.id, id)),
  });
}

/**
 * Records that a sweep finished, with what it found.
 *
 * Written only on a **completed** sweep. A run that failed part-way leaves the previous values
 * standing, because "swept 3 hours ago, 1,847 products" stays true until a newer sweep actually
 * replaces it — overwriting it with a partial count would make the list screen report a
 * catalogue shrinking for no reason.
 */
export async function recordSweepResult(
  appDb: AppDatabase,
  id: string,
  sweptAt: number,
  productCount: number,
): Promise<void> {
  const set = { lastSweptAt: sweptAt, lastSweepProductCount: productCount, updatedAt: sweptAt };
  await runDialect(appDb, {
    sqlite: (db) =>
      db.update(sqliteSchema.watchedBrands).set(set).where(eq(sqliteSchema.watchedBrands.id, id)),
    postgres: (db) =>
      db.update(postgresSchema.watchedBrands).set(set).where(eq(postgresSchema.watchedBrands.id, id)),
    mysql: (db) =>
      db.update(mysqlSchema.watchedBrands).set(set).where(eq(mysqlSchema.watchedBrands.id, id)),
  });
}

/**
 * How many tracked products each watched brand currently accounts for, and how many of those
 * have never been rated — the two numbers the list screen shows and the dead-product suggestion
 * is built from.
 *
 * `rating_count = 0` is the "nobody has rated this" case and is the only one counted as dead. A
 * `null` means the sweep could not read a rating, which is a parser question, not a product
 * question, and lumping the two together would offer the operator rows to delete on the strength
 * of our own failure to parse them.
 */
export interface WatchedBrandCounts {
  readonly watchedBrandId: string;
  readonly productCount: number;
  readonly unratedCount: number;
}

/**
 * The marketplace brand id most of a brand's swept products actually carry, per watched brand.
 *
 * This exists so nobody has to look up a brand id by hand. A brand can be watched with a search
 * term alone — that is a complete, working configuration — and the products that sweep returns
 * each carry the marketplace's own brand id. Counting them tells us what the marketplace calls
 * this brand, which the UI then *offers* as a second selector.
 *
 * Offered, never applied automatically: adding a brand id changes what the next sweep fetches,
 * and that is the operator's decision. It is also the decision that turns on the search-vs-brand
 * comparison, which is the point — so it is worth asking about rather than doing silently.
 *
 * Returns the top ref per brand with its share of that brand's products, so a caller can
 * require a clear majority before showing it. A brand whose products are split evenly across
 * several refs is not a brand we have identified, and a low share is how that shows up.
 */
export interface SuggestedBrandRef {
  readonly watchedBrandId: string;
  readonly brandRef: string;
  readonly productCount: number;
  /** That ref's share of the brand's products, 0–1. */
  readonly share: number;
}

export async function suggestedBrandRefs(appDb: AppDatabase): Promise<SuggestedBrandRef[]> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({
          watchedBrandId: sqliteSchema.trackedProducts.watchedBrandId,
          brandRef: sqliteSchema.trackedProducts.brandRef,
          n: sql<number>`count(*)`,
        })
        .from(sqliteSchema.trackedProducts)
        .groupBy(sqliteSchema.trackedProducts.watchedBrandId, sqliteSchema.trackedProducts.brandRef),
    postgres: (db) =>
      db
        .select({
          watchedBrandId: postgresSchema.trackedProducts.watchedBrandId,
          brandRef: postgresSchema.trackedProducts.brandRef,
          n: sql<number>`count(*)`,
        })
        .from(postgresSchema.trackedProducts)
        .groupBy(postgresSchema.trackedProducts.watchedBrandId, postgresSchema.trackedProducts.brandRef),
    mysql: (db) =>
      db
        .select({
          watchedBrandId: mysqlSchema.trackedProducts.watchedBrandId,
          brandRef: mysqlSchema.trackedProducts.brandRef,
          n: sql<number>`count(*)`,
        })
        .from(mysqlSchema.trackedProducts)
        .groupBy(mysqlSchema.trackedProducts.watchedBrandId, mysqlSchema.trackedProducts.brandRef),
  })) as { watchedBrandId: string | null; brandRef: string | null; n: number }[];

  const byBrand = new Map<string, { total: number; counts: Map<string, number> }>();
  for (const row of rows) {
    if (row.watchedBrandId === null) continue;
    const n = Number(row.n);
    const entry = byBrand.get(row.watchedBrandId) ?? { total: 0, counts: new Map<string, number>() };
    entry.total += n;
    // A product whose ref could not be read still counts toward the total: it is a product we
    // hold and do not know the ref for, and hiding it would inflate the winner's share.
    if (row.brandRef !== null) entry.counts.set(row.brandRef, (entry.counts.get(row.brandRef) ?? 0) + n);
    byBrand.set(row.watchedBrandId, entry);
  }

  const suggestions: SuggestedBrandRef[] = [];
  for (const [watchedBrandId, { total, counts }] of byBrand) {
    let best: { ref: string; n: number } | undefined;
    for (const [ref, n] of counts) {
      if (best === undefined || n > best.n) best = { ref, n };
    }
    if (best === undefined || total === 0) continue;
    suggestions.push({
      watchedBrandId,
      brandRef: best.ref,
      productCount: best.n,
      share: best.n / total,
    });
  }
  return suggestions;
}

export async function watchedBrandCounts(appDb: AppDatabase): Promise<WatchedBrandCounts[]> {
  const unrated = (column: unknown) => sql<number>`sum(case when ${column} = 0 then 1 else 0 end)`;
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({
          watchedBrandId: sqliteSchema.trackedProducts.watchedBrandId,
          productCount: sql<number>`count(*)`,
          unratedCount: unrated(sqliteSchema.trackedProducts.ratingCount),
        })
        .from(sqliteSchema.trackedProducts)
        .groupBy(sqliteSchema.trackedProducts.watchedBrandId),
    postgres: (db) =>
      db
        .select({
          watchedBrandId: postgresSchema.trackedProducts.watchedBrandId,
          productCount: sql<number>`count(*)`,
          unratedCount: unrated(postgresSchema.trackedProducts.ratingCount),
        })
        .from(postgresSchema.trackedProducts)
        .groupBy(postgresSchema.trackedProducts.watchedBrandId),
    mysql: (db) =>
      db
        .select({
          watchedBrandId: mysqlSchema.trackedProducts.watchedBrandId,
          productCount: sql<number>`count(*)`,
          unratedCount: unrated(mysqlSchema.trackedProducts.ratingCount),
        })
        .from(mysqlSchema.trackedProducts)
        .groupBy(mysqlSchema.trackedProducts.watchedBrandId),
  });
  return rows
    .filter((row): row is typeof row & { watchedBrandId: string } => row.watchedBrandId !== null)
    .map((row) => ({
      watchedBrandId: row.watchedBrandId,
      // `count`/`sum` come back as strings on some drivers; normalise once, here.
      productCount: Number(row.productCount),
      unratedCount: Number(row.unratedCount ?? 0),
    }));
}
