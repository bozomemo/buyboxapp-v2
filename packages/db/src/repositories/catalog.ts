/**
 * Repositories for `brands` and `categories` (doc 05, doc 06 §12.1, customer feedback
 * 2026-08-25). Normalised reference tables, upserted from the same product-filter response
 * `ImportListings` already fetches (api-references.md §1.4) — no new marketplace call.
 */
import { and, count, eq, inArray } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export interface CatalogRefRow {
  readonly id: string;
  readonly marketplaceCode: string;
  readonly ref: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Idempotent upsert keyed on `(marketplaceCode, ref)`, returning the row's durable `id` for the
 * caller to set as `listings.brandId`. The name is refreshed on every import — a marketplace
 * rename should show up, not stick to whatever it was called on first sight.
 */
export async function upsertBrand(
  appDb: AppDatabase,
  row: { id: string; marketplaceCode: string; ref: string; name: string; nowMs: number },
): Promise<string> {
  return upsertCatalogRef(appDb, 'brands', row);
}

export async function upsertCategory(
  appDb: AppDatabase,
  row: { id: string; marketplaceCode: string; ref: string; name: string; nowMs: number },
): Promise<string> {
  return upsertCatalogRef(appDb, 'categories', row);
}

async function upsertCatalogRef(
  appDb: AppDatabase,
  table: 'brands' | 'categories',
  row: { id: string; marketplaceCode: string; ref: string; name: string; nowMs: number },
): Promise<string> {
  const values = {
    id: row.id,
    marketplaceCode: row.marketplaceCode,
    ref: row.ref,
    name: row.name,
    createdAt: row.nowMs,
    updatedAt: row.nowMs,
  };
  await runDialect(appDb, {
    sqlite: (db) => {
      const t = table === 'brands' ? sqliteSchema.brands : sqliteSchema.categories;
      return db
        .insert(t)
        .values(values)
        .onConflictDoUpdate({ target: [t.marketplaceCode, t.ref], set: { name: row.name, updatedAt: row.nowMs } });
    },
    postgres: (db) => {
      const t = table === 'brands' ? postgresSchema.brands : postgresSchema.categories;
      return db
        .insert(t)
        .values(values)
        .onConflictDoUpdate({ target: [t.marketplaceCode, t.ref], set: { name: row.name, updatedAt: row.nowMs } });
    },
    mysql: (db) => {
      const t = table === 'brands' ? mysqlSchema.brands : mysqlSchema.categories;
      return db
        .insert(t)
        .values(values)
        .onDuplicateKeyUpdate({ set: { name: row.name, updatedAt: row.nowMs } });
    },
  });
  const existing = await withDialect(appDb, {
    sqlite: async (db) => {
      const t = table === 'brands' ? sqliteSchema.brands : sqliteSchema.categories;
      return (
        await db
          .select({ id: t.id })
          .from(t)
          .where(and(eq(t.marketplaceCode, row.marketplaceCode), eq(t.ref, row.ref)))
      )[0];
    },
    postgres: async (db) => {
      const t = table === 'brands' ? postgresSchema.brands : postgresSchema.categories;
      return (
        await db
          .select({ id: t.id })
          .from(t)
          .where(and(eq(t.marketplaceCode, row.marketplaceCode), eq(t.ref, row.ref)))
      )[0];
    },
    mysql: async (db) => {
      const t = table === 'brands' ? mysqlSchema.brands : mysqlSchema.categories;
      return (
        await db
          .select({ id: t.id })
          .from(t)
          .where(and(eq(t.marketplaceCode, row.marketplaceCode), eq(t.ref, row.ref)))
      )[0];
    },
  });
  // The conflict branch never changes `id` (matches every other upsert in this codebase —
  // see the comment on `listingsRepo.upsertListing`), so re-reading it here is the only way
  // to hand the caller the row's *actual* id, which is `row.id` only on first insert.
  return existing?.id ?? row.id;
}

/**
 * Brand name per listing id, for the "Marka - Ürün Adı" display every product-showing screen
 * uses (customer feedback 2026-08-25).
 *
 * Keyed by *listing* id rather than brand id so a caller only needs the ids it already has.
 * The report queries behind the competitor screens select `listings.product_name` without ever
 * touching `listings.brand_id`; making each of them carry a brand join would mean editing a
 * dozen dialect-triplicated selects to serve a label. One lookup per response instead, from
 * whatever listing ids that response happens to name.
 *
 * A listing whose `brandId` is null — every Hepsiburada row today (doc 06 §12.1) — simply has
 * no entry, and callers fall back to the bare product name.
 */
export async function brandNamesByListingIds(
  appDb: AppDatabase,
  listingIds: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (listingIds.length === 0) return names;
  const unique = [...new Set(listingIds)];
  // Chunked because the largest caller is the listings CSV export (up to 5,000 rows) and every
  // supported dialect caps how many bound parameters one statement may carry.
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const rows = await withDialect(appDb, {
      sqlite: (db) =>
        db
          .select({ listingId: sqliteSchema.listings.id, name: sqliteSchema.brands.name })
          .from(sqliteSchema.listings)
          .innerJoin(sqliteSchema.brands, eq(sqliteSchema.listings.brandId, sqliteSchema.brands.id))
          .where(inArray(sqliteSchema.listings.id, chunk)),
      postgres: (db) =>
        db
          .select({ listingId: postgresSchema.listings.id, name: postgresSchema.brands.name })
          .from(postgresSchema.listings)
          .innerJoin(
            postgresSchema.brands,
            eq(postgresSchema.listings.brandId, postgresSchema.brands.id),
          )
          .where(inArray(postgresSchema.listings.id, chunk)),
      mysql: (db) =>
        db
          .select({ listingId: mysqlSchema.listings.id, name: mysqlSchema.brands.name })
          .from(mysqlSchema.listings)
          .innerJoin(mysqlSchema.brands, eq(mysqlSchema.listings.brandId, mysqlSchema.brands.id))
          .where(inArray(mysqlSchema.listings.id, chunk)),
    });
    for (const r of rows) names.set(r.listingId, r.name);
  }
  return names;
}

