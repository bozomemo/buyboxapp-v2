// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configRepo, createDb, jobsRepo, newId, runMigrations, watchedBrandsRepo, type AppDatabase } from '@buybox/db';
import { SWEEP_BRAND_CATALOGUE_JOB } from '@buybox/jobs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { POST } from './route';

/**
 * The one-sweep-per-brand guard. It used to ask only "is anything running without a
 * `watchedBrandId`?", so a whole-marketplace Trendyol pass answered 409 for a Hepsiburada brand,
 * and for a brand added after the pass had already listed its brands (2026-09-25).
 */
let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };
const T0 = 1_790_000_000_000;

/** Signed in as a Yönetici: these tests are about the route, the guard has its own (doc 18 §7.2). */
let cookie: string;
const authedRequest = (input: string, init?: RequestInit): Request => withCookie(new Request(input, init), cookie);

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-sweep-route-'));
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
      createdAt: T0,
      updatedAt: T0,
    });
  }
});

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

async function seedBrand(marketplaceCode: string, label: string, createdAt: number): Promise<string> {
  const groupId = newId();
  await watchedBrandsRepo.createWatchedBrandGroup(appDb, {
    id: groupId,
    name: `${label} grubu`,
    note: null,
    createdAt,
    updatedAt: createdAt,
  });
  const id = newId();
  await watchedBrandsRepo.createWatchedBrand(appDb, {
    id,
    groupId,
    marketplaceCode,
    label,
    brandRef: null,
    searchTerm: label.toLowerCase(),
    isActive: true,
    isOwnBrand: true,
    lastSweptAt: null,
    lastSweepProductCount: null,
    createdAt,
    updatedAt: createdAt,
  });
  return id;
}

/** A sweep row; `startedAt` given ⇒ it is claimed and its run started then. */
async function seedSweep(payload: Record<string, unknown>, startedAt?: number): Promise<void> {
  const id = newId();
  await jobsRepo.enqueueJob(appDb, {
    id,
    jobName: SWEEP_BRAND_CATALOGUE_JOB,
    payload: JSON.stringify(payload),
    priority: 0,
    state: startedAt === undefined ? 'ready' : 'locked',
    runAfter: T0,
    lockedBy: startedAt === undefined ? null : 'worker-1-abc',
    lockedUntil: startedAt === undefined ? null : Date.now() + 60_000,
    attempts: startedAt === undefined ? 0 : 1,
    maxAttempts: 3,
    lastError: null,
    createdAt: T0,
    updatedAt: T0,
  });
  if (startedAt !== undefined) {
    await jobsRepo.startJobRun(appDb, {
      id: newId(),
      jobName: SWEEP_BRAND_CATALOGUE_JOB,
      startedAt,
      finishedAt: null,
      state: 'running',
      itemsTotal: 3,
      itemsOk: 0,
      itemsFailed: 0,
      error: null,
      correlationId: newId(),
      jobQueueId: id,
    });
  }
}

async function press(brandId: string): Promise<number> {
  const res = await POST(
    authedRequest('http://localhost/api', { method: 'POST', body: JSON.stringify({ withSellers: false }) }),
    { params: Promise.resolve({ id: brandId }) },
  );
  return res.status;
}

describe('POST /api/watched-brands/[id]/sweep — what counts as already covered', () => {
  it('a running Trendyol pass does not block a Hepsiburada brand', async () => {
    const hb = await seedBrand('hepsiburada', 'Orijen', T0);
    await seedSweep({ marketplaceCode: 'trendyol' }, T0 + 1000);
    expect(await press(hb)).toBe(200);
  });

  it('a pass that started before the brand existed does not cover it', async () => {
    await seedSweep({ marketplaceCode: 'trendyol' }, T0);
    const late = await seedBrand('trendyol', 'Orijen', T0 + 60_000);
    expect(await press(late)).toBe(200);
  });

  it('a pass that started after the brand existed covers it', async () => {
    const early = await seedBrand('trendyol', 'Whiskas', T0);
    await seedSweep({ marketplaceCode: 'trendyol' }, T0 + 60_000);
    expect(await press(early)).toBe(409);
  });

  it('a queued pass not yet started covers a brand of its marketplace', async () => {
    const brand = await seedBrand('trendyol', 'Whiskas', T0 + 60_000);
    await seedSweep({ marketplaceCode: 'trendyol' });
    expect(await press(brand)).toBe(409);
  });

  it('a sweep of the same brand blocks; a sweep of another brand does not', async () => {
    const a = await seedBrand('trendyol', 'Acana', T0);
    const b = await seedBrand('trendyol', 'Royal Canin', T0);
    await seedSweep({ marketplaceCode: 'trendyol', watchedBrandId: a }, T0 + 1000);
    expect(await press(a)).toBe(409);
    expect(await press(b)).toBe(200);
  });
});
