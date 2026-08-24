import path from 'node:path';

export type Dialect = 'sqlite' | 'postgres' | 'mysql';

/** Infers the dialect from a `DATABASE_URL`-style connection string's scheme. */
export function inferDialect(databaseUrl: string): Dialect {
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    return 'postgres';
  }
  if (databaseUrl.startsWith('mysql://')) {
    return 'mysql';
  }
  if (databaseUrl.startsWith('sqlite://') || databaseUrl.startsWith('file:') || databaseUrl === ':memory:') {
    return 'sqlite';
  }
  throw new RangeError(`Cannot infer database dialect from URL: "${databaseUrl}"`);
}

/**
 * The directory a *relative* SQLite path is resolved against — `BUYBOX_DATA_DIR` when the
 * deployment sets one (the Windows service does, doc 14 §4.1), else the working directory.
 *
 * This exists because `process.cwd()` alone is not a stable anchor in the packaged install, and
 * a relative `DATABASE_URL` resolved at two different moments produced two different databases
 * on a real install (2026-08-24). Next's generated `server.js` calls `process.chdir(__dirname)`
 * while it boots, so the embedded worker — started from the instrumentation hook, during that
 * window — resolved the same string differently from every later web request, which runs after
 * `boot.mjs` has put the working directory back. The web wrote jobs to one file and the worker
 * polled the other, each of them healthy, forever. Anchoring on an explicit directory makes the
 * resolution independent of *when* the connection happens to be opened.
 */
export function appDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.BUYBOX_DATA_DIR;
  return configured && configured.trim() !== '' ? configured : process.cwd();
}

/**
 * Strips a `sqlite://` / `file:` prefix down to the bare filesystem path better-sqlite3 expects,
 * and makes a relative one absolute against `appDataDir()` (see above for why that matters).
 *
 * Absolute paths pass through untouched, which is what every deployment should be using — the
 * setup wizard and the installer both write absolute paths. Relative ones are still accepted
 * because a developer checkout uses them, and there the working directory *is* the stable anchor.
 */
export function sqliteFilePath(databaseUrl: string, dataDir: string = appDataDir()): string {
  if (databaseUrl === ':memory:') return ':memory:';
  const bare = databaseUrl.replace(/^sqlite:\/\//, '').replace(/^file:/, '');
  if (bare === ':memory:' || bare === '') return ':memory:';
  return path.isAbsolute(bare) ? path.normalize(bare) : path.resolve(dataDir, bare);
}

/** True for a SQLite URL whose path is relative — the shape that caused the split above. */
export function isRelativeSqlitePath(databaseUrl: string): boolean {
  let dialect: Dialect;
  try {
    dialect = inferDialect(databaseUrl);
  } catch {
    // Unclassifiable: not this guard's question. Whoever opens the connection reports the error.
    return false;
  }
  if (dialect !== 'sqlite') return false;
  const bare = databaseUrl.replace(/^sqlite:\/\//, '').replace(/^file:/, '');
  if (bare === ':memory:' || bare === '') return false;
  return !path.isAbsolute(bare);
}
