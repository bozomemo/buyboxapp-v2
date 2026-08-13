/**
 * `circuit_breaker_state` (doc 07 §3, doc 12 6.9) — per-marketplace circuit breaker state,
 * DB-backed so it is visible and resettable from `apps/web` even though the outbound calls
 * it guards happen in the separate `apps/worker` process. Mirrors `CircuitBreaker`
 * (packages/adapters)'s pure state machine exactly (closed → open on `failureThreshold`
 * consecutive failures, open → half-open after `openDurationMs`, half-open → open on the
 * next failure or closed on success) but as row updates instead of in-memory transitions.
 */
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerRow {
  readonly marketplaceCode: string;
  readonly state: CircuitState;
  readonly consecutiveFailures: number;
  readonly openedAt: number | null;
  readonly lastError: string | null;
  readonly updatedAt: number;
}

export async function getCircuitBreakerState(
  appDb: AppDatabase,
  marketplaceCode: string,
): Promise<CircuitBreakerRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.circuitBreakerState)
          .where(eq(sqliteSchema.circuitBreakerState.marketplaceCode, marketplaceCode))
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.circuitBreakerState)
          .where(eq(postgresSchema.circuitBreakerState.marketplaceCode, marketplaceCode))
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.circuitBreakerState)
          .where(eq(mysqlSchema.circuitBreakerState.marketplaceCode, marketplaceCode))
      )[0],
  }) as Promise<CircuitBreakerRow | undefined>;
}

/** All marketplaces with any recorded state — the Jobs screen's circuit-breaker panel (doc 07 §3). */
export async function listCircuitBreakerStates(appDb: AppDatabase): Promise<CircuitBreakerRow[]> {
  return withDialect(appDb, {
    sqlite: (db) => db.select().from(sqliteSchema.circuitBreakerState),
    postgres: (db) => db.select().from(postgresSchema.circuitBreakerState),
    mysql: (db) => db.select().from(mysqlSchema.circuitBreakerState),
  }) as Promise<CircuitBreakerRow[]>;
}

async function upsert(appDb: AppDatabase, row: CircuitBreakerRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(sqliteSchema.circuitBreakerState)
        .values(row)
        .onConflictDoUpdate({
          target: sqliteSchema.circuitBreakerState.marketplaceCode,
          set: {
            state: row.state,
            consecutiveFailures: row.consecutiveFailures,
            openedAt: row.openedAt,
            lastError: row.lastError,
            updatedAt: row.updatedAt,
          },
        }),
    postgres: (db) =>
      db
        .insert(postgresSchema.circuitBreakerState)
        .values(row)
        .onConflictDoUpdate({
          target: postgresSchema.circuitBreakerState.marketplaceCode,
          set: {
            state: row.state,
            consecutiveFailures: row.consecutiveFailures,
            openedAt: row.openedAt,
            lastError: row.lastError,
            updatedAt: row.updatedAt,
          },
        }),
    mysql: (db) =>
      db
        .insert(mysqlSchema.circuitBreakerState)
        .values(row)
        .onDuplicateKeyUpdate({
          set: {
            state: row.state,
            consecutiveFailures: row.consecutiveFailures,
            openedAt: row.openedAt,
            lastError: row.lastError,
            updatedAt: row.updatedAt,
          },
        }),
  });
}

/**
 * Whether an outbound call to this marketplace may proceed right now (doc 07 §3: "stop
 * outbound calls" while open). A missing row (never tripped) or `closed` always proceeds.
 * `open` transitions itself to `half-open` and allows one trial once `openDurationMs` has
 * elapsed since it opened — the same self-healing transition `CircuitBreaker.canProceed`
 * makes, just persisted so it survives a worker restart.
 */
export async function canProceed(
  appDb: AppDatabase,
  marketplaceCode: string,
  nowMs: number,
  openDurationMs: number,
): Promise<boolean> {
  const row = await getCircuitBreakerState(appDb, marketplaceCode);
  if (!row || row.state !== 'open') return true;
  if (row.openedAt !== null && nowMs - row.openedAt >= openDurationMs) {
    await upsert(appDb, { ...row, state: 'half-open', updatedAt: nowMs });
    return true;
  }
  return false;
}

/** A successful outbound call: closes the circuit and clears the failure count. */
export async function recordSuccess(
  appDb: AppDatabase,
  marketplaceCode: string,
  nowMs: number,
): Promise<void> {
  await upsert(appDb, {
    marketplaceCode,
    state: 'closed',
    consecutiveFailures: 0,
    openedAt: null,
    lastError: null,
    updatedAt: nowMs,
  });
}

/**
 * A failed (transport-level) outbound call. Opens the circuit immediately if it was
 * half-open (the trial failed) or once `failureThreshold` consecutive failures have
 * accumulated while closed — otherwise just increments the counter.
 */
export async function recordFailure(
  appDb: AppDatabase,
  marketplaceCode: string,
  nowMs: number,
  error: string,
  failureThreshold: number,
): Promise<void> {
  const existing = await getCircuitBreakerState(appDb, marketplaceCode);
  const consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;
  const opens = existing?.state === 'half-open' || consecutiveFailures >= failureThreshold;
  await upsert(appDb, {
    marketplaceCode,
    state: opens ? 'open' : 'closed',
    consecutiveFailures,
    openedAt: opens ? nowMs : null,
    lastError: error,
    updatedAt: nowMs,
  });
}

/**
 * Manual reset (doc 12 6.9 DoD: "circuit-breaker reset work") — an operator's deliberate
 * override, back to `closed` regardless of current state. Distinct from the automatic
 * open→half-open transition in `canProceed`.
 */
export async function resetCircuitBreaker(
  appDb: AppDatabase,
  marketplaceCode: string,
  nowMs: number,
): Promise<void> {
  await upsert(appDb, {
    marketplaceCode,
    state: 'closed',
    consecutiveFailures: 0,
    openedAt: null,
    lastError: null,
    updatedAt: nowMs,
  });
}
