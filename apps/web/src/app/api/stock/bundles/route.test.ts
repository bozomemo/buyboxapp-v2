/**
 * POST /api/stock/bundles — the Stok screen's bundle editor. The cost engine finds a bundle by the
 * listing's own stock code ("12345-k2", doc 01 §6), but the editor saved new bundles under
 * `Date.now()` ("1795052444341") with no field to enter the code, so no listing could ever use one
 * (2026-11-19 walkthrough). The route stored whatever it was sent.
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
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-bundles-'));
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

async function save(body: Record<string, unknown>) {
  const request = withCookie(
    new Request('http://localhost/api/stock/bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    cookie,
  );
  const response = await POST(request, routeContext());
  return { status: response.status, body: (await response.json()) as { ok: boolean; error?: string } };
}

const MEMBERS = [{ memberStockCode: 'TST001', quantity: 2 }];

describe('POST /api/stock/bundles', () => {
  it('saves a bundle under a bundle stock code', async () => {
    expect((await save({ bundleStockCode: '12345-k2', name: 'Paket', members: MEMBERS })).status).toBe(200);
    expect((await stockRepo.listBundles(appDb)).map((b) => b.bundleStockCode)).toEqual(['12345-k2']);
  });

  it.each([['1795052444341'], ['12345'], ['12345-2'], [''], ['  ']])(
    'refuses %j: not a bundle code a listing could carry',
    async (bundleStockCode) => {
      const { status, body } = await save({ bundleStockCode, name: 'Paket', members: MEMBERS });
      expect(status).toBe(400);
      expect(body.error).toMatch(/12345-k2/);
      expect(await stockRepo.listBundles(appDb)).toEqual([]);
    },
  );

  it('refuses a bundle with no members', async () => {
    const { status, body } = await save({ bundleStockCode: '12345-k2', name: 'Paket', members: [] });
    expect(status).toBe(400);
    expect(body.error).toMatch(/üye/);
  });

  it.each([[0], [-1], [1.5]])('refuses a member quantity of %s', async (quantity) => {
    const { status } = await save({
      bundleStockCode: '12345-k2',
      name: 'Paket',
      members: [{ memberStockCode: 'TST001', quantity }],
    });
    expect(status).toBe(400);
  });

  it('refuses a member with no stock code', async () => {
    const { status } = await save({
      bundleStockCode: '12345-k2',
      name: 'Paket',
      members: [{ memberStockCode: ' ', quantity: 1 }],
    });
    expect(status).toBe(400);
  });
});
