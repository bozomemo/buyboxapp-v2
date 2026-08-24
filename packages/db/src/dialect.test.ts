/**
 * The rules that keep one `DATABASE_URL` from becoming two databases.
 *
 * On 2026-08-24 a packaged install ran its web half against
 * `C:\ProgramData\BuyBox\data\app.db` and its embedded worker against
 * `C:\ProgramData\BuyBox\app.db`, from the single setting `file:./data/app.db`. Neither half
 * reported a fault: the worker held its scheduler lock and ticked every two seconds against an
 * empty queue while the web wrote jobs nobody would ever claim. The cause was that a relative
 * path is resolved by whoever opens it, whenever they open it — and Next's generated
 * `server.js` calls `process.chdir(__dirname)` during boot, so the two halves opened their
 * connections under different working directories.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appDataDir, inferDialect, isRelativeSqlitePath, sqliteFilePath } from './dialect.js';

const ORIGINAL = process.env.BUYBOX_DATA_DIR;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BUYBOX_DATA_DIR;
  else process.env.BUYBOX_DATA_DIR = ORIGINAL;
});

describe('inferDialect', () => {
  it.each([
    ['file:./data/app.db', 'sqlite'],
    ['sqlite:///var/lib/app.db', 'sqlite'],
    [':memory:', 'sqlite'],
    ['postgres://u:p@h:5432/db', 'postgres'],
    ['postgresql://u:p@h:5432/db', 'postgres'],
    ['mysql://u:p@h:3306/db', 'mysql'],
  ])('%s -> %s', (url, dialect) => {
    expect(inferDialect(url)).toBe(dialect);
  });

  it('refuses a URL it cannot classify rather than guessing', () => {
    expect(() => inferDialect('mongodb://localhost')).toThrow(RangeError);
  });
});

describe('sqliteFilePath', () => {
  it('resolves a relative path against the data directory, not the working directory', () => {
    process.env.BUYBOX_DATA_DIR = path.join(path.sep, 'data', 'buybox');
    expect(sqliteFilePath('file:./data/app.db')).toBe(
      path.resolve(path.join(path.sep, 'data', 'buybox'), 'data/app.db'),
    );
  });

  it('gives the same answer from two different working directories — the 2026-08-24 split', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'buybox-anchor-'));
    const elsewhere = mkdtempSync(path.join(tmpdir(), 'buybox-cwd-'));
    process.env.BUYBOX_DATA_DIR = dataDir;
    const originalCwd = process.cwd();
    try {
      const fromOneCwd = sqliteFilePath('file:./data/app.db');
      // Exactly what `server.js` does to the process while the embedded worker is starting.
      process.chdir(elsewhere);
      const fromAnotherCwd = sqliteFilePath('file:./data/app.db');
      expect(fromAnotherCwd).toBe(fromOneCwd);
      expect(fromOneCwd).toBe(path.resolve(dataDir, 'data/app.db'));
    } finally {
      process.chdir(originalCwd);
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('resolves differently per working directory when nothing anchors it — the old behaviour', () => {
    delete process.env.BUYBOX_DATA_DIR;
    const elsewhere = mkdtempSync(path.join(tmpdir(), 'buybox-cwd-'));
    const originalCwd = process.cwd();
    try {
      const before = sqliteFilePath('file:./data/app.db');
      process.chdir(elsewhere);
      expect(sqliteFilePath('file:./data/app.db')).not.toBe(before);
    } finally {
      process.chdir(originalCwd);
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('falls back to the working directory when no data directory is configured', () => {
    delete process.env.BUYBOX_DATA_DIR;
    expect(sqliteFilePath('file:./data/app.db')).toBe(path.resolve(process.cwd(), 'data/app.db'));
    expect(appDataDir()).toBe(process.cwd());
  });

  it('leaves an absolute path alone', () => {
    process.env.BUYBOX_DATA_DIR = path.join(path.sep, 'somewhere', 'else');
    const absolute = path.join(path.sep, 'var', 'lib', 'buybox', 'app.db');
    expect(sqliteFilePath(`file:${absolute}`)).toBe(path.normalize(absolute));
  });

  it('passes :memory: through in both spellings', () => {
    expect(sqliteFilePath(':memory:')).toBe(':memory:');
    expect(sqliteFilePath('file::memory:')).toBe(':memory:');
  });

  it('accepts an explicit data directory, for callers that do not use the environment', () => {
    const dir = path.join(path.sep, 'explicit');
    expect(sqliteFilePath('file:app.db', dir)).toBe(path.resolve(dir, 'app.db'));
  });
});

describe('isRelativeSqlitePath', () => {
  it('is true only for the shape that split the database', () => {
    expect(isRelativeSqlitePath('file:./data/app.db')).toBe(true);
    expect(isRelativeSqlitePath('file:data/app.db')).toBe(true);
  });

  it('is false for an absolute SQLite path, memory, and every other engine', () => {
    expect(isRelativeSqlitePath(`file:${path.join(path.sep, 'var', 'app.db')}`)).toBe(false);
    expect(isRelativeSqlitePath(':memory:')).toBe(false);
    expect(isRelativeSqlitePath('file::memory:')).toBe(false);
    expect(isRelativeSqlitePath('postgres://u:p@h:5432/db')).toBe(false);
    expect(isRelativeSqlitePath('mysql://u:p@h:3306/db')).toBe(false);
  });

  it('is false for a URL it cannot classify — this guard never decides an unrelated question', () => {
    expect(isRelativeSqlitePath('mongodb://localhost')).toBe(false);
  });
});
