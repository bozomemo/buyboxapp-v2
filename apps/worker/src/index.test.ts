import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb, runMigrations } from '@buybox/db';
import { startWorker } from './index.js';

describe('startWorker', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('boots against a fresh database with no marketplaces configured, and shuts down cleanly', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'buybox-worker-test-'));
    const dbFile = path.join(dir, 'test.db');
    const appDb = createDb(`file:${dbFile}`, 'sqlite');
    await runMigrations(appDb);

    const handle = await startWorker({
      appDb,
      env: {
        DATABASE_URL: `file:${dbFile}`,
        SECRET_STORE_KEY: 'test-key',
        SECRET_STORE_PATH: path.join(dir, 'secrets.enc.json'),
      },
    });

    expect(handle.adapters.size).toBe(0); // no marketplace credentials stored yet
    await handle.shutdown();
    appDb.close();
  });

  it('refuses to boot against an unmigrated database rather than silently running DDL', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'buybox-worker-test-'));
    const dbFile = path.join(dir, 'test.db');
    const appDb = createDb(`file:${dbFile}`, 'sqlite');
    // Deliberately not migrated.

    await expect(
      startWorker({
        appDb,
        env: {
          DATABASE_URL: `file:${dbFile}`,
          SECRET_STORE_KEY: 'test-key',
          SECRET_STORE_PATH: path.join(dir, 'secrets.enc.json'),
        },
      }),
    ).rejects.toThrow(/schema version mismatch/i);
    appDb.close();
  });
});
