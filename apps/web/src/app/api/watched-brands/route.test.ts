// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configRepo, createDb, newId, runMigrations, watchedBrandsRepo, type AppDatabase } from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { POST } from './route';
import { PATCH } from './[id]/route';

/**
 * Adding and editing a watched brand, on the three mistakes a 2026-09-25 run found: a Hepsiburada
 * brand saved with only a brand id (never sweepable), and a missing group or unknown marketplace
 * reported as "a brand with this name already exists".
 */
let dir: string;
let appDb: AppDatabase;
let groupId: string;
const savedEnv = { ...process.env };

/** Signed in as a Yönetici: these tests are about the route, the guard has its own (doc 18 §7.2). */
let cookie: string;
const authedRequest = (input: string, init?: RequestInit): Request => withCookie(new Request(input, init), cookie);

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-watched-brands-'));
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
  groupId = newId();
  await watchedBrandsRepo.createWatchedBrandGroup(appDb, { id: groupId, name: 'Grup', note: null, createdAt: 0, updatedAt: 0 });
});

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

async function add(body: Record<string, unknown>) {
  const res = await POST(authedRequest('http://x', { method: 'POST', body: JSON.stringify({ groupId, ...body }) }), routeContext());
  return { status: res.status, body: (await res.json()) as { error?: string; id?: string } };
}

describe('POST /api/watched-brands', () => {
  it('refuses a Hepsiburada brand with a brand id but no search term', async () => {
    const res = await add({ marketplaceCode: 'hepsiburada', label: 'Orijen', brandRef: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('arama terimi');
  });

  it('names a missing group and an unknown marketplace instead of calling them duplicates', async () => {
    const noGroup = await add({ groupId: 'nope', marketplaceCode: 'trendyol', label: 'A', searchTerm: 'a' });
    expect(noGroup).toMatchObject({ status: 400, body: { error: 'Marka grubu bulunamadı.' } });

    const noMarketplace = await add({ marketplaceCode: 'amazon', label: 'A', searchTerm: 'a' });
    expect(noMarketplace.status).toBe(400);
    expect(noMarketplace.body.error).toContain('tanımlı değil');
  });

  it('still answers a real duplicate with 409', async () => {
    expect((await add({ marketplaceCode: 'trendyol', label: 'Orijen', searchTerm: 'orijen' })).status).toBe(200);
    expect((await add({ marketplaceCode: 'trendyol', label: 'Orijen', searchTerm: 'orijen' })).status).toBe(409);
  });
});

describe('PATCH /api/watched-brands/[id]', () => {
  it('refuses to strip a Hepsiburada brand of its search term, in Turkish', async () => {
    const created = await add({ marketplaceCode: 'hepsiburada', label: 'Orijen', searchTerm: 'orijen' });
    const res = await PATCH(
      authedRequest('http://x', { method: 'PATCH', body: JSON.stringify({ searchTerm: '', brandRef: '9' }) }),
      { params: Promise.resolve({ id: created.body.id! }) },
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('arama terimi');
  });
});
