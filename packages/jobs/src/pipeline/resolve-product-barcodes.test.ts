/**
 * `ResolveProductBarcodes` (api-references §2.14, doc 06 §12.5, Faz 8).
 *
 * The group "what a run may and may not write" carries the phase's guarantees: a page about the
 * wrong product never yields a stored barcode, "the page stated none" *is* stored so the product
 * stops being asked, and nothing on the pricing path is touched at all.
 */
import {
  ProductDetailError,
  type IProductDetailSource,
  type ProductDetailSnapshot,
} from '@buybox/adapters';
import { eventsRepo, jobsRepo, newId, productBarcodesRepo, trackedProductsRepo } from '@buybox/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from '../adapter-registry.js';
import { FakeClock } from '../clock.js';
import type { JobContext, JobProgress } from '../job.js';
import { buildProductDetailSourceRegistry } from '../product-detail-source-registry.js';
import { createSqliteTestDb, NOW, seedMarketplace, type TestDb } from '../test-helpers.js';
import {
  RESOLVE_PRODUCT_BARCODES_JOB,
  resolveProductBarcodes,
} from './resolve-product-barcodes.js';

function snapshotFor(productRef: string, barcode: string | null): ProductDetailSnapshot {
  return {
    detail: {
      marketplaceCode: 'hepsiburada',
      productRef,
      parentProductRef: 'HBC00006POXK2',
      barcode,
      name: 'Whiskas Tavuklu',
      brandName: 'Whiskas',
      brandRef: 'whiskas',
      categoryRef: '60006985',
      categoryName: 'Yetişkin Kedi Konserveleri',
      ratingCount: 102,
      ratingAverage: 4.7,
      isLive: true,
    },
    fetchedUrl: `https://www.hepsiburada.com/urun-${productRef}`,
    observedAt: new Date(NOW),
    diagnostics: { parserVersion: '1.0.0', stateFound: true, sellerListWasTruncated: true },
    fromCache: false,
  };
}

/** A source driven by a per-call outcome list, so the batch's walk is directly observable. */
function fakeSource(
  outcomes: readonly (ProductDetailSnapshot | ProductDetailError | 'echo')[],
): IProductDetailSource & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    code: 'hepsiburada',
    calls,
    async fetchProductDetail(productRef) {
      calls.push(productRef);
      const outcome = outcomes[calls.length - 1];
      if (outcome === undefined) throw new ProductDetailError('no more outcomes', 'fetchFailed');
      if (outcome === 'echo') return snapshotFor(productRef, `barcode-${productRef}`);
      if (outcome instanceof ProductDetailError) throw outcome;
      return outcome;
    },
  };
}

