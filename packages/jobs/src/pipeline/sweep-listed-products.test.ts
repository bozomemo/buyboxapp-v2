/**
 * `SweepListedProducts` (doc 07 §7.5, doc 17 §4.2) — the listings lane over İlanlar's smaller
 * candidate set, sharing everything else with `SweepTrackedProducts`.
 *
 * Most of the pass mechanics (cursor, chunking, resumption, the consecutive-failure guard) are
 * `runSweepPass`, exercised end to end by `sweep-tracked-products.test.ts`; this file is only what
 * differs for this lane: the candidate set is linked-or-favourite rather than the whole catalogue,
 * and its passes are numbered separately from the catalogue sweep's.
 */
import {
  CompetitorSourceError,
  type CompetitorOffer,
  type CompetitorPageSnapshot,
  type ICompetitorSource,
  type ProductPageRef,
} from '@buybox/adapters';
import { brandProductsRepo, eventsRepo, trackedProductsRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from '../adapter-registry.js';
import { buildCompetitorSourceRegistry } from '../competitor-source-registry.js';
import { FakeClock } from '../clock.js';
import type { JobResult } from '../job.js';
import { Scheduler } from '../scheduler.js';
import { createFakeAdapter, createSqliteTestDb, NOW, seedMarketplace, type TestDb } from '../test-helpers.js';
import { SWEEP_LISTED_PRODUCTS_JOB, sweepListedProducts } from './sweep-listed-products.js';
import { SWEEP_TRACKED_PRODUCTS_JOB, sweepTrackedProducts } from './sweep-tracked-products.js';

let runCounter = 0;

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

describe('SweepListedProducts (doc 07 §7.5, doc 17 §4.2)', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createSqliteTestDb();
    await seedMarketplace(db.appDb);
  });

  afterEach(() => db.cleanup());

  function schedulerFor(source: ICompetitorSource, nowMs: number): Scheduler {
    return new Scheduler({
      appDb: db.appDb,
      clock: new FakeClock(nowMs),
      adapters: buildAdapterRegistry([['trendyol', createFakeAdapter()]]),
      competitorSources: buildCompetitorSourceRegistry([['trendyol', source]]),
      instanceId: `listed-${runCounter++}`,
    });
  }

  async function runListed(
    source: ICompetitorSource,
    nowMs: number = NOW,
    payload: Record<string, unknown> = {},
  ): Promise<JobResult> {
    const scheduler = schedulerFor(source, nowMs);
    let result: JobResult = { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
    scheduler.register({
      jobName: SWEEP_LISTED_PRODUCTS_JOB,
      handler: async (ctx) => {
        result = await sweepListedProducts(ctx);
        return result;
      },
    });
    await scheduler.enqueueNow(
      SWEEP_LISTED_PRODUCTS_JOB,
      JSON.stringify({ marketplaceCode: 'trendyol', ...payload }),
    );
    await scheduler.tick();
    await scheduler.shutdown();
    return result;
  }

  async function runAll(source: ICompetitorSource, nowMs: number = NOW): Promise<JobResult> {
    const scheduler = schedulerFor(source, nowMs);
    let result: JobResult = { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
    scheduler.register({
      jobName: SWEEP_TRACKED_PRODUCTS_JOB,
      handler: async (ctx) => {
        result = await sweepTrackedProducts(ctx);
        return result;
      },
    });
    await scheduler.enqueueNow(SWEEP_TRACKED_PRODUCTS_JOB, JSON.stringify({ marketplaceCode: 'trendyol' }));
    await scheduler.tick();
    await scheduler.shutdown();
    return result;
  }

  async function seedProduct(id: string): Promise<void> {
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id,
      marketplaceCode: 'trendyol',
      productRef: id,
      productUrl: `https://www.trendyol.com/x-p-${id}`,
      label: id,
      isActive: true,
      addedAt: NOW,
    });
  }

  async function linkAsBrandProduct(trackedProductId: string): Promise<void> {
    const brandProductId = `bp-${trackedProductId}`;
    await brandProductsRepo.insertBrandProduct(db.appDb, {
      id: brandProductId,
      name: trackedProductId,
      referencePrice: 100_00n,
      minPrice: null,
      maxPrice: null,
      barcode: null,
      referencePriceSource: null,
      source: 'manual',
      createdAt: NOW,
      updatedAt: NOW,
    });
    const result = await brandProductsRepo.linkCard(db.appDb, {
      id: `card-${trackedProductId}`,
      brandProductId,
      trackedProductId,
      unitMultiplier: 1,
      isPrimary: true,
      linkSource: 'manual',
      linkedAt: NOW,
    });
    if (!result.ok) throw new Error('link failed in test setup');
  }

  it('reads only the linked and favourite cards, never the rest of the catalogue', async () => {
    await seedProduct('t-linked');
    await seedProduct('t-favourite');
    await seedProduct('t-plain');
    await linkAsBrandProduct('t-linked');
    await trackedProductsRepo.setTrackedProductFavourite(db.appDb, 't-favourite', true, NOW);
    const { source, calls } = fakeSource(() => [offer()]);

    const result = await runListed(source);

    expect(calls.map((c) => c.contentId).sort()).toEqual(['t-favourite', 't-linked']);
    expect(result.itemsTotal).toBe(2);
    const listedPass = await trackedProductsRepo.latestTrackedScrapePass(db.appDb, 'trendyol', 'listed');
    expect(listedPass).toMatchObject({ scope: 'listed', passNo: 1, plannedCount: 2, doneCount: 2 });
  });

  it('numbers its passes independently of the catalogue sweep', async () => {
    await seedProduct('t-linked');
    await linkAsBrandProduct('t-linked');
    await seedProduct('t-plain');
    const { source: listedSource } = fakeSource(() => [offer()]);
    const { source: allSource } = fakeSource(() => [offer()]);

    await runListed(listedSource);
    await runListed(listedSource, NOW + 1);
    await runAll(allSource);

    const listedPass = await trackedProductsRepo.latestTrackedScrapePass(db.appDb, 'trendyol', 'listed');
    const allPass = await trackedProductsRepo.latestTrackedScrapePass(db.appDb, 'trendyol', 'all');
    // The listings lane closed its pass #1 and opened #2 on its own row; the catalogue sweep,
    // run once, is still on its own #1 — neither lane's count moved the other's.
    expect(listedPass).toMatchObject({ scope: 'listed', passNo: 2 });
    expect(allPass).toMatchObject({ scope: 'all', passNo: 1 });
  });

  it('a card the catalogue sweep already read this cycle is not read again by the listings lane', async () => {
    await seedProduct('t-linked');
    await linkAsBrandProduct('t-linked');
    const { source: allSource } = fakeSource(() => [offer()]);
    const { source: listedSource, calls: listedCalls } = fakeSource(() => [offer()]);

    // The catalogue sweep reads it first and advances the shared cursor.
    await runAll(allSource);
    await runListed(listedSource);

    // The listings pass opened, found nothing left to read, and closed empty.
    expect(listedCalls).toHaveLength(0);
    expect(await trackedProductsRepo.latestTrackedScrapePass(db.appDb, 'trendyol', 'listed')).toMatchObject({
      scope: 'listed',
      finishedAt: expect.any(Number),
      doneCount: 0,
    });
  });

  it('a failed look is recorded and does not fail the run', async () => {
    await seedProduct('t-linked');
    await linkAsBrandProduct('t-linked');
    const { source } = fakeSource(() => new CompetitorSourceError('boom', 'fetchFailed'));

    const result = await runListed(source);

    // The one candidate failed, which is a whole chunk with nothing to show for it — the pass
    // stays open rather than being declared complete, same guard as the catalogue sweep.
    expect(result.itemsFailed).toBe(1);
    const events = await eventsRepo.listRecentEvents(db.appDb, 50);
    expect(events.some((e) => e.code === 'ListedSweepHalted')).toBe(true);
    expect(await trackedProductsRepo.latestTrackedScrapePass(db.appDb, 'trendyol', 'listed')).toMatchObject({
      finishedAt: null,
    });
  });

  it('an unlinking removes a card from the next pass', async () => {
    await seedProduct('t-was-linked');
    await linkAsBrandProduct('t-was-linked');
    const cards = await brandProductsRepo.cardsOfProducts(db.appDb, ['bp-t-was-linked']);
    const [card] = cards.get('bp-t-was-linked') ?? [];
    await brandProductsRepo.unlinkCard(db.appDb, card!.id);
    const { source, calls } = fakeSource(() => [offer()]);

    await runListed(source);

    expect(calls).toHaveLength(0);
  });
});
