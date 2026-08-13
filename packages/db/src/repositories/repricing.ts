/**
 * Repositories for `repricing_state`, `price_submissions`, `update_budget_usage`
 * (doc 05 §6).
 */
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export interface RepricingStateRow {
  readonly listingId: string;
  readonly phase: 'SEEKING' | 'CLIMBING' | 'REFINING' | 'OPTIMUM' | 'BLOCKED';
  readonly lastGoodPrice: bigint | null;
  readonly lastBadPrice: bigint | null;
  readonly optimumPrice: bigint | null;
  readonly optimumCtxUnitCost: bigint | null;
  readonly optimumCtxCommissionRate: number | null;
  readonly optimumCtxVatRate: number | null;
  readonly optimumCtxCampaignRatio: number | null;
  readonly optimumCtxSecondPrice: bigint | null;
  readonly optimumCtxSecondSellerRef: string | null;
  readonly pendingSubmissionId: string | null;
  readonly settleUntil: number | null;
  readonly consecutiveRejections: number;
  readonly updatedAt: number;
}

export async function upsertRepricingState(appDb: AppDatabase, row: RepricingStateRow): Promise<void> {
  const { listingId, ...set } = row;
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(sqliteSchema.repricingState)
        .values(row)
        .onConflictDoUpdate({ target: sqliteSchema.repricingState.listingId, set }),
    postgres: (db) =>
      db
        .insert(postgresSchema.repricingState)
        .values(row)
        .onConflictDoUpdate({ target: postgresSchema.repricingState.listingId, set }),
    mysql: (db) => db.insert(mysqlSchema.repricingState).values(row).onDuplicateKeyUpdate({ set }),
  });
}

export async function getRepricingState(
  appDb: AppDatabase,
  listingId: string,
): Promise<RepricingStateRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.repricingState)
          .where(eq(sqliteSchema.repricingState.listingId, listingId))
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.repricingState)
          .where(eq(postgresSchema.repricingState.listingId, listingId))
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.repricingState)
          .where(eq(mysqlSchema.repricingState.listingId, listingId))
      )[0],
  }) as Promise<RepricingStateRow | undefined>;
}

export interface PriceSubmissionRow {
  readonly id: string;
  readonly listingId: string;
  readonly marketplaceCode: string;
  readonly oldPrice: bigint;
  readonly newPrice: bigint;
  readonly reason: string;
  readonly explanation: string;
  readonly priority: number;
  readonly decidedAt: number;
  readonly state: 'queued' | 'submitted' | 'confirmed' | 'failed' | 'rejected' | 'cancelled';
  readonly submittedAt: number | null;
  readonly confirmedAt: number | null;
  readonly marketplaceHandle: string | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly attempts: number;
  readonly unitCost: bigint | null;
  readonly floorPrice: bigint | null;
  readonly buyboxPrice: bigint | null;
  readonly secondPrice: bigint | null;
  readonly rank: number | null;
  readonly commissionRate: number | null;
  readonly vatRate: number | null;
}

/** The audit trail is only ever appended to (doc 05 §6) — never updated after insert
 * except through the explicit state-transition helpers below. */
export async function insertPriceSubmission(appDb: AppDatabase, row: PriceSubmissionRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.priceSubmissions).values(row),
    postgres: (db) => db.insert(postgresSchema.priceSubmissions).values(row),
    mysql: (db) => db.insert(mysqlSchema.priceSubmissions).values(row),
  });
}

export async function getPriceSubmission(
  appDb: AppDatabase,
  id: string,
): Promise<PriceSubmissionRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db.select().from(sqliteSchema.priceSubmissions).where(eq(sqliteSchema.priceSubmissions.id, id))
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.priceSubmissions)
          .where(eq(postgresSchema.priceSubmissions.id, id))
      )[0],
    mysql: async (db) =>
      (
        await db.select().from(mysqlSchema.priceSubmissions).where(eq(mysqlSchema.priceSubmissions.id, id))
      )[0],
  }) as Promise<PriceSubmissionRow | undefined>;
}

export async function markSubmitted(
  appDb: AppDatabase,
  id: string,
  marketplaceHandle: string | null,
  submittedAt: number,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.priceSubmissions)
        .set({ state: 'submitted', marketplaceHandle, submittedAt })
        .where(eq(sqliteSchema.priceSubmissions.id, id)),
    postgres: (db) =>
      db
        .update(postgresSchema.priceSubmissions)
        .set({ state: 'submitted', marketplaceHandle, submittedAt })
        .where(eq(postgresSchema.priceSubmissions.id, id)),
    mysql: (db) =>
      db
        .update(mysqlSchema.priceSubmissions)
        .set({ state: 'submitted', marketplaceHandle, submittedAt })
        .where(eq(mysqlSchema.priceSubmissions.id, id)),
  });
}

