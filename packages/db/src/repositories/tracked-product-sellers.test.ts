/**
 * `tracked_product_sellers` (2026-11-08, seller filters spec §4): which sellers a tracked product
 * has had, written on every successful look — changed or not — because the observation archive
 * is change-only and a "last 30 days" question over it misses a seller whose offers never moved.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as configRepo from './config.js';
import * as competitorSellersRepo from './competitor-sellers.js';
import * as trackedProductsRepo from './tracked-products.js';
import * as watchedBrandsRepo from './watched-brands.js';
import type { TrackedProductObservationRow } from './tracked-products.js';

const NOW = Date.UTC(2026, 10, 8);
const DAY = 86_400_000;

async function seedMarketplace(appDb: AppDatabase, code = 'TY'): Promise<void> {
  await configRepo.upsertMarketplace(appDb, {
    code,
    displayName: code,
    enabled: true,
    merchantRef: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function addProduct(appDb: AppDatabase, ref: string, marketplaceCode = 'TY'): Promise<string> {
  const id = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode,
    productRef: ref,
    productUrl: `/p-${ref}`,
    label: `Ürün ${ref}`,
    isActive: true,
    addedAt: NOW,
  });
  return id;
}

function offer(
  trackedProductId: string,
  observedAt: number,
  sellerRef: string | null,
  status: TrackedProductObservationRow['status'] = 'ok',
): TrackedProductObservationRow {
  return {
    id: newId(),
    trackedProductId,
    observedAt,
    status,
    rank: status === 'ok' ? 1 : null,
    sellerName: sellerRef,
    sellerRef,
    price: status === 'ok' ? 100_00n : null,
    finalPrice: status === 'ok' ? 100_00n : null,
    offeredStock: null,
  };
}

/** A successful look seeing the given sellers, under a hash derived from them. */
async function look(appDb: AppDatabase, id: string, at: number, sellers: (string | null)[]) {
  return trackedProductsRepo.recordTrackedProductLook(appDb, {
    trackedProductId: id,
    observedAt: at,
    offersHash: `h:${sellers.join(',')}`,
    rows: sellers.map((s) => offer(id, at, s)),
  });
}

