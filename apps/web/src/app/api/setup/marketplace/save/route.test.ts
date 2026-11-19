/**
 * Credentials that fail their connection test are not saved (product owner, 2026-11-19). Both
 * save routes — the wizard's and Ayarlar → Pazaryerleri's — run the test when the credentials
 * change; switching a marketplace on or off without touching them never calls the marketplace.
 * The marketplace is a stubbed `fetch`: 401 for the login a test refuses, 200 for one it accepts.
 */
// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configRepo, createDb, runMigrations, type AppDatabase } from '@buybox/db';
import { marketplaceCredentialsKey } from '@buybox/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { getSecretStore } from '@/lib/server/secrets';
import { POST as setupSave } from './route';
import { POST as settingsSave } from '../../../settings/marketplaces/route';

let dir: string;
let appDb: AppDatabase;
let cookie: string;
const savedEnv = { ...process.env };
let marketplaceCalls = 0;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-mp-save-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  cookie = await signIn(appDb);
  marketplaceCalls = 0;
  // The marketplace: accepts apiKey "good", refuses anything else.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      marketplaceCalls += 1;
      const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '');
      const accepted = Buffer.from(auth.replace(/^Basic /, ''), 'base64').toString().startsWith('good:');
      return new Response(accepted ? JSON.stringify({ content: [], totalElements: 0 }) : 'no', {
        status: accepted ? 200 : 401,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  globalThis.__buyboxSecretStore = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

const post = (url: string, body: unknown) =>
  withCookie(
    new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    cookie,
  );

const creds = (apiKey: string) => ({ apiKey, apiSecret: 's', sellerId: '123', environment: 'stage' });

async function stored(): Promise<Record<string, string> | null> {
  const raw = await getSecretStore().get(marketplaceCredentialsKey('trendyol'));
  return raw ? (JSON.parse(raw) as Record<string, string>) : null;
}

describe('POST /api/setup/marketplace/save', () => {
  it('refuses credentials the marketplace rejects and stores nothing', async () => {
    const res = await setupSave(post('http://localhost/api/setup/marketplace/save', { code: 'trendyol', enabled: true, credentials: creds('bad') }), routeContext());
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/kabul etmedi/);
    expect(await stored()).toBeNull();
    expect(await configRepo.getMarketplace(appDb, 'trendyol')).toBeUndefined();
  });

  it('saves credentials that pass', async () => {
    const res = await setupSave(post('http://localhost/api/setup/marketplace/save', { code: 'trendyol', enabled: true, credentials: creds('good') }), routeContext());
    expect(res.status).toBe(200);
    expect((await stored())?.apiKey).toBe('good');
  });

  it('keeps a stored field the form left blank', async () => {
    await getSecretStore().set(marketplaceCredentialsKey('trendyol'), JSON.stringify(creds('good')));
    const res = await setupSave(
      post('http://localhost/api/setup/marketplace/save', { code: 'trendyol', enabled: true, credentials: { apiKey: '', apiSecret: '', sellerId: '123' } }),
      routeContext(),
    );
    expect(res.status).toBe(200);
    expect((await stored())?.apiKey).toBe('good');
  });
});

describe('POST /api/settings/marketplaces', () => {
  beforeEach(async () => {
    await getSecretStore().set(marketplaceCredentialsKey('trendyol'), JSON.stringify(creds('good')));
  });

  it('refuses a changed key the marketplace rejects and keeps the stored one', async () => {
    const res = await settingsSave(post('http://localhost/api/settings/marketplaces', { code: 'trendyol', enabled: true, credentials: { apiKey: 'bad' } }), routeContext());
    expect(res.status).toBe(400);
    expect((await stored())?.apiKey).toBe('good');
  });

  it('switches a marketplace off without calling it', async () => {
    const res = await settingsSave(
      post('http://localhost/api/settings/marketplaces', { code: 'trendyol', enabled: false, credentials: { environment: 'stage' } }),
      routeContext(),
    );
    expect(res.status).toBe(200);
    expect(marketplaceCalls).toBe(0);
    expect((await configRepo.getMarketplace(appDb, 'trendyol'))?.enabled).toBe(false);
  });
});
