/**
 * Migration runner and boot-time schema version check (doc 12 Phase 3.5, doc 05 §1:
 * "On boot the app compares schema version and refuses to start on mismatch, offering to
 * migrate."). Migrations are Drizzle Kit's forward-only SQL files, one folder per
 * dialect; running the same folder twice is a no-op (Drizzle records applied migrations
 * by content hash and skips anything already applied).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator';
import { migrate as migrateMysql } from 'drizzle-orm/mysql2/migrator';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from './client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Default migrations folder for a dialect, relative to the package root. */
export function defaultMigrationsFolder(dialect: AppDatabase['dialect']): string {
  return path.join(HERE, '..', 'migrations', dialect);
}

export async function runMigrations(appDb: AppDatabase, migrationsFolder?: string): Promise<void> {
  const folder = migrationsFolder ?? defaultMigrationsFolder(appDb.dialect);
  if (appDb.dialect === 'sqlite') {
    migrateSqlite(appDb.db, { migrationsFolder: folder });
  } else if (appDb.dialect === 'postgres') {
    await migratePostgres(appDb.db, { migrationsFolder: folder });
  } else {
    await migrateMysql(appDb.db, { migrationsFolder: folder });
  }
}

interface Journal {
  entries: { idx: number; tag: string }[];
}

function readJournal(migrationsFolder: string): Journal {
  const raw = readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8');
  return JSON.parse(raw) as Journal;
}

/**
 * Each driver shapes a raw `execute()` result differently: sqlite's `.get()` returns the
 * row object directly, node-postgres wraps rows in `{ rows: [...] }`, and mysql2 returns
 * a `[rows, fields]` tuple. Normalise all three to "the first row's `count` column."
 */
function extractCount(result: unknown): number {
  let row: Record<string, unknown> | undefined;
  if (Array.isArray(result)) {
    const rows = Array.isArray(result[0]) ? (result[0] as unknown[]) : result;
    row = rows[0] as Record<string, unknown> | undefined;
  } else if (result && typeof result === 'object' && 'rows' in result) {
    row = (result as { rows: unknown[] }).rows[0] as Record<string, unknown> | undefined;
  } else {
    row = result as Record<string, unknown> | undefined;
  }
  const count = row?.count ?? row?.COUNT ?? 0;
  return Number(count);
}

async function countAppliedMigrations(appDb: AppDatabase): Promise<number> {
  try {
    if (appDb.dialect === 'sqlite') {
      const result = appDb.db.get(sql`select count(*) as count from \`__drizzle_migrations\``);
      return extractCount(result);
    }
    if (appDb.dialect === 'postgres') {
      const result = await appDb.db.execute(
        sql`select count(*) as count from "drizzle"."__drizzle_migrations"`,
      );
      return extractCount(result);
    }
    const result = await appDb.db.execute(sql`select count(*) as count from \`__drizzle_migrations\``);
    return extractCount(result);
  } catch {
    // No migrations table yet — an unmigrated, fresh database.
    return 0;
  }
}

export interface SchemaVersionStatus {
  readonly upToDate: boolean;
  readonly appliedCount: number;
  readonly expectedCount: number;
}

/**
 * Boot-time check: does the database's applied-migration count match what this build of
 * the app expects? A mismatch means either the database predates this build (needs
 * migrating) or postdates it (the app is stale) — either way, the app must not silently
 * proceed against a schema it doesn't recognise.
 */
export async function checkSchemaVersion(
  appDb: AppDatabase,
  migrationsFolder?: string,
): Promise<SchemaVersionStatus> {
  const folder = migrationsFolder ?? defaultMigrationsFolder(appDb.dialect);
  const expectedCount = readJournal(folder).entries.length;
  const appliedCount = await countAppliedMigrations(appDb);
  return { upToDate: appliedCount === expectedCount, appliedCount, expectedCount };
}