for (const dialect of ALL_DIALECTS) {
  describe(`tracked product sellers — recording (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('records each ok seller of a look', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const id = await addProduct(db.appDb, '1');

      await look(db.appDb, id, NOW, ['S1', 'S2']);

      expect(await trackedProductsRepo.listTrackedProductSellers(db.appDb, id)).toEqual([
        { sellerRef: 'S1', firstSeenAt: NOW, lastSeenAt: NOW },
        { sellerRef: 'S2', firstSeenAt: NOW, lastSeenAt: NOW },
      ]);
    }, 30_000);

    it('advances last_seen_at on an unchanged look', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const id = await addProduct(db.appDb, '1');

      await look(db.appDb, id, NOW, ['S1']);
      const second = await look(db.appDb, id, NOW + 40 * DAY, ['S1']);

      expect(second.changed).toBe(false);
      const archive = await trackedProductsRepo.trackedProductObservationsSince(db.appDb, id, 0);
      expect(archive).toHaveLength(1);
      expect(await trackedProductsRepo.listTrackedProductSellers(db.appDb, id)).toEqual([
        { sellerRef: 'S1', firstSeenAt: NOW, lastSeenAt: NOW + 40 * DAY },
      ]);
    }, 30_000);

    it('never moves last_seen_at backwards', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const id = await addProduct(db.appDb, '1');

      await look(db.appDb, id, NOW + 2 * DAY, ['S1']);
      await look(db.appDb, id, NOW + 1 * DAY, ['S1']);

      expect(await trackedProductsRepo.listTrackedProductSellers(db.appDb, id)).toEqual([
        { sellerRef: 'S1', firstSeenAt: NOW + 2 * DAY, lastSeenAt: NOW + 2 * DAY },
      ]);
    }, 30_000);

    it('failed look writes nothing', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const id = await addProduct(db.appDb, '1');

      await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        trackedProductId: id,
        observedAt: NOW,
        offersHash: null,
        rows: [offer(id, NOW, 'S1', 'fetchFailed')],
      });

      expect(await trackedProductsRepo.listTrackedProductSellers(db.appDb, id)).toEqual([]);
    }, 30_000);

    it('noOffers look writes nothing', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const id = await addProduct(db.appDb, '1');

      await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        trackedProductId: id,
        observedAt: NOW,
        offersHash: 'empty',
        rows: [offer(id, NOW, null, 'noOffers')],
      });

      expect(await trackedProductsRepo.listTrackedProductSellers(db.appDb, id)).toEqual([]);
    }, 30_000);

    it('skips rows without seller_ref', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const id = await addProduct(db.appDb, '1');

      await look(db.appDb, id, NOW, [null, 'S1']);

      expect(await trackedProductsRepo.listTrackedProductSellers(db.appDb, id)).toEqual([
        { sellerRef: 'S1', firstSeenAt: NOW, lastSeenAt: NOW },
      ]);
    }, 30_000);
  });
}

/** A product with explicit list-screen fields, for the query tests. */
async function addListed(
  appDb: AppDatabase,
  ref: string,
  fields: {
    marketplaceCode?: string;
    hasSellers?: boolean | null;
    ratingCount?: number | null;
    watchedBrandId?: string;
  } = {},
): Promise<string> {
  const id = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode: fields.marketplaceCode ?? 'TY',
    productRef: ref,
    productUrl: `/p-${ref}`,
    label: `Ürün ${ref}`,
    isActive: true,
    addedAt: NOW,
    hasSellers: fields.hasSellers,
    ratingCount: fields.ratingCount,
    watchedBrandId: fields.watchedBrandId,
  });
  return id;
}

async function addBrand(appDb: AppDatabase, label: string): Promise<string> {
  const groupId = newId();
  await watchedBrandsRepo.createWatchedBrandGroup(appDb, {
    id: groupId,
    name: `${label} grubu`,
    note: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const brandId = newId();
  await watchedBrandsRepo.createWatchedBrand(appDb, {
    id: brandId,
    groupId,
    marketplaceCode: 'TY',
    label,
    brandRef: null,
    searchTerm: label.toLowerCase(),
    isActive: true,
    lastSweptAt: null,
    lastSweepProductCount: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return brandId;
}

const SINCE = NOW - 30 * DAY;
const PAGE = { limit: 50, offset: 0 } as const;

function labels(rows: readonly { label: string }[]): string[] {
  return rows.map((r) => r.label);
}

for (const dialect of ALL_DIALECTS) {
  describe(`tracked product sellers — list query (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('hideNoSeller keeps sellers and unscanned, drops nobody-selling', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      await addListed(db.appDb, '1', { hasSellers: true });
      await addListed(db.appDb, '2', { hasSellers: null });
      await addListed(db.appDb, '3', { hasSellers: false });

      const { rows, total } = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        ...PAGE,
        hideNoSeller: true,
      });

      expect(labels(rows)).toEqual(['Ürün 1', 'Ürün 2']);
      expect(total).toBe(2);
    }, 30_000);

    it('seller filter finds a seller unchanged for 40 days', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const id = await addListed(db.appDb, '1');
      await look(db.appDb, id, NOW - 40 * DAY, ['S1']);
      await look(db.appDb, id, NOW - 1 * DAY, ['S1']);

      const { rows } = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        ...PAGE,
        sellerSinceMs: SINCE,
        seller: { marketplaceCode: 'TY', sellerRef: 'S1' },
      });

      expect(labels(rows)).toEqual(['Ürün 1']);
      expect(rows[0]?.sellerCount).toBe(1);
    }, 30_000);

    it('seller filter excludes a seller last seen before the window', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const id = await addListed(db.appDb, '1');
      await look(db.appDb, id, NOW - 40 * DAY, ['S1']);

      const { rows, total } = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        ...PAGE,
        sellerSinceMs: SINCE,
        seller: { marketplaceCode: 'TY', sellerRef: 'S1' },
      });

      expect(rows).toEqual([]);
      expect(total).toBe(0);
    }, 30_000);

    it('seller filter does not cross marketplaces', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb, 'TY');
      await seedMarketplace(db.appDb, 'HB');
      const ty = await addListed(db.appDb, '1', { marketplaceCode: 'TY' });
      const hb = await addListed(db.appDb, '2', { marketplaceCode: 'HB' });
      await look(db.appDb, ty, NOW - DAY, ['S1']);
      await look(db.appDb, hb, NOW - DAY, ['S1']);

      const { rows } = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        ...PAGE,
        sellerSinceMs: SINCE,
        seller: { marketplaceCode: 'TY', sellerRef: 'S1' },
      });

      expect(labels(rows)).toEqual(['Ürün 1']);
    }, 30_000);

    it('minSellerCount counts distinct sellers in the window', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const a = await addListed(db.appDb, '1');
      const b = await addListed(db.appDb, '2');
      await look(db.appDb, a, NOW - 2 * DAY, ['S1', 'S2']);
      await look(db.appDb, a, NOW - DAY, ['S3']);
      await look(db.appDb, b, NOW - DAY, ['S1']);
      // Out of the window: does not count.
      await look(db.appDb, b, NOW - 40 * DAY, ['S9']);

      const { rows, total } = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        ...PAGE,
        sellerSinceMs: SINCE,
        minSellerCount: 2,
      });

      expect(labels(rows)).toEqual(['Ürün 1']);
      expect(rows[0]?.sellerCount).toBe(3);
      expect(total).toBe(1);
    }, 30_000);

    it('sorts by sellerCount desc, ties by label', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const c = await addListed(db.appDb, 'c');
      const a = await addListed(db.appDb, 'a');
      const b = await addListed(db.appDb, 'b');
      await addListed(db.appDb, 'z');
      await look(db.appDb, c, NOW - DAY, ['S1']);
      await look(db.appDb, a, NOW - DAY, ['S1']);
      await look(db.appDb, b, NOW - DAY, ['S1', 'S2']);

      const { rows } = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        ...PAGE,
        sellerSinceMs: SINCE,
        sort: 'sellerCount',
        sortDir: 'desc',
      });

      expect(rows.map((r) => [r.label, r.sellerCount])).toEqual([
        ['Ürün b', 2],
        ['Ürün a', 1],
        ['Ürün c', 1],
        ['Ürün z', 0],
      ]);
    }, 30_000);

    it('sorts by sellerCount asc with a product never seen first, counting only the window', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const a = await addListed(db.appDb, 'a');
      const b = await addListed(db.appDb, 'b');
      await addListed(db.appDb, 'z');
      await look(db.appDb, a, NOW - DAY, ['S1', 'S2']);
      await look(db.appDb, b, NOW - DAY, ['S1']);
      // Out of the window: three old sellers must not lift b above a.
      await look(db.appDb, b, NOW - 40 * DAY, ['S7', 'S8', 'S9']);

      const { rows, total } = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        ...PAGE,
        sellerSinceMs: SINCE,
        sort: 'sellerCount',
        sortDir: 'asc',
      });

      expect(rows.map((r) => [r.label, r.sellerCount])).toEqual([
        ['Ürün z', 0],
        ['Ürün b', 1],
        ['Ürün a', 2],
      ]);
      expect(total).toBe(3);
    }, 30_000);

    it('minSellerCount with the seller-count sort pages and totals over the filtered rows', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const a = await addListed(db.appDb, 'a');
      const b = await addListed(db.appDb, 'b');
      const c = await addListed(db.appDb, 'c');
      await addListed(db.appDb, 'z');
      await look(db.appDb, a, NOW - DAY, ['S1', 'S2', 'S3']);
      await look(db.appDb, b, NOW - DAY, ['S1', 'S2']);
      await look(db.appDb, c, NOW - DAY, ['S1']);

      const { rows, total } = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        ...PAGE,
        limit: 1,
        offset: 1,
        sellerSinceMs: SINCE,
        minSellerCount: 2,
        sort: 'sellerCount',
        sortDir: 'desc',
      });

      expect(rows.map((r) => [r.label, r.sellerCount])).toEqual([['Ürün b', 2]]);
      expect(total).toBe(2);
    }, 30_000);

    it('ties on rating count fall back to label', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      await addListed(db.appDb, 'b', { ratingCount: 10 });
      await addListed(db.appDb, 'a', { ratingCount: 10 });
      await addListed(db.appDb, 'c', { ratingCount: 50 });
      await addListed(db.appDb, 'n', { ratingCount: null });

      const { rows } = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        ...PAGE,
        sort: 'ratingCount',
        sortDir: 'desc',
      });

      expect(labels(rows)).toEqual(['Ürün c', 'Ürün a', 'Ürün b', 'Ürün n']);
    }, 30_000);

    it('latestTrackedProductObservationsFor matches the per-row function', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const a = await addListed(db.appDb, '1');
      const b = await addListed(db.appDb, '2');
      const never = await addListed(db.appDb, '3');
      await look(db.appDb, a, NOW - 2 * DAY, ['S1']);
      await look(db.appDb, a, NOW - DAY, ['S2', 'S1']);
      await look(db.appDb, b, NOW - DAY, ['S3']);

      const map = await trackedProductsRepo.latestTrackedProductObservationsFor(db.appDb, [a, b, never]);

      for (const id of [a, b]) {
        expect(map.get(id)).toEqual(await trackedProductsRepo.latestTrackedProductObservations(db.appDb, id));
      }
      expect(map.get(a)?.map((r) => r.sellerRef)).toEqual(['S2', 'S1']);
      expect(map.get(never) ?? []).toEqual([]);
    }, 30_000);

    it('trackedProductSellerOptions names, scopes and orders sellers', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb, 'TY');
      await seedMarketplace(db.appDb, 'HB');
      const brand = await addBrand(db.appDb, 'Whiskas');
      const other = await addBrand(db.appDb, 'Felix');
      const p1 = await addListed(db.appDb, '1', { watchedBrandId: brand });
      const p2 = await addListed(db.appDb, '2', { watchedBrandId: brand });
      const p3 = await addListed(db.appDb, '3', { watchedBrandId: other });
      const hb = await addListed(db.appDb, '4', { marketplaceCode: 'HB', watchedBrandId: brand });
      await look(db.appDb, p1, NOW - DAY, ['S1', 'S2']);
      await look(db.appDb, p2, NOW - DAY, ['S1']);
      await look(db.appDb, p3, NOW - DAY, ['S2', 'S3']);
      await look(db.appDb, hb, NOW - DAY, ['S1']);
      // Out of the window.
      await look(db.appDb, p2, NOW - 40 * DAY, ['S8']);
      await competitorSellersRepo.recordSeenSellers(db.appDb, [
        { id: newId(), marketplaceCode: 'TY', sellerRef: 'S1', sellerName: 'Birinci Mağaza', seenAt: NOW },
        { id: newId(), marketplaceCode: 'HB', sellerRef: 'S1', sellerName: 'HB Birinci', seenAt: NOW },
      ]);

      expect(
        await trackedProductsRepo.trackedProductSellerOptions(db.appDb, {
          sinceMs: SINCE,
          marketplaceCode: 'TY',
        }),
      ).toEqual([
        { marketplaceCode: 'TY', sellerRef: 'S1', sellerName: 'Birinci Mağaza', productCount: 2 },
        { marketplaceCode: 'TY', sellerRef: 'S2', sellerName: null, productCount: 2 },
        { marketplaceCode: 'TY', sellerRef: 'S3', sellerName: null, productCount: 1 },
      ]);
      expect(
        await trackedProductsRepo.trackedProductSellerOptions(db.appDb, {
          sinceMs: SINCE,
          watchedBrandId: brand,
        }),
      ).toEqual([
        { marketplaceCode: 'TY', sellerRef: 'S1', sellerName: 'Birinci Mağaza', productCount: 2 },
        { marketplaceCode: 'HB', sellerRef: 'S1', sellerName: 'HB Birinci', productCount: 1 },
        { marketplaceCode: 'TY', sellerRef: 'S2', sellerName: null, productCount: 1 },
      ]);
    }, 30_000);
  });
}
