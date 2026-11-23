// @vitest-environment node
/**
 * Kâr Ayarları' save and read (doc 17 §8.1), including the default commission the product owner
 * asked for on 2026-11-23, and a row saved before that field existed.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configRepo, createDb, newId, runMigrations, type AppDatabase } from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { SELLER_PROFIT_SETTING_KEY } from '@/lib/server/seller-profit-settings';
import { GET, POST } from './route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };
let cookie: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-profit-settings-'));
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

const URL = 'http://localhost/api/brand/profit-settings';

async function read(): Promise<{ settings: Record<string, unknown> | null }> {
  const response = await GET(withCookie(new Request(URL), cookie), routeContext());
  expect(response.status).toBe(200);
  return (await response.json()) as { settings: Record<string, unknown> | null };
}

function save(body: unknown): Promise<Response> {
  return POST(
    withCookie(
      new Request(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      cookie,
    ),
    routeContext(),
  );
}

describe('/api/brand/profit-settings', () => {
  it('saves and reads back the default commission', async () => {
    const response = await save({
      fixedSaleFee: '12,50',
      desiBands: [{ maxDesi: '', cargo: '85', operation: '25' }],
      defaultCommissionRate: '15,5',
    });
    expect(response.status).toBe(200);
    expect((await read()).settings).toMatchObject({ fixedSaleFee: '1250', defaultCommissionRate: 15.5 });
  });

  it('an empty field saves no default', async () => {
    await save({
      fixedSaleFee: '12,50',
      desiBands: [{ maxDesi: '', cargo: '85', operation: '25' }],
      defaultCommissionRate: '',
    });
    expect((await read()).settings).toMatchObject({ defaultCommissionRate: null });
  });

  it('refuses an unreadable rate with the reason', async () => {
    const response = await save({
      fixedSaleFee: '12,50',
      desiBands: [{ maxDesi: '', cargo: '85', operation: '25' }],
      defaultCommissionRate: '120',
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/Varsayılan komisyon/);
  });

  it('reads a row saved before the field existed as having no default', async () => {
    await configRepo.setAppSetting(
      appDb,
      {
        key: SELLER_PROFIT_SETTING_KEY,
        value: JSON.stringify({ fixedSaleFee: '1250', desiBands: [{ maxDesi: null, cargo: '8500', operation: '2500' }] }),
        updatedBy: 'test',
        updatedAt: 0,
      },
      newId(),
    );
    expect((await read()).settings).toMatchObject({ fixedSaleFee: '1250', defaultCommissionRate: null });
  });
});