describe('ResolveProductBarcodes', () => {
  let db: TestDb;
  let clock: FakeClock;

  async function seedProduct(productRef: string, sweptAt = NOW): Promise<string> {
    const id = newId();
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id,
      marketplaceCode: 'hepsiburada',
      productRef,
      productUrl: `/urun-${productRef}`,
      label: `Ürün ${productRef}`,
      isActive: true,
      addedAt: NOW,
      lastSweptAt: sweptAt,
    });
    return id;
  }

  function ctxFor(
    source: IProductDetailSource | undefined,
    payload: Record<string, unknown> = {},
  ): JobContext & { readonly progress: JobProgress[] } {
    const progress: JobProgress[] = [];
    return {
      appDb: db.appDb,
      clock,
      adapters: buildAdapterRegistry([]),
      productDetailSources:
        source === undefined ? undefined : buildProductDetailSourceRegistry([['hepsiburada', source]]),
      correlationId: 'test-run',
      payload: JSON.stringify({ marketplaceCode: 'hepsiburada', ...payload }),
      reportProgress: (p) => progress.push(p),
      progress,
    };
  }

  async function eventCodes(): Promise<string[]> {
    const events = await eventsRepo.listRecentEvents(db.appDb, 50);
    return events.map((e) => e.code);
  }

  beforeEach(async () => {
    db = await createSqliteTestDb();
    clock = new FakeClock(NOW);
    await seedMarketplace(db.appDb, 'hepsiburada');
    await jobsRepo.startJobRun(db.appDb, {
      id: 'test-run',
      jobName: RESOLVE_PRODUCT_BARCODES_JOB,
      startedAt: NOW,
      finishedAt: null,
      state: 'running',
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: null,
      correlationId: 'test-run',
      currentItem: null,
      progressDone: null,
      progressTotal: null,
    });
  });

  describe('the batch', () => {
    it('asks about every product that has never been asked about', async () => {
      const a = await seedProduct('HBCV1');
      const b = await seedProduct('HBCV2');
      const source = fakeSource(['echo', 'echo']);

      const result = await resolveProductBarcodes(ctxFor(source));

      expect(result).toEqual({ itemsTotal: 2, itemsOk: 2, itemsFailed: 0 });
      expect((await trackedProductsRepo.getTrackedProduct(db.appDb, a))?.barcode).toBe('barcode-HBCV1');
      expect((await trackedProductsRepo.getTrackedProduct(db.appDb, b))?.barcode).toBe('barcode-HBCV2');
    });

    it('does nothing at all when the marketplace has no detail source', async () => {
      await seedProduct('HBCV1');
      const result = await resolveProductBarcodes(ctxFor(undefined));
      expect(result).toEqual({ itemsTotal: 0, itemsOk: 0, itemsFailed: 0 });
    });

    it('stops after a run of consecutive failures rather than spending the batch', async () => {
      // A blocked client fails every product. Grinding through 60 proves nothing and makes 60
      // requests to a marketplace that is already refusing us.
      for (let i = 0; i < 8; i += 1) await seedProduct(`HBCV${i}`);
      const source = fakeSource(
        Array.from({ length: 8 }, () => new ProductDetailError('403', 'fetchFailed')),
      );

      const result = await resolveProductBarcodes(ctxFor(source, { maxConsecutiveFailures: 3 }));

      expect(source.calls).toHaveLength(3);
      expect(result.itemsFailed).toBe(3);
      expect(await eventCodes()).toContain('BarcodeRunAborted');
    });

    it('keeps going when one product fails between two that succeed', async () => {
      // A single dead product says nothing about the next one.
      await seedProduct('HBCV1');
      await seedProduct('HBCV2');
      await seedProduct('HBCV3');
      const source = fakeSource(['echo', new ProductDetailError('404', 'fetchFailed'), 'echo']);

      const result = await resolveProductBarcodes(ctxFor(source, { maxConsecutiveFailures: 2 }));

      expect(source.calls).toHaveLength(3);
      expect(result).toEqual({ itemsTotal: 3, itemsOk: 2, itemsFailed: 1 });
    });

    it('honours the batch size so a run is never the thing holding the queue', async () => {
      for (let i = 0; i < 5; i += 1) await seedProduct(`HBCV${i}`);
      const source = fakeSource(['echo', 'echo']);

      const result = await resolveProductBarcodes(ctxFor(source, { batchSize: 2 }));

      expect(source.calls).toHaveLength(2);
      expect(result.itemsTotal).toBe(2);
    });

    it('resumes where the last run stopped instead of starting over', async () => {
      const first = await seedProduct('HBCV1');
      await seedProduct('HBCV2');
      await productBarcodesRepo.setProductBarcode(db.appDb, first, '8681002995109', NOW);

      const source = fakeSource(['echo']);
      await resolveProductBarcodes(ctxFor(source));

      expect(source.calls).toEqual(['HBCV2']);
    });
  });

  describe('what a run may and may not write', () => {
    it('stores "the page stated no barcode" as an answer, so the product is not asked again', async () => {
      const id = await seedProduct('HBCV1');
      const source = fakeSource([snapshotFor('HBCV1', null)]);

      const result = await resolveProductBarcodes(ctxFor(source));

      expect(result.itemsOk).toBe(1);
      const stored = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(stored?.barcode).toBeNull();
      expect(stored?.barcodeResolvedAt).toBe(NOW);
      expect(await productBarcodesRepo.barcodeTargets(db.appDb, 'hepsiburada', 10)).toHaveLength(0);
    });

    it('stores nothing when the page was about a different product', async () => {
      // `identityMismatch` is a failure, never an answer: that barcode belongs to the other
      // article, and a match built on it would be confidently wrong.
      const id = await seedProduct('HBCV1');
      const source = fakeSource([
        new ProductDetailError('describes HBCV9 but HBCV1 was requested', 'identityMismatch'),
      ]);

      const result = await resolveProductBarcodes(ctxFor(source));

      expect(result.itemsFailed).toBe(1);
      const stored = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(stored?.barcode).toBeNull();
      // No answer is recorded — a failed read is not the statement that the page carries none.
      expect(stored?.barcodeResolvedAt).toBeNull();
      // But the attempt is, so this product cannot sit at the head of every run for ever.
      expect(stored?.barcodeAttempts).toBe(1);
    });

    it('lets a broken product fall off the list instead of blocking every later run', async () => {
      // Without the attempt counter the same rows come back first every hour, and five of them
      // end each run on consecutive failures having resolved nothing at all.
      const broken = await seedProduct('HBCV-broken');
      await seedProduct('HBCV-fresh');
      const failing = new ProductDetailError('404', 'fetchFailed');

      for (let run = 0; run < 3; run += 1) {
        await resolveProductBarcodes(
          ctxFor(fakeSource([failing, 'echo']), { maxConsecutiveFailures: 5 }),
        );
      }

      const stored = await trackedProductsRepo.getTrackedProduct(db.appDb, broken);
      expect(stored?.barcodeAttempts).toBe(3);
      const targets = await productBarcodesRepo.barcodeTargets(db.appDb, 'hepsiburada', 10);
      expect(targets.map((t) => t.productRef)).not.toContain('HBCV-broken');
    });

    it('writes no observation row and no listing — this is not a scrape and not a price', async () => {
      const id = await seedProduct('HBCV1');
      await resolveProductBarcodes(ctxFor(fakeSource(['echo'])));

      const observations = await trackedProductsRepo.trackedProductObservationsSince(db.appDb, id, 0);
      expect(observations).toHaveLength(0);
      const stored = await trackedProductsRepo.getTrackedProduct(db.appDb, id);
      expect(stored?.lastScrapedAt ?? null).toBeNull();
    });

    it('records what it did as an event a person can read', async () => {
      await seedProduct('HBCV1');
      await resolveProductBarcodes(ctxFor(fakeSource(['echo'])));
      expect(await eventCodes()).toContain('BarcodesResolved');
    });

    it('reports progress against the batch it actually took', async () => {
      await seedProduct('HBCV1');
      await seedProduct('HBCV2');
      const ctx = ctxFor(fakeSource(['echo', 'echo']));
      await resolveProductBarcodes(ctx);
      expect(ctx.progress.at(-1)).toEqual({ done: 2, total: 2, currentItem: null });
    });
  });
});
