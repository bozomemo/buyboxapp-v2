/**
 * `scrapeTrackedProducts` — the shared tracked-product read (doc 06 §12.2, doc 07 §7.4).
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
import {
  scrapeTrackedProducts,
  type ScrapeTrackedProductsResult,
} from './scrape-tracked-products.js';

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

  /**
   * Reads every active tracked product once, the way `SweepTrackedProducts` does: the candidate
   * query decides *what*, this function reads *it*. `notScrapedSinceMs` is set past any stamp so
   * the whole catalogue is outstanding, which is what a fresh pass means.
   */
  async function readAll(source: ICompetitorSource): Promise<ScrapeTrackedProductsResult> {
    const due = await trackedProductsRepo.listProductsToScrape(db.appDb, {
      marketplaceCode: 'trendyol',
      notScrapedSinceMs: Number.MAX_SAFE_INTEGER,
    });
    return scrapeTrackedProducts(context(), 'trendyol', source, { ids: due.map((p) => p.id) });
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

    const result = await readAll(source);

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

    await readAll(source);

    expect(await isActive('t-404')).toBe(false);
  });

  /** The cadence reads `activeOnly`, so a retired product costs nothing on the next run. */
  it('stops asking about it on the next run', async () => {
    await seedTracked('t-gone');
    const { source, calls } = fakeSource(
      () => new CompetitorSourceError('Trendyol public page 410 for x', 'fetchFailed', undefined, 410),
    );

    await readAll(source);
    await readAll(source);

    expect(calls).toHaveLength(1);
  });

  /**
   * The distinction the whole feature rests on. A slow machine, a 503 and an unreadable page are
   * all reasons to look again — retiring a product over any of them would quietly stop watching
   * a live product over one bad afternoon.
   */
  it.each([
    ['a timeout with no status', new CompetitorSourceError('Timeout 15000ms exceeded', 'fetchFailed')],
    ['a 503', new CompetitorSourceError('Trendyol public page 503 for x', 'fetchFailed', undefined, 503)],
    ['a parse failure', new CompetitorSourceError('no shared props', 'parseFailed')],
  ])('leaves the product active after %s', async (_label, error) => {
    await seedTracked('t-live');
    const { source } = fakeSource(() => error);

    await readAll(source);

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

    const result = await readAll(source);

    expect(calls).toHaveLength(ids.length);
    expect(result.itemsOk).toBe(1);
    expect(await eventCodes()).not.toContain('TrackedProductsScrapeHalted');
  });

  /**
   * The production incident of 2026-09-11: three `ScrapeBrandSellers` attempts died one after
   * another, a 605-product brand abandoned each time, because the operator deleted three failing
   * products from the list screen — thirteen seconds apart — while the run walked past them. A
   * whole-brand run takes hours, so this is ordinary use of the two screens at once.
   */
  describe('a product the operator deletes while the run is reading it', () => {
    // The deletes below are fired without awaiting, from inside the source double, to land in
    // the middle of the look. That is deterministic here and only here: these tests run on
    // better-sqlite3, whose driver is synchronous, so the row is gone by the time the fetch
    // returns.

    it('is skipped on the success path, and the rest of the run still happens', async () => {
      await seedTracked('t-doomed');
      await seedTracked('t-live');
      const { source } = fakeSource((ref) => {
        // The delete lands while this very page is being fetched.
        if (ref.contentId === 't-doomed') void trackedProductsRepo.deleteTrackedProduct(db.appDb, 't-doomed');
        return [offer()];
      });

      const result = await readAll(source);

      expect(result).toMatchObject({ itemsOk: 1, itemsFailed: 0, itemsRemoved: 1, itemsTotal: 2 });
      // The survivor was read, which is the whole point: before this the throw took the job.
      const obs = await trackedProductsRepo.latestTrackedProductObservations(db.appDb, 't-live');
      expect(obs.map((o) => o.status)).toEqual(['ok']);
    });

    /**
     * The nastier half: the failure row is written from inside a `catch`, so a row that goes away
     * between the failed read and the note about it used to throw out of the handler — the one
     * place where a second failure was fatal rather than recorded.
     */
    it('is skipped on the failure path too', async () => {
      await seedTracked('t-doomed');
      await seedTracked('t-live');
      const { source } = fakeSource((ref) => {
        if (ref.contentId !== 't-doomed') return [offer()];
        void trackedProductsRepo.deleteTrackedProduct(db.appDb, 't-doomed');
        return new CompetitorSourceError('Trendyol public page 503 for x', 'fetchFailed', undefined, 503);
      });

      const result = await readAll(source);

      // Not counted as a failure: what the run learned about it went with the row.
      expect(result).toMatchObject({ itemsOk: 1, itemsFailed: 0, itemsRemoved: 1 });
    });

    /** A removal says nothing about Trendyol, so it must not spend the "source is down" budget. */
    it('does not count towards the halt that says the source is down', async () => {
      const ids = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'live'];
      for (const id of ids) await seedTracked(id);
      const { source, calls } = fakeSource((ref) => {
        if (ref.contentId !== 'live') void trackedProductsRepo.deleteTrackedProduct(db.appDb, ref.contentId!);
        return [offer()];
      });

      const result = await readAll(source);

      expect(calls).toHaveLength(ids.length);
      expect(result).toMatchObject({ itemsOk: 1, itemsRemoved: 8 });
      expect(await eventCodes()).not.toContain('TrackedProductsScrapeHalted');
    });
  });
});
