// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configRepo, createDb, runMigrations, type AppDatabase } from '@buybox/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { POST as saveFees } from './fees/save/route';
import { POST as saveRetention } from './retention/route';

/**
 * Two settings routes that stored whatever they were sent until 2026-09-27, found while testing
 * the route guard: fee settings (which feed the floor price) and retention windows (which a
 * malformed row stopped the nightly prune from enforcing at all).
 */
let dir: string;
let appDb: AppDatabase;
let cookie: string;
const savedEnv = { ...process.env };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-settings-validation-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(appDb);
  cookie = await signIn(appDb, 'admin');
}, 30_000);

afterAll(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

const post = (body: unknown) =>
  withCookie(new Request('http://localhost/api/x', { method: 'POST', body: JSON.stringify(body) }), cookie);

describe('fee settings (feed the floor price)', () => {
  const valid = {
    marketplaceCode: 'TY',
    defaultCommissionRate: 15,
    cargoBands: [{ maxPrice: '150', amount: '42,50' }],
    expenditureBands: [],
  };

  const refused: readonly [string, unknown][] = [
    ['no bands at all', { marketplaceCode: 'TY' }],
    ['a rate missing', { ...valid, defaultCommissionRate: undefined }],
    ['a rate as text', { ...valid, defaultCommissionRate: '15' }],
    ['an amount that is not money', { ...valid, cargoBands: [{ maxPrice: null, amount: 'kırk' }] }],
  ];
  it.each(refused)('refuses %s with a 400, and stores nothing', async (_name, body) => {
    const res = await saveFees(post(body), routeContext());
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Ücret ayarları|Geçersiz tutar/);
    expect(await configRepo.getEffectiveFeeSettings(appDb, 'TY', Date.now() + 1000)).toBeUndefined();
  });

  it('saves a stale form that still sends the retired VAT fields, without storing them as rates', async () => {
    // VAT left the price model on 2026-11-03 (doc 02 §0). An open browser tab from before then
    // still posts these; the save must neither fail nor record a VAT rate.
    await configRepo.upsertMarketplace(appDb, {
      code: 'TY',
      displayName: 'Trendyol',
      enabled: true,
      merchantRef: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const stale = {
      ...valid,
      cargoBands: [{ maxPrice: '150.00', amount: '42.50' }],
      commissionVatRate: 20,
      commissionVatDeductible: true,
      cargoVatRate: 20,
    };
    const res = await saveFees(post(stale), routeContext());
    expect(res.status).toBe(200);
    const stored = (await configRepo.getEffectiveFeeSettings(appDb, 'TY', Date.now() + 1000)) as unknown as
      Record<string, unknown>;
    expect(stored.defaultCommissionRate).toBe(15);
    expect(stored.commissionVatRate).toBe(0);
    expect(stored.cargoVatRate).toBe(0);
  });
});

describe('retention windows (read by the nightly prune)', () => {
  it('refuses a body the prune job could not parse', async () => {
    for (const body of [{}, { priceSubmissionsDays: 0 }, { priceSubmissionsDays: 'sixty' }]) {
      expect((await saveRetention(post(body), routeContext())).status).toBe(400);
    }
    expect(await configRepo.getAppSetting(appDb, 'retention.windows')).toBeUndefined();
  });

  it('stores a complete set, with defaults filled for windows added later', async () => {
    const res = await saveRetention(
      post({
        priceSubmissionsDays: 60,
        buyboxObservationsDays: 90,
        appEventsInfoDebugDays: 3,
        appEventsWarnErrorDays: 30,
        jobRunsDays: 90,
        jobQueueFinishedDays: 7,
      }),
      routeContext(),
    );
    expect(res.status).toBe(200);
    const stored = JSON.parse((await configRepo.getAppSetting(appDb, 'retention.windows'))!.value) as Record<string, number>;
    expect(stored).toMatchObject({ priceSubmissionsDays: 60, authEventsDays: 365, trackedProductMetricsDays: 365 });
  });
});
