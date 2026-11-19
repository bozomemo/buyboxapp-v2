/**
 * POST /api/stock/prefs — the stock screen's per-marketplace multiplier and automation switch.
 * The route stored whatever number it was sent: an emptied field arrived as 0 and was saved
 * (2026-11-19 walkthrough). The multiplier scales the cost every floor price is built on, so a
 * value that is not a positive number is refused.
 */
// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configRepo, createDb, runMigrations, stockRepo, type AppDatabase } from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { POST } from './route';

let dir: string;
let appDb: AppDatabase;
let cookie: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-stock-prefs-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  cookie = await signIn(appDb);
  await configRepo.upsertMarketplace(appDb, {
    code: 'trendyol',
    displayName: 'Trendyol',
    enabled: true,
    merchantRef: null,
    createdAt: 0,
    updatedAt: 0,
  });
  await stockRepo.upsertStockItem(appDb, {
    baseStockCode: 'TST001',
    name: 'Test',
    unitCost: 12050n,
    unitStock: 10,
    sourceCode: 'manual',
    sourceRef: null,
    costUpdatedAt: 0,
    createdAt: 0,
    updatedAt: 0,
  });
});

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

async function post(body: Record<string, unknown>) {
  const request = withCookie(
    new Request('http://localhost/api/stock/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseStockCode: 'TST001', marketplaceCode: 'trendyol', ...body }),
    }),
    cookie,
  );
  const response = await POST(request, routeContext());
  return response.status;
}

describe('POST /api/stock/prefs', () => {
  it('stores a positive multiplier', async () => {
    expect(await post({ priceMultiplier: 1.2 })).toBe(200);
    expect((await stockRepo.getStockMarketplacePrefs(appDb, 'TST001', 'trendyol'))?.priceMultiplier).toBe(1.2);
  });

  it.each([[0], [-1], ['1,2'], [null]])('refuses %j and stores nothing', async (priceMultiplier) => {
    expect(await post({ priceMultiplier })).toBe(400);
    expect(await stockRepo.getStockMarketplacePrefs(appDb, 'TST001', 'trendyol')).toBeUndefined();
  });

  it('refuses a non-boolean automation switch', async () => {
    expect(await post({ autoRepriceEnabled: 'true' })).toBe(400);
  });

  it('still toggles automation alone', async () => {
    expect(await post({ autoRepriceEnabled: true })).toBe(200);
    expect((await stockRepo.getStockMarketplacePrefs(appDb, 'TST001', 'trendyol'))?.autoRepriceEnabled).toBe(true);
  });
});