/**
 * Confirmation only — the audit record's price move is written *after* the marketplace
 * confirms (CLAUDE.md hard rule), so this is the step that makes a submission "real."
 */
export async function markConfirmed(appDb: AppDatabase, id: string, confirmedAt: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.priceSubmissions)
        .set({ state: 'confirmed', confirmedAt })
        .where(eq(sqliteSchema.priceSubmissions.id, id)),
    postgres: (db) =>
      db
        .update(postgresSchema.priceSubmissions)
        .set({ state: 'confirmed', confirmedAt })
        .where(eq(postgresSchema.priceSubmissions.id, id)),
    mysql: (db) =>
      db
        .update(mysqlSchema.priceSubmissions)
        .set({ state: 'confirmed', confirmedAt })
        .where(eq(mysqlSchema.priceSubmissions.id, id)),
  });
}

export async function markFailed(
  appDb: AppDatabase,
  id: string,
  state: 'failed' | 'rejected' | 'cancelled',
  failureCode: string | null,
  failureMessage: string | null,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.priceSubmissions)
        .set({
          state,
          failureCode,
          failureMessage,
          attempts: sql`${sqliteSchema.priceSubmissions.attempts} + 1`,
        })
        .where(eq(sqliteSchema.priceSubmissions.id, id)),
    postgres: (db) =>
      db
        .update(postgresSchema.priceSubmissions)
        .set({
          state,
          failureCode,
          failureMessage,
          attempts: sql`${postgresSchema.priceSubmissions.attempts} + 1`,
        })
        .where(eq(postgresSchema.priceSubmissions.id, id)),
    mysql: (db) =>
      db
        .update(mysqlSchema.priceSubmissions)
        .set({
          state,
          failureCode,
          failureMessage,
          attempts: sql`${mysqlSchema.priceSubmissions.attempts} + 1`,
        })
        .where(eq(mysqlSchema.priceSubmissions.id, id)),
  });
}

/** The outbox drain (doc 05 §6 index `(state, priority, decided_at)`): oldest, highest-priority queued submissions first. */
export async function drainOutbox(
  appDb: AppDatabase,
  marketplaceCode: string,
  limit: number,
): Promise<PriceSubmissionRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.priceSubmissions)
        .where(
          and(
            eq(sqliteSchema.priceSubmissions.marketplaceCode, marketplaceCode),
            eq(sqliteSchema.priceSubmissions.state, 'queued'),
          ),
        )
        .orderBy(asc(sqliteSchema.priceSubmissions.priority), asc(sqliteSchema.priceSubmissions.decidedAt))
        .limit(limit),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.priceSubmissions)
        .where(
          and(
            eq(postgresSchema.priceSubmissions.marketplaceCode, marketplaceCode),
            eq(postgresSchema.priceSubmissions.state, 'queued'),
          ),
        )
        .orderBy(
          asc(postgresSchema.priceSubmissions.priority),
          asc(postgresSchema.priceSubmissions.decidedAt),
        )
        .limit(limit),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.priceSubmissions)
        .where(
          and(
            eq(mysqlSchema.priceSubmissions.marketplaceCode, marketplaceCode),
            eq(mysqlSchema.priceSubmissions.state, 'queued'),
          ),
        )
        .orderBy(asc(mysqlSchema.priceSubmissions.priority), asc(mysqlSchema.priceSubmissions.decidedAt))
        .limit(limit),
  }) as Promise<PriceSubmissionRow[]>;
}

/** Submissions awaiting confirmation (doc 07 §2 `ConfirmSubmissions`), oldest first. */
export async function listSubmittedSubmissions(
  appDb: AppDatabase,
  marketplaceCode: string,
  limit: number,
): Promise<PriceSubmissionRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.priceSubmissions)
        .where(
          and(
            eq(sqliteSchema.priceSubmissions.marketplaceCode, marketplaceCode),
            eq(sqliteSchema.priceSubmissions.state, 'submitted'),
          ),
        )
        .orderBy(asc(sqliteSchema.priceSubmissions.submittedAt))
        .limit(limit),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.priceSubmissions)
        .where(
          and(
            eq(postgresSchema.priceSubmissions.marketplaceCode, marketplaceCode),
            eq(postgresSchema.priceSubmissions.state, 'submitted'),
          ),
        )
        .orderBy(asc(postgresSchema.priceSubmissions.submittedAt))
        .limit(limit),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.priceSubmissions)
        .where(
          and(
            eq(mysqlSchema.priceSubmissions.marketplaceCode, marketplaceCode),
            eq(mysqlSchema.priceSubmissions.state, 'submitted'),
          ),
        )
        .orderBy(asc(mysqlSchema.priceSubmissions.submittedAt))
        .limit(limit),
  }) as Promise<PriceSubmissionRow[]>;
}

