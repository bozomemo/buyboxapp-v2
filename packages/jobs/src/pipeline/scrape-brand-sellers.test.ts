/**
 * `ScrapeBrandSellers` (doc 07 §7.3) — the whole-brand seller scrape behind the brand screen's
 * "Şimdi tara".
 *
 * The properties worth pinning are the ones that make an unbounded walk safe: it reads **past**
 * the cadence's per-run ceiling, it stops when the brand is finished rather than re-reading it,
 * a failed product still counts as read (or the loop would never end), it resumes from a
 * watermark instead of restarting, and a dead source ends the run instead of grinding through
 * five thousand failures.
 */
import type {
  CompetitorOffer,
  CompetitorPageSnapshot,
  ICompetitorSource,
  ProductPageRef,
} from '@buybox/adapters';
import { CompetitorSourceError } from '@buybox/adapters';
import { eventsRepo, jobsRepo, newId, trackedProductsRepo, watchedBrandsRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from '../adapter-registry.js';
import { FakeClock } from '../clock.js';
import { buildCompetitorSourceRegistry } from '../competitor-source-registry.js';
import type { JobContext, JobProgress } from '../job.js';
import { SCRAPE_TRACKED_CHUNK } from '../scrape-config.js';
import { createSqliteTestDb, NOW, seedMarketplace, type TestDb } from '../test-helpers.js';
import { SCRAPE_BRAND_SELLERS_JOB, scrapeBrandSellers } from './scrape-brand-sellers.js';

function offer(overrides: Partial<CompetitorOffer> = {}): CompetitorOffer {
  return {
    rank: 1,
    sellerRef: 'seller-a',
    sellerName: 'Satıcı A',
    sellerRating: 9.2,
    listingRef: 'listing-a',
    price: Money.fromKurus(150_000n),
    finalPrice: Money.fromKurus(150_000n),
    offeredStock: 5,
    dispatchTime: null,
    hasPromotion: false,
    promotionText: null,
    isWinner: true,
    ...overrides,
  };
}

/** A controllable `ICompetitorSource` double — never a network call (doc 10 §10). */
function fakeSource(behaviour: (ref: ProductPageRef) => CompetitorOffer[] | Error): {
  source: ICompetitorSource;
  calls: ProductPageRef[];
} {
  const calls: ProductPageRef[] = [];
  const source: ICompetitorSource = {
    code: 'trendyol',
    async fetchProductOffers(ref) {
      calls.push(ref);
      const result = behaviour(ref);
      if (result instanceof Error) throw result;
      const snapshot: CompetitorPageSnapshot = {
        marketplaceCode: 'trendyol',
        productRef: ref,
        fetchedUrl: 'https://www.trendyol.com/x-p-1',
        observedAt: new Date(NOW),
        offers: result,
        diagnostics: {
          extractionMethod: 'embeddedJson',
          parserVersion: 'test',
          stateFound: true,
          productFound: true,
          merchantListingFound: true,
          winnerMerchantFound: true,
          winnerVariantFound: true,
          otherMerchantCount: Math.max(0, result.length - 1),
          merchantCount: new Set(result.map((o) => o.sellerRef)).size,
          listingCount: result.length,
        },
        fromCache: false,
      };
      return snapshot;
    },
  };
  return { source, calls };
}

describe('ScrapeBrandSellers', () => {
  let db: TestDb;
  let clock: FakeClock;
  let brandId: string;

  async function seedBrand(): Promise<string> {
    const groupId = newId();
    await watchedBrandsRepo.createWatchedBrandGroup(db.appDb, {
      id: groupId,
      name: 'Bizim markalar',
      createdAt: NOW,
      updatedAt: NOW,
    });
    const id = newId();
    await watchedBrandsRepo.createWatchedBrand(db.appDb, {
      id,
      groupId,
      marketplaceCode: 'trendyol',
      label: 'Acana',
      brandRef: '104703',
      searchTerm: 'acana',
      isActive: true,
      lastSweptAt: null,
      lastSweepProductCount: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return id;
  }

  async function seedProducts(
    count: number,
    overrides: Partial<trackedProductsRepo.TrackedProductRow> = {},
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const id = `p-${i}`;
      await trackedProductsRepo.addTrackedProduct(db.appDb, {
        id,
        marketplaceCode: 'trendyol',
        productRef: `${i}`,
        productUrl: `https://www.trendyol.com/x-p-${i}`,
        label: `Ürün ${i}`,
        isActive: true,
        addedAt: NOW,
        watchedBrandId: brandId,
        ...overrides,
      });
      ids.push(id);
    }
    return ids;
  }

  function ctxFor(source: ICompetitorSource | undefined, payload: Record<string, unknown>): JobContext {
    const progress: JobProgress[] = [];
    return {
      appDb: db.appDb,
      clock,
      adapters: buildAdapterRegistry([]),
      competitorSources:
        source === undefined ? undefined : buildCompetitorSourceRegistry([['trendyol', source]]),
      correlationId: 'test-run',
      payload: JSON.stringify(payload),
      reportProgress: (p) => progress.push(p),
    };
  }

  beforeEach(async () => {
    db = await createSqliteTestDb();
    clock = new FakeClock(NOW);
    await seedMarketplace(db.appDb, 'trendyol');
    // `app_events.job_run_id` is a foreign key, so events these tests assert on need a run row.
    await jobsRepo.startJobRun(db.appDb, {
      id: 'test-run',
      jobName: SCRAPE_BRAND_SELLERS_JOB,
      startedAt: NOW,
      finishedAt: null,
      state: 'running',
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: null,
      correlationId: 'test-run',
      jobQueueId: null,
    });
    brandId = await seedBrand();
  });
  afterEach(() => db.cleanup());

  // Deliberately the only slow test here: 125 products at a row-per-look is seconds of SQLite
  // writes, and the assertion is precisely that the run does not stop at a chunk boundary.
  it('reads every product of the brand, past a chunk boundary, in chunks', async () => {
    const productCount = SCRAPE_TRACKED_CHUNK + 25;
    await seedProducts(productCount);
    const { source, calls } = fakeSource(() => [offer()]);

    const result = await scrapeBrandSellers(
      ctxFor(source, { marketplaceCode: 'trendyol', watchedBrandId: brandId, chunkSize: 50 }),
    );

    // The whole brand in one run: unlike a sweep pass, nothing here comes back for the
    // remainder later — the operator asked for this brand, now.
    expect(calls).toHaveLength(productCount);
    expect(new Set(calls.map((c) => c.contentId)).size).toBe(productCount);
    expect(result).toEqual({ itemsTotal: productCount, itemsOk: productCount, itemsFailed: 0 });
  }, 60_000);

  it('never reads the same product twice in one run', async () => {
    await seedProducts(10);
    const { source, calls } = fakeSource(() => [offer()]);

    await scrapeBrandSellers(
      ctxFor(source, { marketplaceCode: 'trendyol', watchedBrandId: brandId, chunkSize: 3 }),
    );

    expect(calls).toHaveLength(10);
  });

  it('counts a failed product as read, so a brand of dead pages still terminates', async () => {
    await seedProducts(4);
    // Alternating, so the whole-chunk-failed guard below does not fire first.
    let index = 0;
    const { source, calls } = fakeSource(() =>
      index++ % 2 === 0 ? [offer()] : new CompetitorSourceError('fetchFailed', 'boom'),
    );

    const result = await scrapeBrandSellers(
      ctxFor(source, { marketplaceCode: 'trendyol', watchedBrandId: brandId, chunkSize: 2 }),
    );

    expect(calls).toHaveLength(4);
    expect(result).toEqual({ itemsTotal: 4, itemsOk: 2, itemsFailed: 2 });
  });

  it('resumes from the payload watermark instead of restarting the brand', async () => {
    const ids = await seedProducts(4);
    // Two products already read by an interrupted earlier attempt of this same run.
    for (const id of ids.slice(0, 2)) {
      await trackedProductsRepo.recordTrackedProductLook(db.appDb, {
        trackedProductId: id,
        observedAt: NOW + 10,
        offersHash: 'h',
        rows: [],
      });
    }
    const { source, calls } = fakeSource(() => [offer()]);

    const result = await scrapeBrandSellers(
      ctxFor(source, {
        marketplaceCode: 'trendyol',
        watchedBrandId: brandId,
        notScrapedSinceMs: NOW,
      }),
    );

    expect(calls.map((c) => c.contentId).sort()).toEqual(['2', '3']);
    expect(result.itemsTotal).toBe(2);
  });

  it('skips products the operator paused', async () => {
    await seedProducts(3);
    await trackedProductsRepo.setTrackedProductsActive(db.appDb, ['p-1'], false);
    const { source, calls } = fakeSource(() => [offer()]);

    await scrapeBrandSellers(ctxFor(source, { marketplaceCode: 'trendyol', watchedBrandId: brandId }));

    expect(calls.map((c) => c.contentId).sort()).toEqual(['0', '2']);
  });

  it('reads only the named brand', async () => {
    await seedProducts(2);
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id: 'other',
      marketplaceCode: 'trendyol',
      productRef: 'other',
      productUrl: 'https://www.trendyol.com/x-p-other',
      label: 'Başka marka',
      isActive: true,
      addedAt: NOW,
      watchedBrandId: null,
    });
    const { source, calls } = fakeSource(() => [offer()]);

    await scrapeBrandSellers(ctxFor(source, { marketplaceCode: 'trendyol', watchedBrandId: brandId }));

    expect(calls.map((c) => c.contentId).sort()).toEqual(['0', '1']);
  });

  it('stops when a whole chunk fails — the source is gone, not the page', async () => {
    await seedProducts(30);
    const { source, calls } = fakeSource(() => new CompetitorSourceError('fetchFailed', 'browser closed'));

    const result = await scrapeBrandSellers(
      ctxFor(source, { marketplaceCode: 'trendyol', watchedBrandId: brandId, chunkSize: 10 }),
    );

    // The first chunk only — never the remaining twenty products at one failing request each.
    expect(calls).toHaveLength(10);
    expect(result.itemsOk).toBe(0);
    const events = await eventsRepo.listEventsFiltered(db.appDb, { minLevel: 'debug' }, 100);
    expect(events.some((e) => e.code === 'BrandSellerScrapeHalted')).toBe(true);
  });

  it('records hitting the runaway ceiling rather than reporting a finished brand', async () => {
    await seedProducts(5);
    const { source, calls } = fakeSource(() => [offer()]);

    await scrapeBrandSellers(
      ctxFor(source, {
        marketplaceCode: 'trendyol',
        watchedBrandId: brandId,
        maxProducts: 3,
        chunkSize: 2,
      }),
    );

    expect(calls).toHaveLength(3);
    const events = await eventsRepo.listEventsFiltered(db.appDb, { minLevel: 'debug' }, 100);
    expect(events.some((e) => e.code === 'BrandSellerScrapeTruncated')).toBe(true);
  });

  it('a marketplace with no competitor source is a supported configuration, not a failure', async () => {
    await seedProducts(2);
    const result = await scrapeBrandSellers(
      ctxFor(undefined, { marketplaceCode: 'trendyol', watchedBrandId: brandId }),
    );
    expect(result).toEqual({ itemsTotal: 0, itemsOk: 0, itemsFailed: 0 });
  });

  it('a brand removed between enqueue and claim is a no-op, not a retryable failure', async () => {
    const { source } = fakeSource(() => [offer()]);
    const result = await scrapeBrandSellers(
      ctxFor(source, { marketplaceCode: 'trendyol', watchedBrandId: 'gone' }),
    );
    expect(result).toEqual({ itemsTotal: 0, itemsOk: 0, itemsFailed: 0 });
  });

  it('is not in the job catalogue: it has no cadence and no runnable empty payload', async () => {
    const { JOB_CATALOG } = await import('../job-catalog.js');
    expect(JOB_CATALOG.some((e) => e.jobName === SCRAPE_BRAND_SELLERS_JOB)).toBe(false);
  });
});
