// @vitest-environment node
/**
 * The audit findings read (doc 06 §12.4).
 *
 * Production, 2026-11-23: the screen failed with an empty 500 as soon as a brand had its first
 * published price. The reference-price finding carries its money as `bigint`, and
 * `NextResponse.json` throws on a `bigint` rather than dropping it — so one such finding took
 * the whole list down. The cadence job had already learnt this; the route had not.
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
import { GET } from './route';

const DAY = 24 * 60 * 60 * 1000;

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };
let cookie: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-findings-'));
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

/** An own brand with one card whose only seller sits 30% under the published price. */
async function seedBelowReference(): Promise<string> {
  const now = Date.now();
  await watchedBrandsRepo.createWatchedBrandGroup(appDb, {
    id: 'g-1',
    name: 'Grup',
    note: null,
    createdAt: now,
    updatedAt: now,
  });
  await watchedBrandsRepo.createWatchedBrand(appDb, {
    id: 'wb-1',
    groupId: 'g-1',
    marketplaceCode: 'trendyol',
    label: 'Acana',
    brandRef: '1',
    searchTerm: 'acana',
    isActive: true,
    isOwnBrand: true,
    lastSweptAt: null,
    lastSweepProductCount: null,
    createdAt: now,
    updatedAt: now,
  });
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id: 'card-1',
    marketplaceCode: 'trendyol',
    productRef: '111',
    productUrl: '/x-p-111',
    label: 'Mama 2kg',
    isActive: true,
    addedAt: now - 10 * DAY,
    watchedBrandId: 'wb-1',
  });
  await brandProductsRepo.insertBrandProduct(appDb, {
    id: 'bp-1',
    name: 'Mama 2kg',
    referencePrice: 100_00n,
    minPrice: null,
    maxPrice: null,
    barcode: null,
    source: 'manual',
    referencePriceSource: 'liste.csv',
    unitPrice: null,
    desi: null,
    createdAt: now - 10 * DAY,
    updatedAt: now - 10 * DAY,
  });
  await brandProductsRepo.linkCard(appDb, {
    id: 'link-1',
    brandProductId: 'bp-1',
    trackedProductId: 'card-1',
    unitMultiplier: 1,
    isPrimary: true,
    linkSource: 'manual',
    linkedAt: now - 10 * DAY,
  });
  await trackedProductsRepo.insertTrackedProductObservations(appDb, [
    {
      id: 'o-1',
      trackedProductId: 'card-1',
      observedAt: now - DAY,
      status: 'ok',
      rank: 1,
      sellerName: 'Bayi',
      sellerRef: '9',
      price: 70_00n,
      finalPrice: 70_00n,
      offeredStock: 5,
    },
  ]);
  return 'wb-1';
}

describe('GET /api/brand-reports/findings', () => {
  it('a reference-price finding crosses the wire with its money as strings', async () => {
    const brandId = await seedBelowReference();

    const response = await GET(
      withCookie(new Request(`http://localhost/api/brand-reports/findings?watchedBrandId=${brandId}`), cookie),
      routeContext(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      findings: { kind: string; referencePrice?: string; lowestPrice?: string; unitReferencePrice?: string }[];
    };
    const finding = body.findings.find((f) => f.kind === 'belowReferencePrice');
    expect(finding).toMatchObject({ referencePrice: '10000', lowestPrice: '7000', unitReferencePrice: '10000' });
  });
});
