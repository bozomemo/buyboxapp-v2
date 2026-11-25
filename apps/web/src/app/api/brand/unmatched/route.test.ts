// @vitest-environment node
/**
 * Eşleşmemiş Kartlar (brand roadmap §6.9) against a real migrated database: own-brand cards no
 * product claims, a barcode suggestion beside each, and "bizim değil" taking a card out of the
 * queue and back.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  brandProductsRepo,
  configRepo,
  createDb,
  runMigrations,
  trackedProductsRepo,
  watchedBrandsRepo,
  type AppDatabase,
} from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { GET, POST } from './route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };
let cookie: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-brand-unmatched-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  cookie = await signIn(appDb);
  const now = Date.now();
  await configRepo.upsertMarketplace(appDb, {
    code: 'hepsiburada',
    displayName: 'Hepsiburada',
    enabled: true,
    merchantRef: null,
    createdAt: 0,
    updatedAt: 0,
  });
  await watchedBrandsRepo.createWatchedBrandGroup(appDb, { id: 'g1', name: 'Mars', note: null, createdAt: now, updatedAt: now });
  await watchedBrandsRepo.createWatchedBrand(appDb, {
    id: 'own',
    groupId: 'g1',
    marketplaceCode: 'hepsiburada',
    label: 'Whiskas',
    brandRef: 'whiskas',
    searchTerm: null,
    isActive: true,
    isOwnBrand: true,
    lastSweptAt: null,
    lastSweepProductCount: null,
    createdAt: now,
    updatedAt: now,
  });
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id: 'card-1',
    marketplaceCode: 'hepsiburada',
    productRef: 'HBC1',
    productUrl: '/x-p-HBC1',
    label: 'Whiskas Ton 85g',
    isActive: true,
    addedAt: now,
    watchedBrandId: 'own',
    barcode: '8690000000017',
    ratingCount: 40,
  });
  await brandProductsRepo.insertBrandProduct(appDb, {
    id: 'bp-1',
    name: 'Ton Balıklı 85g',
    referencePrice: 100_00n,
    minPrice: null,
    maxPrice: null,
    barcode: '8690000000017',
    source: 'manual',
    referencePriceSource: null,
    unitPrice: null,
    desi: null,
    createdAt: now,
    updatedAt: now,
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

interface QueueResponse {
  total: number;
  newCount: number;
  cards: { id: string; label: string; watchedBrandLabel: string; suggestions: { id: string; name: string }[] }[];
}

async function queue(query = ''): Promise<QueueResponse> {
  const response = await GET(withCookie(new Request(`http://localhost/api/brand/unmatched${query}`), cookie), routeContext());
  expect(response.status).toBe(200);
  return (await response.json()) as QueueResponse;
}

async function post(body: unknown): Promise<Response> {
  return POST(
    withCookie(
      new Request('http://localhost/api/brand/unmatched', { method: 'POST', body: JSON.stringify(body) }),
      cookie,
    ),
    routeContext(),
  );
}

describe('/api/brand/unmatched', () => {
  it('lists an unclaimed own-brand card with a barcode suggestion, counted as new this week', async () => {
    expect(await queue()).toMatchObject({
      total: 1,
      newCount: 1,
      cards: [
        {
          id: 'card-1',
          label: 'Whiskas Ton 85g',
          watchedBrandLabel: 'Whiskas',
          suggestions: [{ id: 'bp-1', name: 'Ton Balıklı 85g' }],
        },
      ],
    });
  });

  // Review 2026-11-25 O4.
  it('searches by text and filters by brand, and lists the brands and products the screen offers', async () => {
    expect((await queue('?text=ton')).total).toBe(1);
    expect((await queue('?text=somon')).total).toBe(0);
    expect((await queue('?watchedBrandId=nope')).total).toBe(0);
    const body = (await queue()) as QueueResponse & { brands: { label: string }[]; products: { id: string; name: string }[] };
    expect(body.brands.map((b) => b.label)).toEqual(['Whiskas']);
    expect(body.products).toEqual([{ id: 'bp-1', name: 'Ton Balıklı 85g' }]);
  });

  it('"bizim değil" takes a card out of the queue; putting it back restores it', async () => {
    expect((await post({ ids: ['card-1'], dismissed: true })).status).toBe(200);
    expect((await queue()).total).toBe(0);
    expect((await queue('?dismissed=true')).cards.map((c) => c.id)).toEqual(['card-1']);
    expect((await post({ ids: ['card-1'], dismissed: false })).status).toBe(200);
    expect((await queue()).total).toBe(1);
  });

  it('refuses a body without ids', async () => {
    expect((await post({ dismissed: true })).status).toBe(400);
  });
});
