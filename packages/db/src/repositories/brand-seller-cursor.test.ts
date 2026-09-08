/**
 * The cursor `ScrapeBrandSellers` walks (doc 07 §7.3) — `listBrandProductsToScrape` /
 * `countBrandProductsToScrape`.
 *
 * Across all three dialects, because the ordering is exactly the trap `trackedOrderBy` in
 * `tracked-products.ts` documents: `last_scraped_at` is nullable, "never looked at" must come
 * **first**, and the three engines disagree about where nulls land. A cursor that put the
 * never-looked products last would still terminate — it just would not read them until every
 * other product of the brand had been re-read, which on a 5,000-product brand is the whole run.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as configRepo from './config.js';
import * as trackedProductsRepo from './tracked-products.js';
import * as watchedBrandsRepo from './watched-brands.js';

const NOW = Date.UTC(2026, 8, 8);

async function seedBrand(appDb: AppDatabase, label: string): Promise<string> {
  const groupId = newId();
  await watchedBrandsRepo.createWatchedBrandGroup(appDb, {
    id: groupId,
    name: `grup-${label}`,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const id = newId();
  await watchedBrandsRepo.createWatchedBrand(appDb, {
    id,
    groupId,
    marketplaceCode: 'TY',
    label,
    brandRef: null,
    searchTerm: label,
    isActive: true,
    lastSweptAt: null,
    lastSweepProductCount: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

async function addProduct(
  appDb: AppDatabase,
  brandId: string | null,
  productRef: string,
  extra: { lastScrapedAt?: number | null; isActive?: boolean } = {},
): Promise<string> {
  const id = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode: 'TY',
    productRef,
    productUrl: `/urun-${productRef}`,
    label: `Ürün ${productRef}`,
    isActive: extra.isActive ?? true,
    addedAt: NOW,
    watchedBrandId: brandId,
    lastScrapedAt: extra.lastScrapedAt ?? null,
  });
  return id;
}

for (const dialect of ALL_DIALECTS) {
  describe(`brand seller scrape cursor (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    async function setup(): Promise<{ appDb: AppDatabase; brandId: string }> {
      db = await createTestDb(dialect);
      await configRepo.upsertMarketplace(db.appDb, {
        code: 'TY',
        displayName: 'Trendyol',
        enabled: true,
        merchantRef: 'merchant-1',
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { appDb: db.appDb, brandId: await seedBrand(db.appDb, 'Acana') };
    }

    it('returns never-looked products first, then the oldest look', async () => {
      const { appDb, brandId } = await setup();
      await addProduct(appDb, brandId, 'recent', { lastScrapedAt: NOW - 1_000 });
      await addProduct(appDb, brandId, 'old', { lastScrapedAt: NOW - 90_000 });
      await addProduct(appDb, brandId, 'never');

      const page = await trackedProductsRepo.listBrandProductsToScrape(appDb, {
        marketplaceCode: 'TY',
        watchedBrandId: brandId,
        notScrapedSinceMs: NOW,
        limit: 10,
      });

      expect(page.map((p) => p.productRef)).toEqual(['never', 'old', 'recent']);
    }, 30_000);

    it('drops a product the run has already looked at, which is what makes the walk terminate', async () => {
      const { appDb, brandId } = await setup();
      await addProduct(appDb, brandId, 'done', { lastScrapedAt: NOW + 5 });
      await addProduct(appDb, brandId, 'todo');

      const page = await trackedProductsRepo.listBrandProductsToScrape(appDb, {
        marketplaceCode: 'TY',
        watchedBrandId: brandId,
        notScrapedSinceMs: NOW,
        limit: 10,
      });

      expect(page.map((p) => p.productRef)).toEqual(['todo']);
      expect(
        await trackedProductsRepo.countBrandProductsToScrape(appDb, {
          marketplaceCode: 'TY',
          watchedBrandId: brandId,
          notScrapedSinceMs: NOW,
        }),
      ).toBe(1);
    }, 30_000);

    it('reads only this brand, and only what the operator has left active', async () => {
      const { appDb, brandId } = await setup();
      const otherBrandId = await seedBrand(appDb, 'Whiskas');
      await addProduct(appDb, brandId, 'mine');
      await addProduct(appDb, brandId, 'paused', { isActive: false });
      await addProduct(appDb, otherBrandId, 'theirs');
      await addProduct(appDb, null, 'unattributed');

      const page = await trackedProductsRepo.listBrandProductsToScrape(appDb, {
        marketplaceCode: 'TY',
        watchedBrandId: brandId,
        notScrapedSinceMs: NOW,
        limit: 10,
      });

      expect(page.map((p) => p.productRef)).toEqual(['mine']);
    }, 30_000);

    it('honours the page limit while the count reports the whole remainder', async () => {
      const { appDb, brandId } = await setup();
      for (let i = 0; i < 5; i += 1) await addProduct(appDb, brandId, `p-${i}`);

      const page = await trackedProductsRepo.listBrandProductsToScrape(appDb, {
        marketplaceCode: 'TY',
        watchedBrandId: brandId,
        notScrapedSinceMs: NOW,
        limit: 2,
      });

      expect(page).toHaveLength(2);
      expect(
        await trackedProductsRepo.countBrandProductsToScrape(appDb, {
          marketplaceCode: 'TY',
          watchedBrandId: brandId,
          notScrapedSinceMs: NOW,
        }),
      ).toBe(5);
    }, 30_000);
  });
}
