/**
 * The brand module's work queues (brand roadmap §6.8, §6.9) across all three dialects: the linked
 * cards the availability check reads, and the own-brand cards no brand product claims yet.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as brandProductsRepo from './brand-products.js';
import * as brandQueuesRepo from './brand-queues.js';
import * as configRepo from './config.js';
import * as trackedProductsRepo from './tracked-products.js';
import * as watchedBrandsRepo from './watched-brands.js';

const NOW = Date.UTC(2026, 10, 20);
const DAY = 86_400_000;

async function seed(appDb: AppDatabase): Promise<void> {
  await configRepo.upsertMarketplace(appDb, {
    code: 'trendyol',
    displayName: 'Trendyol',
    enabled: true,
    merchantRef: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await watchedBrandsRepo.createWatchedBrandGroup(appDb, { id: 'g1', name: 'Mars', note: null, createdAt: NOW, updatedAt: NOW });
  const brand = (id: string, isOwnBrand: boolean) =>
    watchedBrandsRepo.createWatchedBrand(appDb, {
      id,
      groupId: 'g1',
      marketplaceCode: 'trendyol',
      label: id,
      brandRef: id,
      searchTerm: null,
      isActive: true,
      isOwnBrand,
      lastSweptAt: null,
      lastSweepProductCount: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  await brand('own', true);
  await brand('rival', false);

  const card = (id: string, watchedBrandId: string | null, extra: Partial<trackedProductsRepo.TrackedProductRow> = {}) =>
    trackedProductsRepo.addTrackedProduct(appDb, {
      id,
      marketplaceCode: 'trendyol',
      productRef: id,
      productUrl: `/x-p-${id}`,
      label: `Kart ${id}`,
      isActive: true,
      addedAt: NOW - 30 * DAY,
      watchedBrandId,
      ...extra,
    });
  await card('linked', 'own', { hasSellers: false, ratingCount: 900, lastScrapedAt: NOW });
  await card('popular', 'own', { ratingCount: 500, addedAt: NOW - DAY });
  await card('quiet', 'own', { ratingCount: 3 });
  await card('unrated', 'own', { ratingCount: null });
  await card('rivals', 'rival', { ratingCount: 9999 });
  await card('manual', null, { ratingCount: 9999 });

  await brandProductsRepo.insertBrandProduct(appDb, {
    id: 'bp1',
    name: 'Ton 85g',
    referencePrice: 100_00n,
    minPrice: null,
    maxPrice: null,
    barcode: null,
    source: 'manual',
    referencePriceSource: null,
    unitPrice: null,
    desi: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const linked = await brandProductsRepo.linkCard(appDb, {
    id: 'c1',
    brandProductId: 'bp1',
    trackedProductId: 'linked',
    unitMultiplier: 2,
    isPrimary: true,
    linkSource: 'manual',
    linkedAt: NOW,
  });
  expect(linked.ok).toBe(true);
}

for (const dialect of ALL_DIALECTS) {
  describe(`brand queues (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('lists every linked card with its product, shelf state and brand scope', async () => {
      db = await createTestDb(dialect);
      await seed(db.appDb);
      expect(await brandQueuesRepo.linkedCardsForAvailability(db.appDb)).toEqual([
        {
          trackedProductId: 'linked',
          label: 'Kart linked',
          productUrl: '/x-p-linked',
          marketplaceCode: 'trendyol',
          brandName: null,
          hasSellers: false,
          lastSellerSeenAt: null,
          lastScrapedAt: NOW,
          ratingCount: 900,
          watchedBrandId: 'own',
          watchedBrandGroupId: 'g1',
          brandProductId: 'bp1',
          brandProductName: 'Ton 85g',
          unitMultiplier: 2,
        },
      ]);
    });

    it('queues own-brand cards no product claims, most reviewed first, and forgets dismissed ones', async () => {
      db = await createTestDb(dialect);
      await seed(db.appDb);

      const first = await brandQueuesRepo.queryUnmatchedCards(db.appDb, { limit: 50, offset: 0, newSinceMs: NOW - 7 * DAY });
      // Not the linked card, not the rival brand's, not one pasted by hand; unrated last.
      expect(first.rows.map((r) => r.id)).toEqual(['popular', 'quiet', 'unrated']);
      expect(first.total).toBe(3);
      expect(first.newCount).toBe(1);
      expect(first.rows[0]).toMatchObject({ watchedBrandLabel: 'own', ratingCount: 500, addedAt: NOW - DAY });

      await brandQueuesRepo.setQueueDismissed(db.appDb, ['quiet'], NOW);
      const second = await brandQueuesRepo.queryUnmatchedCards(db.appDb, { limit: 50, offset: 0, newSinceMs: NOW - 7 * DAY });
      expect(second.rows.map((r) => r.id)).toEqual(['popular', 'unrated']);
      expect(second.total).toBe(2);

      const dismissed = await brandQueuesRepo.queryUnmatchedCards(db.appDb, {
        limit: 50,
        offset: 0,
        newSinceMs: NOW - 7 * DAY,
        dismissed: true,
      });
      expect(dismissed.rows.map((r) => r.id)).toEqual(['quiet']);

      await brandQueuesRepo.setQueueDismissed(db.appDb, ['quiet'], null);
      expect((await brandQueuesRepo.queryUnmatchedCards(db.appDb, { limit: 50, offset: 0, newSinceMs: 0 })).total).toBe(3);
    });

    it('suggests a brand product by barcode', async () => {
      db = await createTestDb(dialect);
      await seed(db.appDb);
      await brandProductsRepo.updateBrandProduct(db.appDb, 'bp1', { barcode: '8690000000017' }, NOW);
      const found = await brandQueuesRepo.brandProductsByBarcodes(db.appDb, ['8690000000017', 'nope']);
      expect(found.get('8690000000017')).toEqual([{ id: 'bp1', name: 'Ton 85g' }]);
      expect(found.has('nope')).toBe(false);
    });

    // Review 2026-11-25 O4: a 737-card queue had no search and no brand filter.
    it('narrows the queue by text and by brand', async () => {
      db = await createTestDb(dialect);
      await seed(db.appDb);
      const byText = await brandQueuesRepo.queryUnmatchedCards(db.appDb, { limit: 50, offset: 0, newSinceMs: 0, text: 'popu' });
      expect(byText.rows.map((r) => r.id)).toEqual(['popular']);
      expect(byText.total).toBe(1);
      const byRef = await brandQueuesRepo.queryUnmatchedCards(db.appDb, { limit: 50, offset: 0, newSinceMs: 0, text: 'quiet' });
      expect(byRef.rows.map((r) => r.id)).toEqual(['quiet']);
      const byBrand = await brandQueuesRepo.queryUnmatchedCards(db.appDb, {
        limit: 50,
        offset: 0,
        newSinceMs: 0,
        watchedBrandId: 'rival',
      });
      expect(byBrand.total).toBe(0);
    });

    it('pages the queue', async () => {
      db = await createTestDb(dialect);
      await seed(db.appDb);
      const page = await brandQueuesRepo.queryUnmatchedCards(db.appDb, { limit: 1, offset: 1, newSinceMs: 0 });
      expect(page.rows.map((r) => r.id)).toEqual(['quiet']);
      expect(page.total).toBe(3);
    });
  });
}
