// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configRepo, createDb, newId, runMigrations, type AppDatabase } from '@buybox/db';
import { GLOBAL_KILL_SWITCH_SETTING_KEY, MODULE_SETTING_KEYS } from '@buybox/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { GET, POST } from './route';

/**
 * The route against a real migrated SQLite file, through the same `getAppDb()` the app uses —
 * the price-switch side effect below is the reason this route has a test at all, and it is a
 * write to the money path's own stop control.
 */
let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };

/** Signed in as a Yönetici: these tests are about the route, the guard has its own (doc 18 §7.2). */
let cookie: string;
const authedRequest = (input: string, init?: RequestInit): Request => withCookie(new Request(input, init), cookie);

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-modules-route-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  // The route opens its own connection through `getAppDb()`; this one is only for assertions.
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

function post(body: unknown): Request {
  return authedRequest('http://localhost/api/modules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/modules', () => {
  it('reports both modules enabled on an install that never chose — an upgrade removes nothing', async () => {
    const res = await GET(authedRequest('http://localhost/'), routeContext());
    expect(await res.json()).toMatchObject({
      modules: { seller: true, brand: true },
      awaitingConfirmation: 0,
    });
  });

  it('refuses to turn both modules off', async () => {
    const res = await POST(post({ seller: false, brand: false }), routeContext());
    expect(res.status).toBe(400);
    expect(await configRepo.getAppSetting(appDb, MODULE_SETTING_KEYS.seller)).toBeUndefined();
  });

  it('refuses a body that is not two booleans', async () => {
    expect((await POST(post({ seller: 'false', brand: true }), routeContext())).status).toBe(400);
  });

  it('engages the price switch when the seller module is turned off, and does not release it when turned back on', async () => {
    await configRepo.setAppSetting(
      appDb,
      { key: GLOBAL_KILL_SWITCH_SETTING_KEY, value: 'false', updatedBy: 'test', updatedAt: 0 },
      newId(),
    );

    const off = await POST(post({ seller: false, brand: true }), routeContext());
    expect(await off.json()).toMatchObject({
      modules: { seller: false, brand: true },
      priceSwitchEngaged: true,
    });
    expect((await configRepo.getAppSetting(appDb, GLOBAL_KILL_SWITCH_SETTING_KEY))?.value).toBe('true');

    const on = await POST(post({ seller: true, brand: true }), routeContext());
    expect(await on.json()).toMatchObject({
      modules: { seller: true, brand: true },
      priceSwitchEngaged: true,
    });
  });

  it('leaves the price switch alone when only the brand module changes', async () => {
    await configRepo.setAppSetting(
      appDb,
      { key: GLOBAL_KILL_SWITCH_SETTING_KEY, value: 'false', updatedBy: 'test', updatedAt: 0 },
      newId(),
    );
    await POST(post({ seller: true, brand: false }), routeContext());
    expect((await configRepo.getAppSetting(appDb, GLOBAL_KILL_SWITCH_SETTING_KEY))?.value).toBe('false');
    expect((await configRepo.getAppSetting(appDb, MODULE_SETTING_KEYS.brand))?.value).toBe('false');
  });
});
