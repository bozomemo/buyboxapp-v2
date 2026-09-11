/**
 * `scrapeTrackedProducts` — the cadence half of `ScrapeCompetitors` (doc 06 §12.2).
 *
 * What is pinned down here is the **failure** side, which is where this job's production
 * behaviour actually went wrong: a page the marketplace says no longer exists must stop being
 * asked about, while every other failure must keep being retried and must keep counting towards
 * the halt that says "the source is down". The happy path is covered through the rescan job
 * (`rescan-tracked-products.test.ts`), which runs the same function.
 */
import {
  CompetitorSourceError,
  type CompetitorOffer,
  type CompetitorPageSnapshot,
  type ICompetitorSource,
  type ProductPageRef,
} from '@buybox/adapters';
import { eventsRepo, jobsRepo, trackedProductsRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from '../adapter-registry.js';
import { FakeClock } from '../clock.js';
import type { JobContext } from '../job.js';
import { createFakeAdapter, createSqliteTestDb, NOW, seedMarketplace, type TestDb } from '../test-helpers.js';
import { scrapeTrackedProducts } from './scrape-tracked-products.js';

function offer(): CompetitorOffer {
  return {
    rank: 1,
    sellerRef: 'seller-a',
    sellerName: 'Satıcı A',
    sellerRating: 9.2,
    listingRef: 'listing-a',
    price: Money.fromKurus(120_00n),
    finalPrice: Money.fromKurus(120_00n),
    offeredStock: 5,
    isWinner: true,
    promotionText: null,
    dispatchTime: null,
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
        },
      };
      return snapshot;
    },
  };
  return { source, calls };
}

const CORRELATION_ID = 'corr-1';

describe('scrapeTrackedProducts', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createSqliteTestDb();
    await seedMarketplace(db.appDb);
    // `app_events.job_run_id` is a real foreign key, and this test calls the pipeline directly
    // rather than through the scheduler that would normally have opened the run.
    await jobsRepo.startJobRun(db.appDb, {
      id: CORRELATION_ID,
      jobName: 'ScrapeCompetitors',
      startedAt: NOW,
      finishedAt: null,
      state: 'running',
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: null,
      correlationId: CORRELATION_ID,
      jobQueueId: null,
    });
  });

  afterEach(() => db.cleanup());

  async function seedTracked(id: string): Promise<void> {
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

  function context(): JobContext {
    return {
      appDb: db.appDb,
      clock: new FakeClock(NOW),
      adapters: buildAdapterRegistry([['trendyol', createFakeAdapter()]]),
      correlationId: CORRELATION_ID,
      payload: '{}',
      reportProgress: () => undefined,
    };
  }

  async function eventCodes(): Promise<string[]> {
    const events = await eventsRepo.listRecentEvents(db.appDb, 50);
    return events.map((e) => e.code);
  }

  async function isActive(id: string): Promise<boolean | undefined> {
    return (await trackedProductsRepo.getTrackedProduct(db.appDb, id))?.isActive;
  }

  /**
   * The 410 in the production event log: one product failing once an hour for two days, each
   * look spending a rate-limit token to be told again that the page is gone.
   */
  it('deactivates a product the marketplace reports as gone, keeping its history', async () => {
    await seedTracked('t-gone');
    const { source } = fakeSource(
      () => new CompetitorSourceError('Trendyol public page 410 for x', 'fetchFailed', undefined, 410),
    );

    const result = await scrapeTrackedProducts(context(), 'trendyol', source);

    expect(result).toMatchObject({ itemsOk: 0, itemsFailed: 1 });
    expect(await isActive('t-gone')).toBe(false);
    expect(await eventCodes()).toContain('TrackedProductGone');
    // The failure row is still written, and the observation history is untouched: a report over
    // last month still has whatever this product's sellers were doing then.
    const obs = await trackedProductsRepo.latestTrackedProductObservations(db.appDb, 't-gone');
    expect(obs.map((o) => o.status)).toEqual(['fetchFailed']);
  });

  it('does the same for a 404', async () => {
    await seedTracked('t-404');
    const { source } = fakeSource(
      () => new CompetitorSourceError('Trendyol public page 404 for x', 'fetchFailed', undefined, 404),
    );

    await scrapeTrackedProducts(context(), 'trendyol', source);

    expect(await isActive('t-404')).toBe(false);
  });

  /** The cadence reads `activeOnly`, so a retired product costs nothing on the next run. */
  it('stops asking about it on the next run', async () => {
    await seedTracked('t-gone');
    const { source, calls } = fakeSource(
      () => new CompetitorSourceError('Trendyol public page 410 for x', 'fetchFailed', undefined, 410),
    );

    await scrapeTrackedProducts(context(), 'trendyol', source);
    await scrapeTrackedProducts(context(), 'trendyol', source);

    expect(calls).toHaveLength(1);
  });

  /**
   * The distinction the whole feature rests on. A slow machine, a 503 and an unreadable page are
   * all reasons to look again — retiring a product over any of them would quietly stop watching
   * a live product over one bad afternoon.
   */
  it.each([
    ['a timeout with no status', new CompetitorSourceError('Timeout 15000ms exceeded', 'fetchFailed')],
    [
      'a 503',
      new CompetitorSourceError('Trendyol public page 503 for x', 'fetchFailed', undefined, 503),
    ],
    ['a parse failure', new CompetitorSourceError('no shared props', 'parseFailed')],
  ])('leaves the product active after %s', async (_label, error) => {
    await seedTracked('t-live');
    const { source } = fakeSource(() => error);

    await scrapeTrackedProducts(context(), 'trendyol', source);

    expect(await isActive('t-live')).toBe(true);
    expect(await eventCodes()).not.toContain('TrackedProductGone');
  });

  /**
   * `SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT` asks "has the source stopped answering". A
   * marketplace that answered 404 has answered, so a run of withdrawn products must not halt the
   * run and strand every product behind them.
   */
  it('does not halt the run over a row of gone products', async () => {
    const ids = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'live'];
    for (const id of ids) await seedTracked(id);
    const { source, calls } = fakeSource((ref) =>
      ref.contentId === 'live'
        ? [offer()]
        : new CompetitorSourceError('Trendyol public page 404 for x', 'fetchFailed', undefined, 404),
    );

    const result = await scrapeTrackedProducts(context(), 'trendyol', source);

    expect(calls).toHaveLength(ids.length);
    expect(result.itemsOk).toBe(1);
    expect(await eventCodes()).not.toContain('TrackedProductsScrapeHalted');
  });
});
