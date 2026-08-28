/**
 * Barcodes and the cross-marketplace match (doc 06 §12.5, Faz 8).
 *
 * Across all three dialects, because the pieces that differ per engine are exactly the ones
 * this feature leans on: a self-join through an alias, the conditional-count coverage query, and
 * a `varchar(32)` barcode on MySQL against `text` elsewhere.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as configRepo from './config.js';
import * as productBarcodesRepo from './product-barcodes.js';
import * as trackedProductsRepo from './tracked-products.js';

const NOW = Date.UTC(2026, 7, 28);

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
  overrides: Partial<{ label: string; isActive: boolean; lastSweptAt: number }> = {},
): Promise<string> {
  const id = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode,
    productRef,
    productUrl: `/urun-${productRef}`,
    label: overrides.label ?? `Ürün ${productRef}`,
    isActive: overrides.isActive ?? true,
    addedAt: NOW,
    lastSweptAt: overrides.lastSweptAt ?? NOW,
  });
  return id;
}

for (const dialect of ALL_DIALECTS) {
  describe(`product barcodes (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('offers products nobody has asked about, freshest sweep first', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      await addProduct(db.appDb, 'HB', 'HBCV1', { lastSweptAt: NOW - 5_000 });
      await addProduct(db.appDb, 'HB', 'HBCV2', { lastSweptAt: NOW });

      const targets = await productBarcodesRepo.barcodeTargets(db.appDb, 'HB', 10);
      expect(targets.map((t) => t.productRef)).toEqual(['HBCV2', 'HBCV1']);
      expect(targets[0]!.productUrl).toBe('/urun-HBCV2');
    }, 30_000);

    it('stops offering a product once it has been asked, even when the page stated no barcode', async () => {
      // The distinction the two columns exist for. Filtering on `barcode is null` instead would
      // re-ask the hopeless products every night, for ever, at four requests a minute.
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const id = await addProduct(db.appDb, 'HB', 'HBCV1');

      await productBarcodesRepo.setProductBarcode(db.appDb, id, null, NOW);
      expect(await productBarcodesRepo.barcodeTargets(db.appDb, 'HB', 10)).toHaveLength(0);
    }, 30_000);

    it('never offers a product from another marketplace or an inactive one', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      await addProduct(db.appDb, 'TY', '111');
      await addProduct(db.appDb, 'HB', 'HBCV1', { isActive: false });

      expect(await productBarcodesRepo.barcodeTargets(db.appDb, 'HB', 10)).toHaveLength(0);
    }, 30_000);

    it('stores a barcode and puts a product back on the list only when asked to', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const id = await addProduct(db.appDb, 'HB', 'HBCV1');

      await productBarcodesRepo.setProductBarcode(db.appDb, id, '8681002995109', NOW);
      const stored = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(stored?.barcode).toBe('8681002995109');

      await productBarcodesRepo.clearBarcodeResolution(db.appDb, id);
      const targets = await productBarcodesRepo.barcodeTargets(db.appDb, 'HB', 10);
      expect(targets).toHaveLength(1);
    }, 30_000);

    it('stores a blank barcode as null rather than as an empty string', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const id = await addProduct(db.appDb, 'HB', 'HBCV1');

      await productBarcodesRepo.setProductBarcode(db.appDb, id, '   ', NOW);
      const stored = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(stored?.barcode).toBeNull();
    }, 30_000);

    it('reports coverage so the size of the gap is a number and not an impression', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const withBarcode = await addProduct(db.appDb, 'HB', 'HBCV1');
      const withoutBarcode = await addProduct(db.appDb, 'HB', 'HBCV2');
      await addProduct(db.appDb, 'HB', 'HBCV3');

      await productBarcodesRepo.setProductBarcode(db.appDb, withBarcode, '8681002995109', NOW);
      await productBarcodesRepo.setProductBarcode(db.appDb, withoutBarcode, null, NOW);

      expect(await productBarcodesRepo.barcodeCoverage(db.appDb, 'HB')).toEqual({
        total: 3,
        resolved: 1,
        statedNone: 1,
        failed: 0,
        pending: 1,
      });
    }, 30_000);

    it('counts a product that failed its way off the list as failed, not as pending', async () => {
      // "Nobody will ask about this again" and "its turn has not come" are different facts, and
      // only the second is something waiting to happen.
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const id = await addProduct(db.appDb, 'HB', 'HBCV1');
      for (let i = 0; i < productBarcodesRepo.BARCODE_MAX_ATTEMPTS; i += 1) {
        await productBarcodesRepo.recordBarcodeAttemptFailed(db.appDb, id);
      }

      expect(await productBarcodesRepo.barcodeCoverage(db.appDb, 'HB')).toEqual({
        total: 1,
        resolved: 0,
        statedNone: 0,
        failed: 1,
        pending: 0,
      });
    }, 30_000);

    it('drops a product off the work list once it has failed its ceiling', async () => {
      // The starvation guard: without it these rows sit at the head of every run for ever, and a
      // job that stops on consecutive failures never gets past them.
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const broken = await addProduct(db.appDb, 'HB', 'HBCV-broken');
      await addProduct(db.appDb, 'HB', 'HBCV-fresh');
      for (let i = 0; i < productBarcodesRepo.BARCODE_MAX_ATTEMPTS; i += 1) {
        await productBarcodesRepo.recordBarcodeAttemptFailed(db.appDb, broken);
      }

      const targets = await productBarcodesRepo.barcodeTargets(db.appDb, 'HB', 10);
      expect(targets.map((t) => t.productRef)).toEqual(['HBCV-fresh']);
    }, 30_000);

    it('puts a product that has failed once behind one that has never been asked', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      // The failed one was swept most recently, so date ordering alone would put it first.
      const failedOnce = await addProduct(db.appDb, 'HB', 'HBCV-failed', { lastSweptAt: NOW });
      await addProduct(db.appDb, 'HB', 'HBCV-untried', { lastSweptAt: NOW - 5_000 });
      await productBarcodesRepo.recordBarcodeAttemptFailed(db.appDb, failedOnce);

      const targets = await productBarcodesRepo.barcodeTargets(db.appDb, 'HB', 10);
      expect(targets.map((t) => t.productRef)).toEqual(['HBCV-untried', 'HBCV-failed']);
    }, 30_000);

    it('forgets the failures once a read finally answers', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const id = await addProduct(db.appDb, 'HB', 'HBCV1');
      await productBarcodesRepo.recordBarcodeAttemptFailed(db.appDb, id);
      await productBarcodesRepo.recordBarcodeAttemptFailed(db.appDb, id);
      await productBarcodesRepo.setProductBarcode(db.appDb, id, '8681002995109', NOW);

      const stored = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(stored?.barcodeAttempts).toBe(0);
    }, 30_000);

    it('matches the same product across two marketplaces on its barcode', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const ty = await addProduct(db.appDb, 'TY', '844564577', { label: 'Whiskas 24x85g' });
      const hb = await addProduct(db.appDb, 'HB', 'HBCV00006POXK3', { label: 'Whiskas Tavuklu' });
      await productBarcodesRepo.setProductBarcode(db.appDb, ty, '8681002995109', NOW);
      await productBarcodesRepo.setProductBarcode(db.appDb, hb, '8681002995109', NOW);

      const matches = await productBarcodesRepo.crossMarketplaceMatches(db.appDb, 'TY', 'HB', 50);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        barcode: '8681002995109',
        leftProductRef: '844564577',
        rightProductRef: 'HBCV00006POXK3',
        rightLabel: 'Whiskas Tavuklu',
      });
    }, 30_000);

    it('matches nothing on a name, however alike two products look', async () => {
      // The rule the report rests on: no barcode, no row. A brand owner acts on these.
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const ty = await addProduct(db.appDb, 'TY', '844564577', { label: 'Whiskas Tavuklu 24x85 g' });
      await addProduct(db.appDb, 'HB', 'HBCV00006POXK3', { label: 'Whiskas Tavuklu 24x85 g' });
      await productBarcodesRepo.setProductBarcode(db.appDb, ty, '8681002995109', NOW);

      expect(await productBarcodesRepo.crossMarketplaceMatches(db.appDb, 'TY', 'HB', 50)).toHaveLength(0);
    }, 30_000);

    it('returns every pair when a barcode legitimately appears twice on one side', async () => {
      // Two listings of one physical article. Picking a winner would invent a fact.
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const ty = await addProduct(db.appDb, 'TY', '844564577');
      const hbA = await addProduct(db.appDb, 'HB', 'HBCV1');
      const hbB = await addProduct(db.appDb, 'HB', 'HBCV2');
      for (const id of [ty, hbA, hbB]) {
        await productBarcodesRepo.setProductBarcode(db.appDb, id, '8681002995109', NOW);
      }

      const matches = await productBarcodesRepo.crossMarketplaceMatches(db.appDb, 'TY', 'HB', 50);
      expect(matches.map((m) => m.rightProductRef).sort()).toEqual(['HBCV1', 'HBCV2']);
    }, 30_000);

    it('leaves an inactive product out of the match', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const ty = await addProduct(db.appDb, 'TY', '844564577');
      const hb = await addProduct(db.appDb, 'HB', 'HBCV1', { isActive: false });
      await productBarcodesRepo.setProductBarcode(db.appDb, ty, '8681002995109', NOW);
      await productBarcodesRepo.setProductBarcode(db.appDb, hb, '8681002995109', NOW);

      expect(await productBarcodesRepo.crossMarketplaceMatches(db.appDb, 'TY', 'HB', 50)).toHaveLength(0);
    }, 30_000);
  });
}
