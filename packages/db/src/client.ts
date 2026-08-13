/**
 * Per-dialect Drizzle client construction. `apps/web` and `apps/worker` call `createDb`
 * once at boot with the configured `DATABASE_URL`; every repository takes the resulting
 * `AppDatabase` so it works identically regardless of which of the three engines is live.
 */
import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2';
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import mysql from 'mysql2';
import { Pool } from 'pg';
import { inferDialect, sqliteFilePath, type Dialect } from './dialect.js';
import * as mysqlSchema from './schema/mysql.js';
import * as postgresSchema from './schema/postgres.js';
import * as sqliteSchema from './schema/sqlite.js';

export type AppDatabase =
  | {
      readonly dialect: 'sqlite';
      readonly db: ReturnType<typeof drizzleSqlite<typeof sqliteSchema>>;
      close(): void;
    }
  | {
      readonly dialect: 'postgres';
      readonly db: ReturnType<typeof drizzlePostgres<typeof postgresSchema>>;
      close(): Promise<void>;
    }
  | {
      readonly dialect: 'mysql';
      readonly db: ReturnType<typeof drizzleMysql<typeof mysqlSchema>>;
      close(): Promise<void>;
    };

export function createDb(databaseUrl: string, dialectOverride?: Dialect): AppDatabase {
  const dialect = dialectOverride ?? inferDialect(databaseUrl);

  if (dialect === 'sqlite') {
    const sqlite = new Database(sqliteFilePath(databaseUrl));
    sqlite.pragma('foreign_keys = ON');
    const db = drizzleSqlite(sqlite, { schema: sqliteSchema });
    return { dialect, db, close: () => sqlite.close() };
  }

  if (dialect === 'postgres') {
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzlePostgres(pool, { schema: postgresSchema });
    return { dialect, db, close: () => pool.end() };
  }

  const pool = mysql.createPool(databaseUrl);
  const db = drizzleMysql(pool, { schema: mysqlSchema, mode: 'default' });
  return {
    dialect,
    db,
    close: () => new Promise((resolve, reject) => pool.end((err) => (err ? reject(err) : resolve()))),
  };
}

export { sqliteSchema, postgresSchema, mysqlSchema };
export type { Dialect } from './dialect.js';
