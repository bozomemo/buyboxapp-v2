// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { competitorSellersRepo, configRepo, createDb, runMigrations, type AppDatabase } from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { POST as groupAction } from './group/route';
import { POST as resolveIdentity } from './identity/route';

/** Two seller actions a 2026-09-25 run caught: an unknown group was a 500, a double press two jobs. */
let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };

/** Signed in as a Yönetici: these tests are about the route, the guard has its own (doc 18 §7.2). */
let cookie: string;
const authedRequest = (input: string, init?: RequestInit): Request => withCookie(new Request(input, init), cookie);

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-seller-actions-'));
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
  await competitorSellersRepo.recordSeenSellers(appDb, [
    { id: 's1', marketplaceCode: 'trendyol', sellerRef: '944528', sellerName: 'HeyMama', seenAt: 0 },
  ]);
});

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

const post = (body: unknown) => authedRequest('http://x', { method: 'POST', body: JSON.stringify(body) });

describe('seller actions', () => {
  it('answers an unknown group with 404, not a 500', async () => {
    const res = await groupAction(
      post({ action: 'assign', marketplaceCode: 'trendyol', sellerRef: '944528', groupId: 'nope' }), routeContext()
    );
    expect(res.status).toBe(404);
  });

  it('queues one identity resolution per seller, however often it is pressed', async () => {
    const key = { marketplaceCode: 'trendyol', sellerRef: '944528' };
    expect((await resolveIdentity(post(key), routeContext())).status).toBe(200);
    expect((await resolveIdentity(post(key), routeContext())).status).toBe(409);
  });
});
