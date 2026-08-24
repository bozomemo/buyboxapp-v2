/**
 * Migration runner and boot-time schema version check (doc 12 Phase 3.5, doc 05 §1:
 * "On boot the app compares schema version and refuses to start on mismatch, offering to
 * migrate."). Migrations are Drizzle Kit's forward-only SQL files, one folder per
 * dialect; running the same folder twice is a no-op (Drizzle records applied migrations
 * by content hash and skips anything already applied).
 */
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator';
import { migrate as migrateMysql } from 'drizzle-orm/mysql2/migrator';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from './client.js';
import { sqliteFilePath } from './dialect.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Default migrations folder for a dialect.
 *
 * `BUYBOX_MIGRATIONS_DIR` first, because the relative resolution below cannot survive bundling.
 * `@buybox/db` is in `transpilePackages`, so in a Next build this module ends up inside a bundle
 * chunk and `import.meta.url` points at the chunk, not at the package -- which made the packaged
 * app look for migrations at a path that has never existed on any machine. Found on a real
 * install, 2026-08-24 (doc 14 section 8.2); the packaged app sets the variable, a checkout does
 * not and keeps resolving relative to the package as before.
 */
export function defaultMigrationsFolder(dialect: AppDatabase['dialect']): string {
  const override = process.env.BUYBOX_MIGRATIONS_DIR;
  if (override) return path.join(override, dialect);
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

/**
 * Which way the database and this build disagree. `upToDate` alone cannot express this, and the
 * distinction is load-bearing once migrations run automatically (doc 14 §5.2a): `behind` is
 * migrated forward, `ahead` must refuse — it means an older app was pointed at a newer
 * database, and applying this build's DDL to a schema it does not know corrupts it.
 */
export type SchemaDrift = 'up-to-date' | 'behind' | 'ahead';

export interface SchemaVersionStatus {
  readonly upToDate: boolean;
  readonly drift: SchemaDrift;
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
  const drift: SchemaDrift =
    appliedCount === expectedCount ? 'up-to-date' : appliedCount < expectedCount ? 'behind' : 'ahead';
  return { upToDate: drift === 'up-to-date', drift, appliedCount, expectedCount };
}

// ---------------------------------------------------------------------------
// Automatic migration at boot (doc 14 §5.2)
// ---------------------------------------------------------------------------

/**
 * Where a packaged install keeps the files this module writes: the SQLite database's own
 * directory when there is one, otherwise the process working directory — which, in the
 * installed layout, is the data directory either way (doc 14 §4.1).
 */
function dataDirFor(appDb: AppDatabase, databaseUrl: string): string {
  if (appDb.dialect === 'sqlite') {
    const filePath = sqliteFilePath(databaseUrl);
    if (filePath !== ':memory:') return path.dirname(path.resolve(filePath));
  }
  return process.cwd();
}

/** A lock older than this is treated as abandoned by a crashed process, not as held. */
const MIGRATE_LOCK_STALE_MS = 15 * 60 * 1000;

/**
 * Serialises migration between processes on one machine.
 *
 * Deliberately **not** `acquireOrRenewSchedulerLock`: that lock is a row in `job_queue`, a table
 * that does not exist until the very migrations this guards have run. A lock that needs the
 * schema cannot protect the creation of the schema.
 *
 * A lock file covers the shipped deployment, where every process is on the same machine as the
 * SQLite file. It does **not** serialise two hosts sharing one PostgreSQL or MySQL server; there
 * the engine is the backstop, and it is a weaker one on MySQL, whose DDL is not transactional.
 * Those installs are operator-administered and are told to stop one host before upgrading.
 */
function acquireMigrateLock(dir: string): () => void {
  const lockPath = path.join(dir, '.migrate.lock');
  mkdirSync(dir, { recursive: true });
  try {
    closeSync(openSync(lockPath, 'wx'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const ageMs = Date.now() - statSync(lockPath).mtimeMs;
    if (ageMs < MIGRATE_LOCK_STALE_MS) {
      throw new Error(
        `Another process is migrating this database (${lockPath}, held for ${Math.round(ageMs / 1000)}s). ` +
          `Wait for it to finish, or delete that file if no migration is running.`,
      );
    }
    // Older than the staleness window: the holder died mid-migration. Take it over rather than
    // leaving the install permanently unable to start.
    rmSync(lockPath, { force: true });
    closeSync(openSync(lockPath, 'wx'));
  }
  return () => rmSync(lockPath, { force: true });
}

/**
 * Copies the SQLite database aside before any DDL touches it (doc 14 §5.2b). Migrations are
 * forward-only and have no `down`, so this copy is the only thing standing between a bad
 * migration and an unrecoverable loss of the operator's pricing history.
 *
 * Returns `undefined` for a database this cannot back up — an in-memory SQLite, or a
 * PostgreSQL/MySQL server whose credentials and dump tooling we do not have. That is reported
 * by the caller rather than passed over in silence.
 */
export function backupSqliteDatabase(
  appDb: AppDatabase,
  databaseUrl: string,
  options: { readonly version?: string; readonly keep?: number } = {},
): string | undefined {
  if (appDb.dialect !== 'sqlite') return undefined;
  const filePath = sqliteFilePath(databaseUrl);
  if (filePath === ':memory:' || !existsSync(filePath)) return undefined;

  const backupsDir = path.join(dataDirFor(appDb, databaseUrl), 'backups');
  mkdirSync(backupsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.basename(filePath, path.extname(filePath));
  const suffix = options.version ? `${options.version}-${stamp}` : stamp;
  const target = path.join(backupsDir, `${base}-${suffix}.db`);
  copyFileSync(filePath, target);

  pruneBackups(backupsDir, base, options.keep ?? DEFAULT_BACKUPS_KEPT);
  return target;
}

const DEFAULT_BACKUPS_KEPT = 5;

function pruneBackups(backupsDir: string, base: string, keep: number): void {
  const mine = readdirSync(backupsDir)
    .filter((name) => name.startsWith(`${base}-`) && name.endsWith('.db'))
    .map((name) => ({ name, mtimeMs: statSync(path.join(backupsDir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const stale of mine.slice(keep)) {
    rmSync(path.join(backupsDir, stale.name), { force: true });
  }
}

export interface AutoMigrateOptions {
  /** The same string `createDb` was given — needed to locate the SQLite file for the backup. */
  readonly databaseUrl: string;
  /** Build version, for the backup filename. Omitted on a checkout that has none. */
  readonly version?: string;
  readonly migrationsFolder?: string;
  readonly keepBackups?: number;
}

export interface AutoMigrateResult {
  readonly migrated: boolean;
  readonly appliedBefore: number;
  readonly appliedAfter: number;
  readonly expected: number;
  /** Absent when this database cannot be backed up — see `backupSqliteDatabase`. */
  readonly backupPath?: string;
}

/**
 * Brings the database up to the schema this build expects, at boot, with no operator present
 * (doc 14 §5.2). Only ever called when `AUTO_MIGRATE=1`, which only a packaged install sets.
 *
 * Every failure path throws. That is the point: a half-migrated schema must never serve traffic
 * (doc 14 §5.2d), so the caller's contract is to let the process die and let the service manager
 * and `/api/health` report why.
 */
export async function autoMigrate(
  appDb: AppDatabase,
  options: AutoMigrateOptions,
): Promise<AutoMigrateResult> {
  const before = await checkSchemaVersion(appDb, options.migrationsFolder);

  if (before.drift === 'up-to-date') {
    return {
      migrated: false,
      appliedBefore: before.appliedCount,
      appliedAfter: before.appliedCount,
      expected: before.expectedCount,
    };
  }

  if (before.drift === 'ahead') {
    throw new Error(
      `Database is ahead of this build: ${before.appliedCount} migrations applied, ` +
        `${before.expectedCount} known. This is an older application opened against a newer ` +
        `database; it will not be migrated. Install the matching or a newer build.`,
    );
  }

  const release = acquireMigrateLock(dataDirFor(appDb, options.databaseUrl));
  try {
    // A database with nothing applied yet holds nothing to lose — `createDb` has just created
    // the file. Backing that up would leave every fresh install with an empty snapshot that
    // looks like a restore point and is not one.
    const backupPath =
      before.appliedCount === 0
        ? undefined
        : backupSqliteDatabase(appDb, options.databaseUrl, {
            version: options.version,
            keep: options.keepBackups,
          });

    await runMigrations(appDb, options.migrationsFolder);

    const after = await checkSchemaVersion(appDb, options.migrationsFolder);
    if (!after.upToDate) {
      throw new Error(
        `Migration finished but the schema is still ${after.drift}: ` +
          `${after.appliedCount} of ${after.expectedCount} applied.`,
      );
    }

    return {
      migrated: true,
      appliedBefore: before.appliedCount,
      appliedAfter: after.appliedCount,
      expected: after.expectedCount,
      ...(backupPath === undefined ? {} : { backupPath }),
    };
  } finally {
    release();
  }
}
