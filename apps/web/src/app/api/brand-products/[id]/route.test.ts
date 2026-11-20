// @vitest-environment node
/**
 * The brand product detail read: the band-realism note (brand roadmap §6.12) from 30 days of every
 * seller's looks on the linked cards.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brandProductsRepo, configRepo, createDb, runMigrations, trackedProductsRepo, type AppDatabase } from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { GET } from './route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };
let cookie: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-brand-product-'));
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
});

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

async function seed(prices: bigint[]): Promise<void> {
  const now = Date.now();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id: 'card-1',
    marketplaceCode: 'trendyol',
    productRef: '111',
    productUrl: '/x-p-111',
    label: 'Ton 85g',
    isActive: true,
    addedAt: now,
  });
  await brandProductsRepo.insertBrandProduct(appDb, {
    id: 'bp-1',
    name: 'Ton Balıklı 85g',
    referencePrice: 100_00n,
    minPrice: 80_00n,
    maxPrice: null,
    barcode: null,
    source: 'manual',
    referencePriceSource: null,
    unitPrice: null,
    desi: null,
    createdAt: now,
    updatedAt: now,
  });
  await brandProductsRepo.linkCard(appDb, {
    id: 'link-1',
    brandProductId: 'bp-1',
    trackedProductId: 'card-1',
    unitMultiplier: 2,
    isPrimary: true,
    linkSource: 'manual',
    linkedAt: now,
  });
  await trackedProductsRepo.insertTrackedProductObservations(
    appDb,
    prices.map((price, i) => ({
      id: `o${i}`,
      trackedProductId: 'card-1',
      observedAt: now - i * 3_600_000,
      status: 'ok' as const,
      rank: 1,
      sellerName: 'Bayi',
      sellerRef: '9',
      price,
      finalPrice: null,
      offeredStock: 10,
    })),
  );
}

interface Realism {
  kind: string;
  looks: number;
  medianUnitPrice: string | null;
  windowDays: number;
}

async function read(): Promise<Realism> {
  const response = await GET(
    withCookie(new Request('http://localhost/api/brand-products/bp-1'), cookie),
    routeContext({ id: 'bp-1' }),
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { realism: Realism }).realism;
}

describe('GET /api/brand-products/[id] — band realism', () => {
  it('every look above the multiplied upper bound for a month: says so, with the median unit price', async () => {
    // ×2 card: the upper bound is 200,00. Every look at 260,00 is 130,00 a unit.
    await seed(Array.from({ length: 12 }, () => 260_00n));
    expect(await read()).toEqual({ kind: 'allAbove', looks: 12, medianUnitPrice: '13000', windowDays: 30 });
  });

  it('too few looks: insufficient', async () => {
    await seed([260_00n, 260_00n]);
    expect((await read()).kind).toBe('insufficient');
  });
});
