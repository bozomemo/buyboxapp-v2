/**
 * Repositories for `competitor_sellers` and `competitor_seller_groups` (doc 05 §5) — the
 * durable identity behind the seller-centric reports (doc 06 §6) and, later, alert rules.
 *
 * `competitor_observations` answers "what did this seller do at 09:14?". These two tables
 * answer "who is this seller?", which is a different question with a different lifetime: a
 * rule naming a competitor must keep meaning the same company after the company renames
 * itself, and after the observation rows that first introduced it have been pruned.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export interface CompetitorSellerGroupRow {
  readonly id: string;
  readonly displayName: string;
  readonly note: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CompetitorSellerRow {
  readonly id: string;
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  readonly sellerName: string;
  readonly groupId: string | null;
  readonly operatorNote: string | null;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
}

/** What a scrape knows about a seller: its identity, its current name, and when it was seen. */
export interface SeenSeller {
  readonly id: string;
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  readonly sellerName: string;
  readonly seenAt: number;
}

/**
 * Records that these sellers exist, from a scrape's offer set.
 *
 * Deliberately an `ensure`/`update` split rather than a plain upsert, for the same reason
 * `upsertListing` splits (doc 07 §1.1): `group_id` and `operator_note` are **operator-owned**.
 * A scrape that overwrote them would silently undo a cross-marketplace link the operator made
 * by hand — the one piece of data in this table that no automatic process can reproduce.
 * `first_seen_at` is likewise never moved forward; it is the earliest evidence we hold.
 *
 * Only `seller_name` (which changes under a stable ref) and `last_seen_at` are refreshed.
 * Callers pass only sellers the payload identified — a seller with a null `sellerRef` has no
 * durable identity and is skipped rather than matched by name.
 */
export async function recordSeenSellers(appDb: AppDatabase, sellers: readonly SeenSeller[]): Promise<void> {
  if (sellers.length === 0) return;

  // Collapse duplicates within the batch: one offer set can list the same merchant twice
  // (different variants of the same product), and an INSERT with two rows sharing the unique
  // key fails on MySQL/Postgres before the conflict clause is ever reached.
  const deduped = new Map<string, SeenSeller>();
  for (const seller of sellers) {
    const key = `${seller.marketplaceCode}::${seller.sellerRef}`;
    const existing = deduped.get(key);
    if (!existing || seller.seenAt > existing.seenAt) deduped.set(key, seller);
  }
  const rows = [...deduped.values()].map((seller) => ({
    id: seller.id,
    marketplaceCode: seller.marketplaceCode,
    sellerRef: seller.sellerRef,
    sellerName: seller.sellerName,
    groupId: null,
    operatorNote: null,
    firstSeenAt: seller.seenAt,
    lastSeenAt: seller.seenAt,
  }));

  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(sqliteSchema.competitorSellers)
        .values(rows)
        .onConflictDoUpdate({
          target: [sqliteSchema.competitorSellers.marketplaceCode, sqliteSchema.competitorSellers.sellerRef],
          set: {
            sellerName: sql`excluded.seller_name`,
            // Guarded rather than assigned: scrapes can arrive out of order (a retry of an
            // older cycle finishing after a newer one), and "last seen" must not go backwards.
            lastSeenAt: sql`max(${sqliteSchema.competitorSellers.lastSeenAt}, excluded.last_seen_at)`,
          },
        }),
    postgres: (db) =>
      db
        .insert(postgresSchema.competitorSellers)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            postgresSchema.competitorSellers.marketplaceCode,
            postgresSchema.competitorSellers.sellerRef,
          ],
          set: {
            sellerName: sql`excluded.seller_name`,
            lastSeenAt: sql`greatest(${postgresSchema.competitorSellers.lastSeenAt}, excluded.last_seen_at)`,
          },
        }),
    mysql: (db) =>
      db
        .insert(mysqlSchema.competitorSellers)
        .values(rows)
        .onDuplicateKeyUpdate({
          set: {
            sellerName: sql`values(seller_name)`,
            lastSeenAt: sql`greatest(${mysqlSchema.competitorSellers.lastSeenAt}, values(last_seen_at))`,
          },
        }),
  });
}

