// @vitest-environment node
/**
 * Alarmlar (doc 17 §5.4) against a real migrated database: open and resolved violations cross
 * with their product and card, money as kuruş strings, and the listings lane's freshness beside
 * them — a zero with no successful pass must read as stale, not as "all clear".
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  bandViolationsRepo,
  brandProductsRepo,
  configRepo,
  createDb,
  runMigrations,
  trackedProductsRepo,
  type AppDatabase,
} from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { GET } from './route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };
let cookie: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-brand-alerts-'));
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

async function seedLinkedCard(card: Partial<trackedProductsRepo.TrackedProductRow> = {}): Promise<void> {
  const now = Date.now();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    ...card,
    id: 'card-1',
    marketplaceCode: 'trendyol',
    productRef: '111',
    productUrl: '/x-p-111',
    label: 'Ton 85g',
    isActive: true,
    addedAt: now,
    ...card,
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
}

interface AlertsResponse {
  open: { brandProductName: string; cardLabel: string; kind: string; thresholdApplied: string; observedPrice: string }[];
  resolved: { resolution: string }[];
  staleness: { marketplaceCode: string; lastOkAt: number | null; stale: boolean }[];
  availability: { trackedProductId: string; brandProductName: string; issue: string; offeredStock: number | null; buyboxSeller: string | null }[];
}

async function alerts(): Promise<AlertsResponse> {
  const response = await GET(withCookie(new Request('http://localhost/api/brand/alerts'), cookie), routeContext());
  expect(response.status).toBe(200);
  return (await response.json()) as AlertsResponse;
}

describe('GET /api/brand/alerts', () => {
  it('nothing linked: no violations and no marketplace to be stale about', async () => {
    expect(await alerts()).toMatchObject({ open: [], resolved: [], staleness: [] });
  });

  it('a linked card the lane never read is stale, not "all clear"', async () => {
    await seedLinkedCard();
    const body = await alerts();
    expect(body.open).toEqual([]);
    expect(body.staleness).toEqual([
      expect.objectContaining({ marketplaceCode: 'trendyol', lastOkAt: null, stale: true }),
    ]);
  });

  it('lists open and recently resolved violations with money as kuruş strings', async () => {
    await seedLinkedCard();
    const now = Date.now();
    const [opened] = await bandViolationsRepo.applyBandPlan(appDb, {
      trackedProductId: 'card-1',
      brandProductId: 'bp-1',
      unitMultiplier: 2,
      snapshot: '[]',
      nowMs: now - 60_000,
      plan: {
        open: [
          { kind: 'belowMin', sellerRef: '9', sellerName: 'Ucuzcu', thresholdApplied: 160_00n, observedPrice: 150_00n, priceSource: 'price', basis: 'shelf' },
          { kind: 'aboveMax', sellerRef: '9', sellerName: 'Ucuzcu', thresholdApplied: 200_00n, observedPrice: 250_00n, priceSource: 'price', basis: 'shelf' },
        ],
        confirm: [],
        resolve: [],
      },
    });
    await bandViolationsRepo.applyBandPlan(appDb, {
      trackedProductId: 'card-1',
      brandProductId: 'bp-1',
      unitMultiplier: 2,
      snapshot: '[]',
      nowMs: now,
      plan: { open: [], confirm: [], resolve: [{ id: opened!.id, resolution: 'inBand' }] },
    });

    const body = await alerts();
    expect(body.open).toEqual([
      expect.objectContaining({
        brandProductName: 'Ton Balıklı 85g',
        cardLabel: 'Ton 85g',
        kind: 'aboveMax',
        thresholdApplied: '20000',
        observedPrice: '25000',
      }),
    ]);
    expect(body.resolved).toEqual([expect.objectContaining({ resolution: 'inBand' })]);
  });

  /** Brand roadmap §6.8: shelf and stock warnings beside the price violations. */
  it('a linked card nobody sells is "rafta yok"; one never read says nothing', async () => {
    await seedLinkedCard({ hasSellers: false, lastScrapedAt: Date.now() });
    expect((await alerts()).availability).toEqual([
      expect.objectContaining({ trackedProductId: 'card-1', brandProductName: 'Ton Balıklı 85g', issue: 'noSellers' }),
    ]);
  });

  it('never read: no availability row', async () => {
    await seedLinkedCard();
    expect((await alerts()).availability).toEqual([]);
  });

  it('the buybox holder showing under 3 units is "stok azalıyor"', async () => {
    const now = Date.now();
    await seedLinkedCard({ hasSellers: true, lastScrapedAt: now });
    await trackedProductsRepo.insertTrackedProductObservations(appDb, [
      { id: 'o1', trackedProductId: 'card-1', observedAt: now, status: 'ok', rank: 1, sellerName: 'Az Stoklu', sellerRef: '7', price: 150_00n, finalPrice: null, offeredStock: 2 },
      { id: 'o2', trackedProductId: 'card-1', observedAt: now, status: 'ok', rank: 2, sellerName: 'Bol', sellerRef: '8', price: 160_00n, finalPrice: null, offeredStock: 90 },
    ]);
    expect((await alerts()).availability).toEqual([
      expect.objectContaining({ issue: 'lowStock', offeredStock: 2, buyboxSeller: 'Az Stoklu' }),
    ]);
  });
});