/** Retention: 60 days (doc 05 §10). */
export async function prunePriceSubmissions(appDb: AppDatabase, cutoffMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db.delete(sqliteSchema.priceSubmissions).where(lte(sqliteSchema.priceSubmissions.decidedAt, cutoffMs)),
    postgres: (db) =>
      db
        .delete(postgresSchema.priceSubmissions)
        .where(lte(postgresSchema.priceSubmissions.decidedAt, cutoffMs)),
    mysql: (db) =>
      db.delete(mysqlSchema.priceSubmissions).where(lte(mysqlSchema.priceSubmissions.decidedAt, cutoffMs)),
  });
}

export interface UpdateBudgetUsageRow {
  readonly marketplaceCode: string;
  readonly usageDate: string; // YYYY-MM-DD
  readonly consumed: number;
  readonly allowance: number;
}

/** Incremented on confirmed submission (doc 05 §6, doc 03 §8) — an atomic upsert-and-add. */
export async function incrementBudgetUsage(
  appDb: AppDatabase,
  marketplaceCode: string,
  usageDate: string,
  allowance: number,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(sqliteSchema.updateBudgetUsage)
        .values({ marketplaceCode, usageDate, consumed: 1, allowance })
        .onConflictDoUpdate({
          target: [sqliteSchema.updateBudgetUsage.marketplaceCode, sqliteSchema.updateBudgetUsage.usageDate],
          set: { consumed: sql`${sqliteSchema.updateBudgetUsage.consumed} + 1` },
        }),
    postgres: (db) =>
      db
        .insert(postgresSchema.updateBudgetUsage)
        .values({ marketplaceCode, usageDate, consumed: 1, allowance })
        .onConflictDoUpdate({
          target: [
            postgresSchema.updateBudgetUsage.marketplaceCode,
            postgresSchema.updateBudgetUsage.usageDate,
          ],
          set: { consumed: sql`${postgresSchema.updateBudgetUsage.consumed} + 1` },
        }),
    mysql: (db) =>
      db
        .insert(mysqlSchema.updateBudgetUsage)
        .values({ marketplaceCode, usageDate, consumed: 1, allowance })
        .onDuplicateKeyUpdate({ set: { consumed: sql`${mysqlSchema.updateBudgetUsage.consumed} + 1` } }),
  });
}

/**
 * `ResetBudget` (doc 07 §5): insert-if-absent today's row with `consumed: 0` and the
 * day's computed allowance. A no-op if the row already exists — a re-run mid-day must
 * never zero out budget already consumed, and the allowance snapshot for the day is set
 * once, at the first reset, not silently rewritten by a later run.
 */
export async function ensureBudgetUsageRow(
  appDb: AppDatabase,
  marketplaceCode: string,
  usageDate: string,
  allowance: number,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(sqliteSchema.updateBudgetUsage)
        .values({ marketplaceCode, usageDate, consumed: 0, allowance })
        .onConflictDoNothing(),
    postgres: (db) =>
      db
        .insert(postgresSchema.updateBudgetUsage)
        .values({ marketplaceCode, usageDate, consumed: 0, allowance })
        .onConflictDoNothing(),
    mysql: (db) =>
      db
        .insert(mysqlSchema.updateBudgetUsage)
        .values({ marketplaceCode, usageDate, consumed: 0, allowance })
        .onDuplicateKeyUpdate({ set: { marketplaceCode } }),
  });
}

export async function getBudgetUsage(
  appDb: AppDatabase,
  marketplaceCode: string,
  usageDate: string,
): Promise<UpdateBudgetUsageRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.updateBudgetUsage)
          .where(
            and(
              eq(sqliteSchema.updateBudgetUsage.marketplaceCode, marketplaceCode),
              eq(sqliteSchema.updateBudgetUsage.usageDate, usageDate),
            ),
          )
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.updateBudgetUsage)
          .where(
            and(
              eq(postgresSchema.updateBudgetUsage.marketplaceCode, marketplaceCode),
              eq(postgresSchema.updateBudgetUsage.usageDate, usageDate),
            ),
          )
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.updateBudgetUsage)
          .where(
            and(
              eq(mysqlSchema.updateBudgetUsage.marketplaceCode, marketplaceCode),
              eq(mysqlSchema.updateBudgetUsage.usageDate, usageDate),
            ),
          )
      )[0],
  });
}