export interface CatalogRefWithCount extends CatalogRefRow {
  readonly listingCount: number;
}

/** Brands with how many (non-archived) listings carry them — the `/brands` screen's list. */
export async function listBrandsWithCounts(appDb: AppDatabase): Promise<CatalogRefWithCount[]> {
  return listCatalogRefsWithCounts(appDb, 'brands');
}

export async function listCategoriesWithCounts(appDb: AppDatabase): Promise<CatalogRefWithCount[]> {
  return listCatalogRefsWithCounts(appDb, 'categories');
}

async function listCatalogRefsWithCounts(
  appDb: AppDatabase,
  table: 'brands' | 'categories',
): Promise<CatalogRefWithCount[]> {
  const rows = await withDialect(appDb, {
    sqlite: (db) => {
      const t = table === 'brands' ? sqliteSchema.brands : sqliteSchema.categories;
      const fk = table === 'brands' ? sqliteSchema.listings.brandId : sqliteSchema.listings.categoryId;
      return db
        .select({ ref: t, listingCount: count(sqliteSchema.listings.id) })
        .from(t)
        .leftJoin(sqliteSchema.listings, and(eq(fk, t.id), eq(sqliteSchema.listings.isArchived, false)))
        .groupBy(t.id);
    },
    postgres: (db) => {
      const t = table === 'brands' ? postgresSchema.brands : postgresSchema.categories;
      const fk = table === 'brands' ? postgresSchema.listings.brandId : postgresSchema.listings.categoryId;
      return db
        .select({ ref: t, listingCount: count(postgresSchema.listings.id) })
        .from(t)
        .leftJoin(postgresSchema.listings, and(eq(fk, t.id), eq(postgresSchema.listings.isArchived, false)))
        .groupBy(t.id);
    },
    mysql: (db) => {
      const t = table === 'brands' ? mysqlSchema.brands : mysqlSchema.categories;
      const fk = table === 'brands' ? mysqlSchema.listings.brandId : mysqlSchema.listings.categoryId;
      return db
        .select({ ref: t, listingCount: count(mysqlSchema.listings.id) })
        .from(t)
        .leftJoin(mysqlSchema.listings, and(eq(fk, t.id), eq(mysqlSchema.listings.isArchived, false)))
        .groupBy(t.id);
    },
  });
  return rows
    .map((r) => ({ ...(r.ref as CatalogRefRow), listingCount: Number(r.listingCount) }))
    .sort((a, b) => b.listingCount - a.listingCount);
}
