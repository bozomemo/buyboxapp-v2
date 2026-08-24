import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configRepo, createDb, runMigrations } from '@buybox/db';
import { FileSecretStore, marketplaceCredentialsKey } from '@buybox/shared';
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

  /**
   * The failure this guards against shipped and was measured on a clean 0.1.2 install
   * (2026-08-24): the worker boots before the operator has entered any credentials — always, on
   * a fresh install — and used to hold its empty adapter registry for the life of the process.
   * Every `ImportListings` then failed with `No marketplace adapter registered for "trendyol"`
   * and every `ScrapeCompetitors` with `no competitor source registered`, until somebody
   * restarted the service, with nothing on any screen saying so.
   */
  it('picks up a marketplace configured after boot, without a restart', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'buybox-worker-test-'));
    const dbFile = path.join(dir, 'test.db');
    const secretsPath = path.join(dir, 'secrets.enc.json');
    const appDb = createDb(`file:${dbFile}`, 'sqlite');
    await runMigrations(appDb);

    // Enabled before `startWorker` so the reload interval it creates is a fake one. The shortest
    // real job cadence is 30s, so advancing 11s below fires the reload check and nothing else.
    vi.useFakeTimers();
    try {
      const handle = await startWorker({
        appDb,
        env: {
          DATABASE_URL: `file:${dbFile}`,
          SECRET_STORE_KEY: 'test-key',
          SECRET_STORE_PATH: secretsPath,
        },
      });

      expect(handle.adapters.size).toBe(0);

      // The operator finishes the setup wizard: the marketplace row and its credentials appear,
      // exactly as `setup/marketplace/save` writes them.
      const nowMs = Date.now();
      await configRepo.upsertMarketplace(appDb, {
        code: 'trendyol',
        displayName: 'Trendyol',
        enabled: true,
        merchantRef: '722974',
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await new FileSecretStore(secretsPath, 'test-key').set(
        marketplaceCredentialsKey('trendyol'),
        JSON.stringify({ apiKey: 'k', apiSecret: 's', sellerId: '722974' }),
      );

      // Several reload intervals, not one: the check deliberately defers while any job is in
      // flight, and the boot-time catch-up leaves one running through the first pass.
      await vi.advanceTimersByTimeAsync(60_000);

      expect(handle.adapters.has('trendyol')).toBe(true);
      expect(handle.competitorSources.has('trendyol')).toBe(true);

      await handle.shutdown();
    } finally {
      vi.useRealTimers();
    }
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