export interface CompetitorSellerFilters {
  readonly marketplaceCode?: string;
  readonly groupId?: string;
}

export async function listCompetitorSellers(
  appDb: AppDatabase,
  filters: CompetitorSellerFilters = {},
): Promise<CompetitorSellerRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.competitorSellers)
        .where(
          and(
            filters.marketplaceCode
              ? eq(sqliteSchema.competitorSellers.marketplaceCode, filters.marketplaceCode)
              : undefined,
            filters.groupId ? eq(sqliteSchema.competitorSellers.groupId, filters.groupId) : undefined,
          ),
        )
        .orderBy(asc(sqliteSchema.competitorSellers.sellerName)),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.competitorSellers)
        .where(
          and(
            filters.marketplaceCode
              ? eq(postgresSchema.competitorSellers.marketplaceCode, filters.marketplaceCode)
              : undefined,
            filters.groupId ? eq(postgresSchema.competitorSellers.groupId, filters.groupId) : undefined,
          ),
        )
        .orderBy(asc(postgresSchema.competitorSellers.sellerName)),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.competitorSellers)
        .where(
          and(
            filters.marketplaceCode
              ? eq(mysqlSchema.competitorSellers.marketplaceCode, filters.marketplaceCode)
              : undefined,
            filters.groupId ? eq(mysqlSchema.competitorSellers.groupId, filters.groupId) : undefined,
          ),
        )
        .orderBy(asc(mysqlSchema.competitorSellers.sellerName)),
  }) as Promise<CompetitorSellerRow[]>;
}

export async function getCompetitorSeller(
  appDb: AppDatabase,
  marketplaceCode: string,
  sellerRef: string,
): Promise<CompetitorSellerRow | undefined> {
  const result = await withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.competitorSellers)
          .where(
            and(
              eq(sqliteSchema.competitorSellers.marketplaceCode, marketplaceCode),
              eq(sqliteSchema.competitorSellers.sellerRef, sellerRef),
            ),
          )
          .limit(1)
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.competitorSellers)
          .where(
            and(
              eq(postgresSchema.competitorSellers.marketplaceCode, marketplaceCode),
              eq(postgresSchema.competitorSellers.sellerRef, sellerRef),
            ),
          )
          .limit(1)
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.competitorSellers)
          .where(
            and(
              eq(mysqlSchema.competitorSellers.marketplaceCode, marketplaceCode),
              eq(mysqlSchema.competitorSellers.sellerRef, sellerRef),
            ),
          )
          .limit(1)
      )[0],
  });
  return result as CompetitorSellerRow | undefined;
}

/**
 * Links a seller to a group, or clears the link with `null`.
 *
 * The caller is responsible for writing the `settings_audit` row (doc 06 §9) — this is an
 * operator assertion, not an observation, and the API routes that expose it already own the
 * audit pattern via `configRepo.recordSettingsAudit`.
 */
export async function setSellerGroup(
  appDb: AppDatabase,
  sellerId: string,
  groupId: string | null,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.competitorSellers)
        .set({ groupId })
        .where(eq(sqliteSchema.competitorSellers.id, sellerId)),
    postgres: (db) =>
      db
        .update(postgresSchema.competitorSellers)
        .set({ groupId })
        .where(eq(postgresSchema.competitorSellers.id, sellerId)),
    mysql: (db) =>
      db
        .update(mysqlSchema.competitorSellers)
        .set({ groupId })
        .where(eq(mysqlSchema.competitorSellers.id, sellerId)),
  });
}

export async function setSellerNote(
  appDb: AppDatabase,
  sellerId: string,
  operatorNote: string | null,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.competitorSellers)
        .set({ operatorNote })
        .where(eq(sqliteSchema.competitorSellers.id, sellerId)),
    postgres: (db) =>
      db
        .update(postgresSchema.competitorSellers)
        .set({ operatorNote })
        .where(eq(postgresSchema.competitorSellers.id, sellerId)),
    mysql: (db) =>
      db
        .update(mysqlSchema.competitorSellers)
        .set({ operatorNote })
        .where(eq(mysqlSchema.competitorSellers.id, sellerId)),
  });
}

