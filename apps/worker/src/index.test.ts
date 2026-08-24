import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configRepo, createDb, jobsRepo, runMigrations } from '@buybox/db';
import { IMPORT_LISTINGS_JOB, jobCadenceSettingKey, REPRICE_JOB } from '@buybox/jobs';
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

  /**
   * The Jobs screen's "next run" column and its pending-restart badge are both derived from this
   * map, so it has to be the cadence the tickers were really built from — not a re-read of
   * `app_settings`, which is exactly the value that can disagree with a running worker.
   */
  it('reports the cadence it actually booted with, including an operator override', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'buybox-worker-test-'));
    const dbFile = path.join(dir, 'test.db');
    const appDb = createDb(`file:${dbFile}`, 'sqlite');
    await runMigrations(appDb);

    // ImportListings defaults to 30 minutes (JOB_CATALOG); override it to 10.
    await configRepo.setAppSetting(
      appDb,
      {
        key: jobCadenceSettingKey(IMPORT_LISTINGS_JOB),
        value: JSON.stringify(10 * 60_000),
        updatedBy: 'test',
        updatedAt: Date.now(),
      },
      'test-setting-id',
    );

    const handle = await startWorker({
      appDb,
      env: {
        DATABASE_URL: `file:${dbFile}`,
        SECRET_STORE_KEY: 'test-key',
        SECRET_STORE_PATH: path.join(dir, 'secrets.enc.json'),
      },
    });

    expect(handle.cadenceMsByJobName.get(IMPORT_LISTINGS_JOB)).toBe(10 * 60_000);
    // An untouched job still reports its catalogue default, not the override above.
    expect(handle.cadenceMsByJobName.get(REPRICE_JOB)).toBe(5 * 60_000);
    // `ImportBundles` has no cadence at all and must not appear as though it had one.
    expect(handle.cadenceMsByJobName.has('ImportBundles')).toBe(false);

    await handle.shutdown();
    appDb.close();
  });

  /**
   * doc 07 §8 "one run at a time", for the tickers that bypass `Scheduler.tick`'s own guard by
   * calling `enqueueNow` directly. Before this, a job slower than its cadence got a fresh queue
   * row on every tick and the backlog grew without bound — newly reachable once cadence became
   * operator-editable (doc 07 §8.1) with a 10 s floor.
   */
  it('does not queue a job behind a copy of itself that is still active', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'buybox-worker-test-'));
    const dbFile = path.join(dir, 'test.db');
    const secretsPath = path.join(dir, 'secrets.enc.json');
    const appDb = createDb(`file:${dbFile}`, 'sqlite');
    await runMigrations(appDb);

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

    // A Trendyol import already running, exactly as a ticker would have enqueued it. The
    // Hepsiburada equivalent is deliberately absent — the guard must not be name-only.
    const trendyolPayload = JSON.stringify({ marketplaceCode: 'trendyol' });
    await jobsRepo.enqueueJob(appDb, {
      id: 'active-import',
      jobName: IMPORT_LISTINGS_JOB,
      payload: trendyolPayload,
      priority: 0,
      state: 'locked',
      runAfter: 0,
      lockedBy: 'someone-else',
      lockedUntil: nowMs + 600_000,
      attempts: 0,
      maxAttempts: 3,
      lastError: null,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    // Fake timers for the same reason the test above uses them: with real ones the scheduler's
    // 2 s loop keeps claiming and running jobs against this database while the assertion and the
    // temp-directory cleanup run. `startWorker` awaits its boot catch-up before returning, so
    // the behaviour under test happens without any timer needing to fire.
    vi.useFakeTimers();
    try {
      // `ImportListings` has never completed, so boot's catch-up considers it due and fires
      // immediately — the exact moment the duplicate used to be created.
      const handle = await startWorker({
        appDb,
        env: {
          DATABASE_URL: `file:${dbFile}`,
          SECRET_STORE_KEY: 'test-key',
          SECRET_STORE_PATH: secretsPath,
        },
      });

      expect(await jobsRepo.countActiveJobsForPayload(appDb, IMPORT_LISTINGS_JOB, trendyolPayload)).toBe(1);
      // A job with no active copy is still enqueued by the same catch-up pass — the guard
      // suppresses duplicates, it does not stop the tickers.
      expect(await jobsRepo.countActiveJobsForPayload(appDb, REPRICE_JOB, JSON.stringify({ marketplaceCode: 'trendyol', mode: 'live' }))).toBe(1);

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
