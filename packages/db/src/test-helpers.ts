/**
 * Test-only helpers: a fresh, migrated, isolated database per test file for each of the
 * three dialects. Not part of the package's public API (not exported from index.ts).
 *
 * Postgres/MySQL need a running server — see `docker-compose.test.yml`. Point at a
 * different one with `POSTGRES_ADMIN_URL` / `MYSQL_ADMIN_URL` if needed.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { Client } from 'pg';
import { createDb, type AppDatabase, type Dialect } from './client.js';
import { runMigrations } from './migrate.js';

const POSTGRES_ADMIN_URL =
  process.env.POSTGRES_ADMIN_URL ?? 'postgres://postgres:test@localhost:55432/postgres';
const MYSQL_ADMIN_URL = process.env.MYSQL_ADMIN_URL ?? 'mysql://root:test@localhost:53306/';

export interface TestDb {
  readonly appDb: AppDatabase;
  cleanup(): Promise<void>;
}

export async function createTestDb(dialect: Dialect): Promise<TestDb> {
  if (dialect === 'sqlite') {
    const dir = mkdtempSync(path.join(tmpdir(), 'buybox-db-test-'));
    const file = path.join(dir, 'test.db');
    const appDb = createDb(`file:${file}`, 'sqlite');
    await runMigrations(appDb);
    return {
      appDb,
      cleanup: async () => {
        appDb.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }

  if (dialect === 'postgres') {
    const dbName = `buybox_test_${randomUUID().replace(/-/g, '')}`;
    const admin = new Client({ connectionString: POSTGRES_ADMIN_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    await admin.end();

    const url = new URL(POSTGRES_ADMIN_URL);
    url.pathname = `/${dbName}`;
    const appDb = createDb(url.toString(), 'postgres');
    await runMigrations(appDb);
    return {
      appDb,
      cleanup: async () => {
        await appDb.close();
        const dropAdmin = new Client({ connectionString: POSTGRES_ADMIN_URL });
        await dropAdmin.connect();
        await dropAdmin.query(`DROP DATABASE IF EXISTS ${dbName}`);
        await dropAdmin.end();
      },
    };
  }

  const dbName = `buybox_test_${randomUUID().replace(/-/g, '')}`;
  const admin = await mysql.createConnection(MYSQL_ADMIN_URL);
  await admin.query(`CREATE DATABASE \`${dbName}\``);
  await admin.end();

  const url = new URL(MYSQL_ADMIN_URL);
  url.pathname = `/${dbName}`;
  const appDb = createDb(url.toString(), 'mysql');
  await runMigrations(appDb);
  return {
    appDb,
    cleanup: async () => {
      await appDb.close();
      const dropAdmin = await mysql.createConnection(MYSQL_ADMIN_URL);
      await dropAdmin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
      await dropAdmin.end();
    },
  };
}

/** The three dialects under test — iterate this in every integration test file. */
export const ALL_DIALECTS: readonly Dialect[] = ['sqlite', 'postgres', 'mysql'];