export async function upsertSellerGroup(appDb: AppDatabase, row: CompetitorSellerGroupRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(sqliteSchema.competitorSellerGroups)
        .values(row)
        .onConflictDoUpdate({
          target: sqliteSchema.competitorSellerGroups.id,
          set: { displayName: row.displayName, note: row.note, updatedAt: row.updatedAt },
        }),
    postgres: (db) =>
      db
        .insert(postgresSchema.competitorSellerGroups)
        .values(row)
        .onConflictDoUpdate({
          target: postgresSchema.competitorSellerGroups.id,
          set: { displayName: row.displayName, note: row.note, updatedAt: row.updatedAt },
        }),
    mysql: (db) =>
      db
        .insert(mysqlSchema.competitorSellerGroups)
        .values(row)
        .onDuplicateKeyUpdate({
          set: { displayName: row.displayName, note: row.note, updatedAt: row.updatedAt },
        }),
  });
}

export async function listSellerGroups(appDb: AppDatabase): Promise<CompetitorSellerGroupRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.competitorSellerGroups)
        .orderBy(asc(sqliteSchema.competitorSellerGroups.displayName)),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.competitorSellerGroups)
        .orderBy(asc(postgresSchema.competitorSellerGroups.displayName)),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.competitorSellerGroups)
        .orderBy(asc(mysqlSchema.competitorSellerGroups.displayName)),
  }) as Promise<CompetitorSellerGroupRow[]>;
}

/**
 * Deleting a group unlinks its members (`on delete set null`) rather than deleting them: the
 * sellers are observed facts, the grouping is an opinion, and withdrawing the opinion must not
 * erase the evidence.
 */
export async function deleteSellerGroup(appDb: AppDatabase, groupId: string): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .delete(sqliteSchema.competitorSellerGroups)
        .where(eq(sqliteSchema.competitorSellerGroups.id, groupId)),
    postgres: (db) =>
      db
        .delete(postgresSchema.competitorSellerGroups)
        .where(eq(postgresSchema.competitorSellerGroups.id, groupId)),
    mysql: (db) =>
      db
        .delete(mysqlSchema.competitorSellerGroups)
        .where(eq(mysqlSchema.competitorSellerGroups.id, groupId)),
  });
}

/**
 * Every seller ref that belongs to the same group as the given one, across marketplaces —
 * the expansion an alert rule targeting a *group* needs before it can match observation rows,
 * which carry a per-marketplace `seller_ref` and know nothing about groups.
 *
 * A seller in no group expands to just itself, so callers need no special case.
 */
export async function expandSellerGroup(
  appDb: AppDatabase,
  marketplaceCode: string,
  sellerRef: string,
): Promise<{ marketplaceCode: string; sellerRef: string }[]> {
  const seller = await getCompetitorSeller(appDb, marketplaceCode, sellerRef);
  if (!seller) return [{ marketplaceCode, sellerRef }];
  if (seller.groupId === null) return [{ marketplaceCode, sellerRef }];
  const members = await listCompetitorSellers(appDb, { groupId: seller.groupId });
  return members.map((m) => ({ marketplaceCode: m.marketplaceCode, sellerRef: m.sellerRef }));
}

/** Bulk name lookup for report rows, which carry `seller_ref` but should display a group name. */
export async function sellersByRefs(
  appDb: AppDatabase,
  marketplaceCode: string,
  sellerRefs: readonly string[],
): Promise<CompetitorSellerRow[]> {
  if (sellerRefs.length === 0) return [];
  const refs = [...sellerRefs];
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.competitorSellers)
        .where(
          and(
            eq(sqliteSchema.competitorSellers.marketplaceCode, marketplaceCode),
            inArray(sqliteSchema.competitorSellers.sellerRef, refs),
          ),
        ),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.competitorSellers)
        .where(
          and(
            eq(postgresSchema.competitorSellers.marketplaceCode, marketplaceCode),
            inArray(postgresSchema.competitorSellers.sellerRef, refs),
          ),
        ),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.competitorSellers)
        .where(
          and(
            eq(mysqlSchema.competitorSellers.marketplaceCode, marketplaceCode),
            inArray(mysqlSchema.competitorSellers.sellerRef, refs),
          ),
        ),
  }) as Promise<CompetitorSellerRow[]>;
}
