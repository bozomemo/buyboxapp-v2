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

/** Strips a `sqlite://` / `file:` prefix down to the bare filesystem path better-sqlite3 expects. */
export function sqliteFilePath(databaseUrl: string): string {
  if (databaseUrl === ':memory:') return ':memory:';
  return databaseUrl.replace(/^sqlite:\/\//, '').replace(/^file:/, '');
}
