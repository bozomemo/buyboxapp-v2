/**
 * Reference prices — the brand owner's own list price on a tracked product (2026-09-03).
 *
 * Across all three dialects, because the two things this leans on differ per engine: money is a
 * sortable text encoding on SQLite and a native `bigint` on the other two, and the barcode is a
 * `varchar(32)` on MySQL against `text` elsewhere. A price that round-trips as a string on one
 * engine and a number on another is exactly the bug the money rule exists to prevent.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as configRepo from './config.js';
import * as productBarcodesRepo from './product-barcodes.js';
import * as trackedProductsRepo from './tracked-products.js';

const NOW = Date.UTC(2026, 8, 3);

async function seedMarketplaces(appDb: AppDatabase): Promise<void> {
  for (const [code, name] of [
    ['TY', 'Trendyol'],
    ['HB', 'Hepsiburada'],
  ] as const) {
    await configRepo.upsertMarketplace(appDb, {
      code,
      displayName: name,
      enabled: true,
      merchantRef: 'merchant-1',
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
}

async function addProduct(
  appDb: AppDatabase,
  marketplaceCode: string,
  productRef: string,
  barcode?: string,
): Promise<string> {
  const id = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode,
    productRef,
    productUrl: `/urun-${productRef}`,
    label: `Ürün ${productRef}`,
    isActive: true,
    addedAt: NOW,
  });
  if (barcode !== undefined) await productBarcodesRepo.setProductBarcode(appDb, id, barcode, NOW);
  return id;
}

for (const dialect of ALL_DIALECTS) {
  describe(`reference prices (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('writes a price matched by product ref, with its source and the date it was read', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const id = await addProduct(db.appDb, 'TY', '757251065');

      const result = await trackedProductsRepo.applyReferencePrices(
        db.appDb,
        [{ barcode: null, marketplaceCode: 'TY', productRef: '757251065', referencePrice: 249_90n }],
        'mars-fiyat-listesi.csv',
        NOW,
      );

      expect(result).toEqual({ productsMatched: 1, linesUnmatched: 0 });
      const stored = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(stored?.referencePrice).toBe(249_90n);
      expect(stored?.referencePriceSource).toBe('mars-fiyat-listesi.csv');
      expect(stored?.referencePriceUpdatedAt).toBe(NOW);
    }, 30_000);

    /**
     * The reason a barcode line carries no marketplace. One line of a brand's list is one
     * article, and the article is the same on both marketplaces — so the price has to land on
     * both rows, or the cross-marketplace screen would report a violation on one and silence on
     * the other for the same product at the same price.
     */
    it('prices a barcode on every marketplace that tracks it', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const ty = await addProduct(db.appDb, 'TY', '1', '8690632000015');
      const hb = await addProduct(db.appDb, 'HB', 'HBCV1', '8690632000015');

      const result = await trackedProductsRepo.applyReferencePrices(
        db.appDb,
        [{ barcode: '8690632000015', marketplaceCode: null, productRef: null, referencePrice: 100_00n }],
        null,
        NOW,
      );

      expect(result.productsMatched).toBe(2);
      expect((await trackedProductsRepo.getTrackedProduct(db.appDb, ty))?.referencePrice).toBe(100_00n);
      expect((await trackedProductsRepo.getTrackedProduct(db.appDb, hb))?.referencePrice).toBe(100_00n);
    }, 30_000);

    it('never matches a ref against another marketplace', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const hb = await addProduct(db.appDb, 'HB', '757251065');

      const result = await trackedProductsRepo.applyReferencePrices(
        db.appDb,
        [{ barcode: null, marketplaceCode: 'TY', productRef: '757251065', referencePrice: 10_00n }],
        null,
        NOW,
      );

      expect(result).toEqual({ productsMatched: 0, linesUnmatched: 1 });
      expect((await trackedProductsRepo.getTrackedProduct(db.appDb, hb))?.referencePrice ?? null).toBeNull();
    }, 30_000);

    /**
     * A brand's list covers its whole catalogue; the tracked set covers what a sweep found. A
     * partial match is normal — and has to be *reported*, because "no products are below the
     * list price" is meaningless when most of the list matched nothing.
     */
    it('counts the lines that matched nothing rather than reporting a clean import', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      await addProduct(db.appDb, 'TY', 'known');

      const result = await trackedProductsRepo.applyReferencePrices(
        db.appDb,
        [
          { barcode: null, marketplaceCode: 'TY', productRef: 'known', referencePrice: 10_00n },
          { barcode: null, marketplaceCode: 'TY', productRef: 'unknown', referencePrice: 20_00n },
          { barcode: '999', marketplaceCode: null, productRef: null, referencePrice: 30_00n },
        ],
        null,
        NOW,
      );

      expect(result).toEqual({ productsMatched: 1, linesUnmatched: 2 });
    }, 30_000);

    it('overwrites a previous list price, since a new list replaces the old one', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const id = await addProduct(db.appDb, 'TY', '1');

      const line = { barcode: null, marketplaceCode: 'TY', productRef: '1' };
      await trackedProductsRepo.applyReferencePrices(
        db.appDb,
        [{ ...line, referencePrice: 10_00n }],
        'eski.csv',
        NOW,
      );
      await trackedProductsRepo.applyReferencePrices(
        db.appDb,
        [{ ...line, referencePrice: 12_50n }],
        'yeni.csv',
        NOW + 1_000,
      );

      const stored = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(stored?.referencePrice).toBe(12_50n);
      expect(stored?.referencePriceSource).toBe('yeni.csv');
      expect(stored?.referencePriceUpdatedAt).toBe(NOW + 1_000);
    }, 30_000);

    it('clears the price, its source and its date together', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const id = await addProduct(db.appDb, 'TY', '1');
      await trackedProductsRepo.applyReferencePrices(
        db.appDb,
        [{ barcode: null, marketplaceCode: 'TY', productRef: '1', referencePrice: 10_00n }],
        'liste.csv',
        NOW,
      );

      await trackedProductsRepo.clearReferencePrices(db.appDb, [id]);

      const stored = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(stored?.referencePrice ?? null).toBeNull();
      expect(stored?.referencePriceSource ?? null).toBeNull();
      expect(stored?.referencePriceUpdatedAt ?? null).toBeNull();
    }, 30_000);

    it('reports coverage, which is what makes "no violations" mean anything', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      await addProduct(db.appDb, 'TY', 'a');
      await addProduct(db.appDb, 'TY', 'b');
      await addProduct(db.appDb, 'TY', 'c');
      await trackedProductsRepo.applyReferencePrices(
        db.appDb,
        [{ barcode: null, marketplaceCode: 'TY', productRef: 'a', referencePrice: 10_00n }],
        null,
        NOW,
      );

      expect(await trackedProductsRepo.referencePriceCoverage(db.appDb)).toEqual({ withPrice: 1, total: 3 });
    }, 30_000);

    it('does nothing, and says so, for an empty list', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);

      expect(await trackedProductsRepo.applyReferencePrices(db.appDb, [], 'bos.csv', NOW)).toEqual({
        productsMatched: 0,
        linesUnmatched: 0,
      });
    }, 30_000);
  });
}
