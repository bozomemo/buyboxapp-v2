/**
 * GET /api/settings/marketplaces — the environment (Prod/Test) is not a secret and the screen
 * needs it to show what is stored; it used to be left out, so every install looked like Prod
 * (2026-11-19 walkthrough). The credentials themselves never leave the secret store.
 */
// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configRepo, createDb, runMigrations, type AppDatabase } from '@buybox/db';
import { marketplaceCredentialsKey } from '@buybox/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRequest, routeContext, signIn } from '@/lib/server/auth/test-auth';
import { getSecretStore } from '@/lib/server/secrets';
import { GET } from './route';

let dir: string;
let appDb: AppDatabase;
let cookie: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-settings-mp-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  cookie = await signIn(appDb);
  for (const code of ['trendyol', 'hepsiburada']) {
    await configRepo.upsertMarketplace(appDb, {
      code,
      displayName: code,
      enabled: true,
      merchantRef: null,
      createdAt: 0,
      updatedAt: 0,
    });
  }
});

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  globalThis.__buyboxSecretStore = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/settings/marketplaces', () => {
  it('returns the stored environment and nothing else from the credentials', async () => {
    await getSecretStore().set(
      marketplaceCredentialsKey('trendyol'),
      JSON.stringify({ apiKey: 'k', apiSecret: 's', sellerId: '1', environment: 'stage' }),
    );
    const response = await GET(getRequest('http://localhost/api/settings/marketplaces', cookie), routeContext());
    const body = (await response.json()) as { marketplaces: Record<string, unknown>[] };
    const trendyol = body.marketplaces.find((m) => m.code === 'trendyol')!;
    const hepsiburada = body.marketplaces.find((m) => m.code === 'hepsiburada')!;
    expect(trendyol.environment).toBe('stage');
    // Nothing stored: no environment to show, and none to send back.
    expect(hepsiburada.environment).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/apiSecret|"k"|"s"/);
  });
});

describe('GET /api/settings/marketplaces, a record without an environment', () => {
  it('reads it as production', async () => {
    await getSecretStore().set(marketplaceCredentialsKey('trendyol'), JSON.stringify({ apiKey: 'k' }));
    const response = await GET(getRequest('http://localhost/api/settings/marketplaces', cookie), routeContext());
    const body = (await response.json()) as { marketplaces: Record<string, unknown>[] };
    expect(body.marketplaces.find((m) => m.code === 'trendyol')!.environment).toBe('production');
  });
});
