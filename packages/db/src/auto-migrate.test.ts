/**
 * Doc 14 §5.2 — the four guards on migrating a customer's database with nobody watching.
 *
 * SQLite only, deliberately: it is the engine the packaged install ships with (doc 14 §6), the
 * only one `autoMigrate` can back up, and the only one whose "another process is migrating"
 * case a lock file is claimed to cover. The cross-dialect direction reporting that feeds these
 * guards is covered in `migrate.test.ts`, which runs on all three.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb, type AppDatabase } from './client.js';
import {
  autoMigrate,
  backupSqliteDatabase,
  checkSchemaVersion,
  defaultMigrationsFolder,
  runMigrations,
} from './migrate.js';

let dir: string | undefined;
let appDb: AppDatabase | undefined;

function freshDb(): { appDb: AppDatabase; url: string; dir: string } {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-automigrate-'));
  const file = path.join(dir, 'app.db');
  const url = `file:${file}`;
  appDb = createDb(url, 'sqlite');
  return { appDb, url, dir };
}

/** A migrations folder whose journal claims fewer migrations than the database has applied. */
function shortJournalFolder(entryCount: number): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'buybox-journal-'));
  mkdirSync(path.join(folder, 'meta'), { recursive: true });
  const entries = Array.from({ length: entryCount }, (_, idx) => ({ idx, tag: `fake_${idx}` }));
  writeFileSync(path.join(folder, 'meta', '_journal.json'), JSON.stringify({ entries }), 'utf8');
  return folder;
}

afterEach(() => {
  appDb?.close();
  appDb = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('autoMigrate', () => {
  it('creates the schema on a fresh database and reports what it applied', async () => {
    const db = freshDb();
    const result = await autoMigrate(db.appDb, { databaseUrl: db.url });

    expect(result.migrated).toBe(true);
    expect(result.appliedBefore).toBe(0);
    expect(result.appliedAfter).toBe(result.expected);
    expect((await checkSchemaVersion(db.appDb)).upToDate).toBe(true);
  }, 30_000);

  it('takes no backup of a fresh database — an empty snapshot is not a restore point', async () => {
    const db = freshDb();
    const result = await autoMigrate(db.appDb, { databaseUrl: db.url });

    expect(result.backupPath).toBeUndefined();
    expect(existsSync(path.join(db.dir, 'backups'))).toBe(false);
  }, 30_000);

  it('is a no-op on an already-migrated database', async () => {
    const db = freshDb();
    await runMigrations(db.appDb);

    const result = await autoMigrate(db.appDb, { databaseUrl: db.url });
    expect(result.migrated).toBe(false);
    expect(result.appliedBefore).toBe(result.appliedAfter);
  }, 30_000);

  it('refuses a database ahead of this build instead of migrating it', async () => {
    const db = freshDb();
    await runMigrations(db.appDb);
    const applied = (await checkSchemaVersion(db.appDb)).appliedCount;
    const folder = shortJournalFolder(applied - 1);

    await expect(autoMigrate(db.appDb, { databaseUrl: db.url, migrationsFolder: folder })).rejects.toThrow(
      /ahead of this build/,
    );

    rmSync(folder, { recursive: true, force: true });
  }, 30_000);

  it('leaves no lock file behind, on success or on failure', async () => {
    const db = freshDb();
    await autoMigrate(db.appDb, { databaseUrl: db.url });
    expect(existsSync(path.join(db.dir, '.migrate.lock'))).toBe(false);
  }, 30_000);

  it('refuses to start while another process holds a fresh lock', async () => {
    const db = freshDb();
    writeFileSync(path.join(db.dir, '.migrate.lock'), '', 'utf8');

    await expect(autoMigrate(db.appDb, { databaseUrl: db.url })).rejects.toThrow(
      /Another process is migrating/,
    );
    // The lock it did not take is the lock it must not delete.
    expect(existsSync(path.join(db.dir, '.migrate.lock'))).toBe(true);
  }, 30_000);

  it('takes over a stale lock rather than leaving the install unable to start', async () => {
    const db = freshDb();
    const lockPath = path.join(db.dir, '.migrate.lock');
    writeFileSync(lockPath, '', 'utf8');
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(lockPath, longAgo, longAgo);

    const result = await autoMigrate(db.appDb, { databaseUrl: db.url });
    expect(result.migrated).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  }, 30_000);
});

describe('backupSqliteDatabase', () => {
  it('copies the database aside, naming the build it predates', async () => {
    const db = freshDb();
    await runMigrations(db.appDb);

    const backup = backupSqliteDatabase(db.appDb, db.url, { version: '1.2.3' });
    expect(backup).toBeDefined();
    expect(path.basename(backup!)).toMatch(/^app-1\.2\.3-.*\.db$/);
    expect(existsSync(backup!)).toBe(true);
  }, 30_000);

  it('keeps only the most recent backups', async () => {
    const db = freshDb();
    await runMigrations(db.appDb);

    for (let i = 0; i < 5; i += 1) {
      backupSqliteDatabase(db.appDb, db.url, { version: `v${i}`, keep: 2 });
    }

    const kept = readdirSync(path.join(db.dir, 'backups'));
    expect(kept).toHaveLength(2);
  }, 30_000);

  it('returns undefined for an in-memory database — there is no file to copy', () => {
    const memory = createDb(':memory:', 'sqlite');
    try {
      expect(backupSqliteDatabase(memory, ':memory:')).toBeUndefined();
    } finally {
      memory.close();
    }
  });
});

describe('checkSchemaVersion drift', () => {
  it('reports "behind" before migrating and "up-to-date" after', async () => {
    const db = freshDb();
    expect((await checkSchemaVersion(db.appDb)).drift).toBe('behind');
    await runMigrations(db.appDb, defaultMigrationsFolder('sqlite'));
    expect((await checkSchemaVersion(db.appDb)).drift).toBe('up-to-date');
  }, 30_000);
});
