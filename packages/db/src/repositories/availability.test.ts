/**
 * Availability — whether anybody is selling a tracked product at all (2026-09-03).
 *
 * Across all three dialects, because a **nullable boolean** is the one column type these engines
 * disagree about most: SQLite stores 0/1 in an integer column, PostgreSQL has a real `boolean`,
 * and MySQL a `tinyint`. The three-state reading — sold / not sold / never looked — is the whole
 * point of the feature, and it is exactly what a per-engine truthiness difference would break.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as configRepo from './config.js';
import * as trackedProductsRepo from './tracked-products.js';
import * as watchedBrandsRepo from './watched-brands.js';

const NOW = Date.UTC(2026, 8, 3);
const MARKETPLACE = 'TY';

async function seedMarketplace(appDb: AppDatabase): Promise<void> {
  await configRepo.upsertMarketplace(appDb, {
    code: MARKETPLACE,
    displayName: 'Trendyol',
    enabled: true,
    merchantRef: 'merchant-1',
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function addBrand(appDb: AppDatabase): Promise<string> {
  const groupId = newId();
  await watchedBrandsRepo.createWatchedBrandGroup(appDb, {
    id: groupId,
    name: 'Mars',
    note: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const brandId = newId();
  await watchedBrandsRepo.createWatchedBrand(appDb, {
    id: brandId,
    groupId,
    marketplaceCode: MARKETPLACE,
    label: 'Whiskas',
    brandRef: null,
    searchTerm: 'whiskas',
    isActive: true,
    lastSweptAt: null,
    lastSweepProductCount: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return brandId;
}

async function addProduct(appDb: AppDatabase, ref: string, watchedBrandId?: string): Promise<string> {
  const id = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode: MARKETPLACE,
    productRef: ref,
    productUrl: `/p-${ref}`,
    label: `Ürün ${ref}`,
    isActive: true,
    addedAt: NOW,
    watchedBrandId,
  });
  return id;
}

/** A look with one seller on the page. */
function offerRows(trackedProductId: string, observedAt: number) {
  return [
    {
      id: newId(),
      trackedProductId,
      observedAt,
      status: 'ok' as const,
      rank: 1,
      sellerName: 'Bir Mağaza',
      sellerRef: 'seller-a',
      price: 100_00n,
      finalPrice: 100_00n,
      offeredStock: 5,
    },
  ];
}

/** A look that succeeded and found nobody — one `noOffers` row, no seller, no price. */
function emptyRows(trackedProductId: string, observedAt: number) {
  return [
    {
      id: newId(),
      trackedProductId,
      observedAt,
      status: 'noOffers' as const,
      rank: null,
      sellerName: null,
      sellerRef: null,
      price: null,
      finalPrice: null,
      offeredStock: null,
    },
  ];
}

for (const dialect of ALL_DIALECTS) {
  describe(`availability (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('records that somebody is selling, and when they were last seen', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const id = await addProduct(db.appDb, '1');

      await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        trackedProductId: id,
        observedAt: NOW,
        offersHash: 'h1',
        rows: offerRows(id, NOW),
      });

      const row = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(row?.hasSellers).toBe(true);
      expect(row?.lastSellerSeenAt).toBe(NOW);
    }, 30_000);

    it('records an empty page as nobody selling, and leaves the last-seen date where it was', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const id = await addProduct(db.appDb, '1');

      await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        trackedProductId: id,
        observedAt: NOW - 1_000,
        offersHash: 'h1',
        rows: offerRows(id, NOW - 1_000),
      });
      await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        trackedProductId: id,
        observedAt: NOW,
        offersHash: 'h-empty',
        rows: emptyRows(id, NOW),
      });

      const row = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(row?.hasSellers).toBe(false);
      // The date answers "when was a seller last on the page", so it must not follow a look
      // that found none — otherwise "how long has this been unsold" is always zero.
      expect(row?.lastSellerSeenAt).toBe(NOW - 1_000);
    }, 30_000);

    /**
     * The failure this feature would be worthless without. A page we could not fetch is not
     * evidence that nobody is selling, and writing `false` on it would turn every network blip
     * into a lost-shelf finding.
     */
    it('leaves availability untouched when the look failed', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const id = await addProduct(db.appDb, '1');

      await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        trackedProductId: id,
        observedAt: NOW - 1_000,
        offersHash: 'h1',
        rows: offerRows(id, NOW - 1_000),
      });
      await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        trackedProductId: id,
        observedAt: NOW,
        offersHash: null,
        rows: [
          {
            id: newId(),
            trackedProductId: id,
            observedAt: NOW,
            status: 'fetchFailed' as const,
            rank: null,
            sellerName: null,
            sellerRef: null,
            price: null,
            finalPrice: null,
            offeredStock: null,
          },
        ],
      });

      const row = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(row?.hasSellers).toBe(true);
    }, 30_000);

    /**
     * Since Faz 4 an unchanged look stores nothing at all, so the flag has to come off the
     * look's own rows rather than off what was written — otherwise a product with three stable
     * sellers would read as unsold the moment its price stopped moving.
     */
    it('keeps the flag true through a look that stored nothing because nothing changed', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const id = await addProduct(db.appDb, '1');
      const look = { trackedProductId: id, offersHash: 'same' };

      await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        ...look,
        observedAt: NOW - 1_000,
        rows: offerRows(id, NOW - 1_000),
      });
      const second = await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        ...look,
        observedAt: NOW,
        rows: offerRows(id, NOW),
      });

      expect(second.changed).toBe(false);
      const row = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(row?.hasSellers).toBe(true);
      expect(row?.lastSellerSeenAt).toBe(NOW);
    }, 30_000);

    it('counts sold, unsold and never-looked apart, per watched brand', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const brandId = await addBrand(db.appDb);
      const sold = await addProduct(db.appDb, 'sold', brandId);
      const unsold = await addProduct(db.appDb, 'unsold', brandId);
      await addProduct(db.appDb, 'never-looked', brandId);

      await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        trackedProductId: sold,
        observedAt: NOW,
        offersHash: 'a',
        rows: offerRows(sold, NOW),
      });
      await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        trackedProductId: unsold,
        observedAt: NOW,
        offersHash: 'b',
        rows: emptyRows(unsold, NOW),
      });

      const [counts] = await watchedBrandsRepo.watchedBrandCounts(db.appDb);
      expect(counts).toMatchObject({
        productCount: 3,
        noSellerCount: 1,
        // Never looked at is its own state: a rotation that has not reached a product must not
        // be reported as a product nobody sells.
        neverLookedCount: 1,
      });
    }, 30_000);

    it('lists only the products nobody is selling, never the ones nobody has looked at', async () => {
      db = await createTestDb(dialect);
      await seedMarketplace(db.appDb);
      const unsold = await addProduct(db.appDb, 'unsold');
      await addProduct(db.appDb, 'never-looked');

      await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        trackedProductId: unsold,
        observedAt: NOW,
        offersHash: 'b',
        rows: emptyRows(unsold, NOW),
      });

      const page = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        noSellerOnly: true,
        limit: 10,
        offset: 0,
      });
      expect(page.rows.map((r) => r.productRef)).toEqual(['unsold']);
    }, 30_000);
  });
}
