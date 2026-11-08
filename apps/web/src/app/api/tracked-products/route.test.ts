// @vitest-environment node
/**
 * `/api/tracked-products` against a real migrated database — the 2026-11-08 seller filters
 * (spec `docs/superpowers/specs/2026-11-08-tracked-products-filters-design.md`): review count
 * first by default, nobody-selling cards hidden unless asked for, the seller and seller-count
 * filters, the 30-day count in the CSV, and the seller dropdown's source.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  competitorSellersRepo,
  configRepo,
  createDb,
  newId,
  runMigrations,
  trackedProductsRepo,
  type AppDatabase,
} from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { GET } from './route';
import { GET as GET_SELLERS } from './sellers/route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };
const DAY = 86_400_000;

let cookie: string;
const authedRequest = (input: string): Request => withCookie(new Request(input), cookie);

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-tracked-products-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  cookie = await signIn(appDb);
  for (const code of ['TY', 'HB']) {
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
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

interface ListResponse {
  total: number;
  products: { id: string; label: string; sellerCount: number }[];
}

async function list(query = ''): Promise<ListResponse> {
  const response = await GET(authedRequest(`http://localhost/api/tracked-products${query}`), routeContext());
  expect(response.status).toBe(200);
  return (await response.json()) as ListResponse;
}

async function addProduct(
  label: string,
  fields: { ratingCount?: number | null; hasSellers?: boolean | null; marketplaceCode?: string } = {},
): Promise<string> {
  const id = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode: fields.marketplaceCode ?? 'TY',
    productRef: id,
    productUrl: `/p-${id}`,
    label,
    isActive: true,
    addedAt: 0,
    ratingCount: fields.ratingCount,
    hasSellers: fields.hasSellers,
  });
  return id;
}

/** A successful look seeing these sellers, `daysAgo` before now. */
async function look(id: string, sellers: string[], daysAgo = 1): Promise<void> {
  const at = Date.now() - daysAgo * DAY;
  await trackedProductsRepo.recordTrackedProductLook(appDb, {
    trackedProductId: id,
    observedAt: at,
    offersHash: `h:${sellers.join(',')}`,
    rows: sellers.map((sellerRef, i) => ({
      id: newId(),
      trackedProductId: id,
      observedAt: at,
      status: 'ok' as const,
      rank: i + 1,
      sellerName: sellerRef,
      sellerRef,
      price: 100_00n,
      finalPrice: 100_00n,
      offeredStock: null,
    })),
  });
}

describe('GET /api/tracked-products', () => {
  it('orders by review count, most first, and hides nobody-selling cards by default', async () => {
    await addProduct('Az', { ratingCount: 5, hasSellers: true });
    await addProduct('Çok', { ratingCount: 500, hasSellers: true });
    await addProduct('Taranmadı', { ratingCount: 50, hasSellers: null });
    await addProduct('Satıcısız', { ratingCount: 900, hasSellers: false });

    const body = await list();

    expect(body.products.map((p) => p.label)).toEqual(['Çok', 'Taranmadı', 'Az']);
    expect(body.total).toBe(3);
  });

  it('noSellerOnly=true returns only the nobody-selling cards', async () => {
    await addProduct('Satan', { hasSellers: true });
    await addProduct('Satıcısız', { hasSellers: false });

    const body = await list('?noSellerOnly=true');

    expect(body.products.map((p) => p.label)).toEqual(['Satıcısız']);
  });

  it('includeNoSeller=true returns every card', async () => {
    await addProduct('Satan', { hasSellers: true, ratingCount: 2 });
    await addProduct('Satıcısız', { hasSellers: false, ratingCount: 1 });

    const body = await list('?includeNoSeller=true');

    expect(body.products.map((p) => p.label)).toEqual(['Satan', 'Satıcısız']);
  });

  it('filters by seller on its marketplace and carries the 30-day count', async () => {
    const a = await addProduct('A');
    const b = await addProduct('B');
    const hb = await addProduct('HB', { marketplaceCode: 'HB' });
    await look(a, ['S1', 'S2']);
    await look(b, ['S2']);
    await look(hb, ['S1']);

    const body = await list('?sellerMarketplace=TY&sellerRef=S1');

    expect(body.products.map((p) => [p.label, p.sellerCount])).toEqual([['A', 2]]);
  });

  it('ignores a seller ref without its marketplace', async () => {
    const a = await addProduct('A');
    await addProduct('B');
    await look(a, ['S1']);

    const body = await list('?sellerRef=S1&sort=label');

    expect(body.products.map((p) => p.label)).toEqual(['A', 'B']);
  });

  it('filters by minSellerCount and sorts by sellerCount', async () => {
    const a = await addProduct('A');
    const b = await addProduct('B');
    const c = await addProduct('C');
    await look(a, ['S1', 'S2']);
    await look(b, ['S1', 'S2', 'S3']);
    await look(c, ['S1']);

    const body = await list('?minSellerCount=2&sort=sellerCount&sortDir=desc');

    expect(body.products.map((p) => [p.label, p.sellerCount])).toEqual([
      ['B', 3],
      ['A', 2],
    ]);
  });

  it('exports the 30-day seller count to CSV', async () => {
    const a = await addProduct('A');
    await look(a, ['S1', 'S2']);
    // Out of the 30-day window: not counted.
    await look(a, ['S9'], 40);

    const response = await GET(
      authedRequest('http://localhost/api/tracked-products?format=csv&columns=label,sellerCount'),
      routeContext(),
    );
    const text = await response.text();

    expect(text.replace('﻿', '').split('\n')).toEqual(['"Ürün","Satıcı Sayısı (30 gün)"', '"A","2"']);
  });
});

describe('GET /api/tracked-products/sellers', () => {
  it('lists sellers seen in 30 days with names and product counts', async () => {
    const a = await addProduct('A');
    const b = await addProduct('B');
    await look(a, ['S1', 'S2']);
    await look(b, ['S1']);
    await competitorSellersRepo.recordSeenSellers(appDb, [
      { id: newId(), marketplaceCode: 'TY', sellerRef: 'S1', sellerName: 'Birinci', seenAt: Date.now() },
    ]);

    const response = await GET_SELLERS(
      authedRequest('http://localhost/api/tracked-products/sellers?marketplaceCode=TY'),
      routeContext(),
    );
    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      sellers: [
        { marketplaceCode: 'TY', sellerRef: 'S1', sellerName: 'Birinci', productCount: 2 },
        { marketplaceCode: 'TY', sellerRef: 'S2', sellerName: null, productCount: 1 },
      ],
    });
  });
});
