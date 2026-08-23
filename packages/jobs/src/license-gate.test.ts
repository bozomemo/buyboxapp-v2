/**
 * doc 13 §8: R-LIC-1 (an unlicensed install runs nothing), R-LIC-4 (a lapsed one stops) and
 * R-LIC-5 (pasting a renewal restores it within one tick, with no restart), plus the
 * environment-over-database resolution order of doc 13 §3.
 *
 * These are the only tests in this package that must *not* inherit the throwaway licence
 * `test-helpers.ts` installs into `process.env`, so each one sets the environment it needs and
 * restores it afterwards.
 */
import { generateKeyPairSync } from 'node:crypto';
import { configRepo, newId } from '@buybox/db';
import { LICENSE_TOKEN_SETTING_KEY, signLicense } from '@buybox/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from './clock.js';
import type { JobDefinition } from './job.js';
import { getLicenseStatus } from './license-gate.js';
import { Scheduler } from './scheduler.js';
import { createSqliteTestDb } from './test-helpers.js';

const vendor = generateKeyPairSync('ed25519');
const publicKeyPem = vendor.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privateKeyPem = vendor.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const NOW = Date.parse('2026-08-23T12:00:00.000Z');

function licenseFor(expiresAt: string): string {
  return signLicense(
    {
      v: 1,
      id: 'LIC-GATE',
      customer: 'Örnek Ticaret A.Ş.',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt,
      edition: 'standard',
    },
    privateKeyPem,
  );
}

let savedToken: string | undefined;
let savedKey: string | undefined;

beforeEach(() => {
  savedToken = process.env.LICENSE_TOKEN;
  savedKey = process.env.LICENSE_PUBLIC_KEY_PEM;
  delete process.env.LICENSE_TOKEN;
  process.env.LICENSE_PUBLIC_KEY_PEM = publicKeyPem;
});

afterEach(() => {
  if (savedToken === undefined) delete process.env.LICENSE_TOKEN;
  else process.env.LICENSE_TOKEN = savedToken;
  if (savedKey === undefined) delete process.env.LICENSE_PUBLIC_KEY_PEM;
  else process.env.LICENSE_PUBLIC_KEY_PEM = savedKey;
});

const emptyAdapters = new Map();

/** A cadenced job, so an unlicensed tick has something it would visibly have enqueued. */
const cadencedJob: JobDefinition = {
  jobName: 'TestCadenced',
  cadenceMs: 1000,
  async handler() {
    return { ok: true };
  },
} as unknown as JobDefinition;

async function storeToken(appDb: Parameters<typeof getLicenseStatus>[0], token: string): Promise<void> {
  await configRepo.setAppSetting(
    appDb,
    { key: LICENSE_TOKEN_SETTING_KEY, value: token, updatedBy: 'test', updatedAt: NOW },
    newId(),
  );
}

describe('licence gate — resolution (doc 13 §3)', () => {
  it('reads the stored row when no environment variable is set', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await storeToken(appDb, licenseFor('2027-01-01T00:00:00.000Z'));
      expect((await getLicenseStatus(appDb, { nowMs: NOW })).state).toBe('valid');
    } finally {
      cleanup();
    }
  });

  it('prefers the environment variable over the stored row', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await storeToken(appDb, licenseFor('2020-01-01T00:00:00.000Z')); // long expired
      process.env.LICENSE_TOKEN = licenseFor('2027-01-01T00:00:00.000Z');
      expect((await getLicenseStatus(appDb, { nowMs: NOW })).state).toBe('valid');
    } finally {
      cleanup();
    }
  });

  it('is `missing` on an install that was never licensed', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      expect(await getLicenseStatus(appDb, { nowMs: NOW })).toEqual({ state: 'missing' });
    } finally {
      cleanup();
    }
  });

  it('does not seed a clock high-water mark from an unlicensed install', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await getLicenseStatus(appDb, { nowMs: NOW });
      expect(await configRepo.getAppSetting(appDb, 'license.lastSeenAt')).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('records the clock high-water mark once a licence verifies (doc 13 §4.3)', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await storeToken(appDb, licenseFor('2027-01-01T00:00:00.000Z'));
      await getLicenseStatus(appDb, { nowMs: NOW });
      expect(await configRepo.getAppSetting(appDb, 'license.lastSeenAt')).toMatchObject({
        value: String(NOW),
      });
    } finally {
      cleanup();
    }
  });
});

describe('Scheduler — licence enforcement (doc 13 §6)', () => {
  it('an unlicensed install enqueues nothing and runs nothing (R-LIC-1)', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const scheduler = new Scheduler({
        appDb,
        clock: new FakeClock(NOW),
        adapters: emptyAdapters,
        instanceId: 'a',
      });
      scheduler.register(cadencedJob);

      const result = await scheduler.tick();

      expect(result.heldLock).toBe(true);
      expect(result.unlicensed).toBe(true);
      // Distinct from the pause, so the operator is told to renew rather than to un-pause.
      expect(result.paused).toBe(false);
      expect(result.enqueued).toEqual([]);
      expect(result.ran).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('a licence lapsed past its grace window stops the system (R-LIC-4)', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await storeToken(appDb, licenseFor('2026-01-01T00:00:00.000Z'));
      const scheduler = new Scheduler({
        appDb,
        clock: new FakeClock(NOW),
        adapters: emptyAdapters,
        instanceId: 'a',
      });
      scheduler.register(cadencedJob);

      expect((await scheduler.tick()).unlicensed).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('a licence inside its grace window still runs (R-LIC-3)', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      // Expired yesterday: past `expiresAt`, well inside the seven-day grace window.
      await storeToken(appDb, licenseFor('2026-08-22T12:00:00.000Z'));
      const scheduler = new Scheduler({
        appDb,
        clock: new FakeClock(NOW),
        adapters: emptyAdapters,
        instanceId: 'a',
      });
      scheduler.register(cadencedJob);

      const result = await scheduler.tick();
      expect(result.unlicensed).toBe(false);
      expect(result.enqueued).toEqual(['TestCadenced']);
    } finally {
      cleanup();
    }
  });

  it('pasting a valid licence restores the system on the next tick, with no restart (R-LIC-5)', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const scheduler = new Scheduler({
        appDb,
        clock: new FakeClock(NOW),
        adapters: emptyAdapters,
        instanceId: 'a',
      });
      scheduler.register(cadencedJob);

      expect((await scheduler.tick()).unlicensed).toBe(true);

      // The same long-lived Scheduler instance — nothing is restarted, re-registered or rebuilt.
      await storeToken(appDb, licenseFor('2027-01-01T00:00:00.000Z'));

      const after = await scheduler.tick();
      expect(after.unlicensed).toBe(false);
      expect(after.enqueued).toEqual(['TestCadenced']);
    } finally {
      cleanup();
    }
  });
});
