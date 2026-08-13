/**
 * The dialect-aware dispatch helper (doc 12 Phase 3.4). SQLite and PostgreSQL upsert via
 * `ON CONFLICT ... DO UPDATE`; MySQL has no equivalent syntax and upserts via
 * `ON DUPLICATE KEY UPDATE` instead (doc 05 §1: "Upsert | Repository helper emitting
 * per-dialect syntax | `ON CONFLICT` vs `ON DUPLICATE KEY`"). Repositories that need a
 * dialect-specific query (upserts, and the `job_queue` claim-by-update pattern in
 * doc 10 §1.2, which genuinely differs in strategy per engine) branch through this
 * function rather than duplicating the `if (appDb.dialect === ...)` chain everywhere.
 *
 * Each branch is fully typed against its own dialect's real schema and Drizzle query
 * builder — there is no shared generic column-mapping layer here, and so no loss of type
 * safety, only a shared dispatch shape so "same input produces the same result on all
 * three engines" is a property callers can see enforced at the call site.
 */
import type { AppDatabase } from './client.js';

export type SqliteDb = Extract<AppDatabase, { dialect: 'sqlite' }>['db'];
export type PostgresDb = Extract<AppDatabase, { dialect: 'postgres' }>['db'];
export type MysqlDb = Extract<AppDatabase, { dialect: 'mysql' }>['db'];

export interface DialectBranches<T> {
  sqlite(db: SqliteDb): T | Promise<T>;
  postgres(db: PostgresDb): T | Promise<T>;
  mysql(db: MysqlDb): T | Promise<T>;
}

export async function withDialect<T>(appDb: AppDatabase, branches: DialectBranches<T>): Promise<T> {
  if (appDb.dialect === 'sqlite') return branches.sqlite(appDb.db);
  if (appDb.dialect === 'postgres') return branches.postgres(appDb.db);
  return branches.mysql(appDb.db);
}

/**
 * Fire-and-forget variant of `withDialect` for writes (insert/update/delete) whose
 * result the caller doesn't need. Each dialect's Drizzle query builder resolves to a
 * different, dialect-specific result type (`RunResult` vs a `QueryResult` vs a
 * `ResultSetHeader`), which `withDialect`'s single shared `T` cannot unify across all
 * three branches — that mismatch is a TypeScript artefact of the driver types, not a
 * real behavioural difference, so branches here return `unknown` and are simply awaited.
 */
export async function runDialect(
  appDb: AppDatabase,
  branches: { sqlite(db: SqliteDb): unknown; postgres(db: PostgresDb): unknown; mysql(db: MysqlDb): unknown },
): Promise<void> {
  if (appDb.dialect === 'sqlite') {
    await branches.sqlite(appDb.db);
    return;
  }
  if (appDb.dialect === 'postgres') {
    await branches.postgres(appDb.db);
    return;
  }
  await branches.mysql(appDb.db);
}
