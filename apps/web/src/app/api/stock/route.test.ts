/**
 * POST /api/stock — adding a stock item by hand (Stok → Ürün Ekle), against a real migrated
 * database. The cost is what the operator typed, in the form the screen shows money: "120,50"
 * came back as `Money: invalid decimal string "120,50"` (2026-11-19 walkthrough).
 */
// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, runMigrations, stockRepo, type AppDatabase } from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { POST } from './route';

let dir: string;
let appDb: AppDatabase;
let cookie: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-stock-route-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  cookie = await signIn(appDb);
});

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

async function add(unitCost: string) {
  const request = withCookie(
    new Request('http://localhost/api/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseStockCode: 'TST001', name: 'Test', unitCost, unitStock: 10 }),
    }),
    cookie,
  );
  const response = await POST(request, routeContext());
  return { status: response.status, body: (await response.json()) as { ok: boolean; error?: string } };
}

describe('POST /api/stock', () => {
  it.each([
    ['120,50', 12050n],
    ['120.50', 12050n],
    ['1.234,56', 123456n],
    // One TL reading app-wide (product owner, 2026-11-19).
    ['1.400', 140000n],
  ])('stores %s as %s kuruş', async (typed, kurus) => {
    expect((await add(typed)).status).toBe(200);
    expect((await stockRepo.getStockItem(appDb, 'TST001'))?.unitCost).toBe(kurus);
  });

  it('refuses an amount finer than a kuruş with a sentence the operator can act on', async () => {
    const { status, body } = await add('400,505');
    expect(status).toBe(400);
    expect(body.error).toMatch(/geçerli bir tutar değil/);
    expect(body.error).not.toMatch(/Money:/);
  });
});
