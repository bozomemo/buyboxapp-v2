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
  throw new RangeError(`Cannot infer database dialect from URL: "${redactDatabaseUrl(databaseUrl)}"`);
}

const REDACTED_PASSWORD = '***';

/**
 * A connection string with its password replaced by `***`, for anything a person or a log will
 * read. The user, host, port and database stay, because they are what tells two targets apart.
 *
 * Until 2026-10-15 the worker's database target was the raw `DATABASE_URL`, and it was shown on
 * the dashboard and the Jobs screen, returned by `/api/health` and written to the log — so on a
 * PostgreSQL install every signed-in user, İzleyici included, could read the database password
 * the day the install went on the network.
 *
 * The userinfo is taken up to the *last* `@` before the path, so a password containing an
 * unencoded `@` is still hidden whole. A `password=` query parameter is hidden too.
 */
export function redactDatabaseUrl(databaseUrl: string): string {
  return databaseUrl
    .replace(/^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)@/i, (_match, scheme: string, userinfo: string) => {
      const colon = userinfo.indexOf(':');
      return colon === -1
        ? `${scheme}${userinfo}@`
        : `${scheme}${userinfo.slice(0, colon)}:${REDACTED_PASSWORD}@`;
    })
    .replace(/([?&]password=)[^&#]*/gi, `$1${REDACTED_PASSWORD}`);
}

/**
 * The database a connection string names, in a form two processes can compare and a person can
 * read: the absolute file path for SQLite, the redacted URL (`redactDatabaseUrl`) otherwise.
 *
 * The worker reports this for the database it opened at boot and `/api/health` computes it for
 * the database the configuration names now; a difference between the two is the 2026-08-24
 * split. Two URLs differing only in password therefore compare equal, which is correct — they
 * name the same database.
 */
export function describeDatabaseTarget(databaseUrl: string, dataDir?: string): string {
  try {
    return inferDialect(databaseUrl) === 'sqlite'
      ? sqliteFilePath(databaseUrl, dataDir)
      : redactDatabaseUrl(databaseUrl);
  } catch {
    return redactDatabaseUrl(databaseUrl);
  }
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
