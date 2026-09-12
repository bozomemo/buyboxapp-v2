/**
 * `SweepTrackedProducts` (doc 07 §7.4) — the continuous, resumable pass over every tracked
 * product of a marketplace.
 *
 * Most of this file moved here from `scrape-competitors.test.ts` on 2026-09-12, when the tracked
 * read stopped being that job's second half: what a look *writes* has not changed and is pinned
 * down here unchanged. What is new is the pass — that one lap reads the whole catalogue, that a
 * lap resumes rather than restarting, and that when a lap ends the next one begins.
 */
import {
  CompetitorSourceError,
  type CompetitorOffer,
  type CompetitorPageSnapshot,
  type CompetitorProductFacts,
  type ICompetitorSource,
  type ProductPageRef,
} from '@buybox/adapters';
import { competitorSellersRepo, eventsRepo, listingsRepo, trackedProductsRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from '../adapter-registry.js';
import { buildCompetitorSourceRegistry } from '../competitor-source-registry.js';
import { FakeClock } from '../clock.js';
import type { JobResult } from '../job.js';
import { Scheduler } from '../scheduler.js';
import { SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT } from '../scrape-config.js';
import { createFakeAdapter, createSqliteTestDb, NOW, seedMarketplace, type TestDb } from '../test-helpers.js';
import { SWEEP_TRACKED_PRODUCTS_JOB, sweepTrackedProducts } from './sweep-tracked-products.js';

const HOUR = 60 * 60_000;

/** Distinct scheduler instance ids: one DB-backed lock row is shared per database. */
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

/**
 * A controllable `ICompetitorSource` double — never a network call (doc 10 §10).
 *
 * `product` is optional and left **undefined** when the caller says nothing, which is what an
 * offers-only source returns. That absence is deliberately distinct from a product block whose
 * rating is `null`: one source does not state a rating at all, the other read the page and could
 * not find one, and neither means "unrated".
 */
function fakeSource(
  behaviour: (ref: ProductPageRef, callIndex: number) => CompetitorOffer[] | Error,
  product?: CompetitorProductFacts,
): {
  source: ICompetitorSource;
  calls: ProductPageRef[];
} {
  const calls: ProductPageRef[] = [];
  const source: ICompetitorSource = {
    code: 'trendyol',
    async fetchProductOffers(ref) {
      const index = calls.length;
      calls.push(ref);
      const result = behaviour(ref, index);
      if (result instanceof Error) throw result;
      const snapshot: CompetitorPageSnapshot = {
        marketplaceCode: 'trendyol',
        productRef: ref,
        fetchedUrl: 'https://www.trendyol.com/x-p-1',
        observedAt: new Date(NOW),
        offers: result,
        ...(product === undefined ? {} : { product }),
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



describe('SweepTrackedProducts (doc 06 §12.2, doc 07 §7.4)', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createSqliteTestDb();
    await seedMarketplace(db.appDb);
  });

  afterEach(() => db.cleanup());

  /** One run of the job, through the scheduler, exactly as the worker enqueues it. */
  async function run(
    source: ICompetitorSource,
    nowMs: number = NOW,
    payload: Record<string, unknown> = {},
  ): Promise<JobResult> {
    const scheduler = new Scheduler({
      appDb: db.appDb,
      clock: new FakeClock(nowMs),
      adapters: buildAdapterRegistry([['trendyol', createFakeAdapter()]]),
      competitorSources: buildCompetitorSourceRegistry([['trendyol', source]]),
      instanceId: `tracked-${runCounter++}`,
    });
    let result: JobResult = { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
    scheduler.register({
      jobName: SWEEP_TRACKED_PRODUCTS_JOB,
      handler: async (ctx) => {
        result = await sweepTrackedProducts(ctx);
        return result;
      },
    });
    await scheduler.enqueueNow(
      SWEEP_TRACKED_PRODUCTS_JOB,
      JSON.stringify({ marketplaceCode: 'trendyol', ...payload }),
    );
    await scheduler.tick();
    await scheduler.shutdown();
    return result;
  }

  async function pass(): Promise<trackedProductsRepo.TrackedScrapePassRow | undefined> {
    return trackedProductsRepo.latestTrackedScrapePass(db.appDb, 'trendyol');
  }

  /**
   * The pass: one lap over the whole catalogue, resumable, and immediately followed by the next.
   *
   * The 2026-08-28 production failure is the reason this shape exists. The tracked read used to
   * take every active row every cycle, which was fine at a few dozen and is not at the 4,679 a
   * brand sweep produced: at 30 requests a minute one run needed over two hours inside an hourly
   * job, so it never reached its end, the next cycle was suppressed by `countActiveJobs`, and
   * collection stopped while the Jobs screen showed a run in progress. The per-run ceiling that
   * answered it (300) then made a full lap take sixteen hours and reported the ceiling, not the
   * catalogue, as the run's total. A pass is both answers at once, and each half is pinned here.
   */
  describe('passes', () => {
    async function seedMany(ids: readonly string[]): Promise<void> {
      for (const id of ids) {
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
    }

    it('reads the whole catalogue in one pass, and plans for all of it', async () => {
      await seedMany(['t-a', 't-b', 't-c']);
      const { source, calls } = fakeSource(() => [offer()]);

      const result = await run(source, NOW, { chunkSize: 2 });

      // Every product, not a chunk of them — the chunk is a page size, never a ceiling.
      expect(calls.map((c) => c.contentId).sort()).toEqual(['t-a', 't-b', 't-c']);
      expect(result.itemsTotal).toBe(3);
      // The plan is the catalogue, which is what the Jobs screen's denominator shows.
      expect(await pass()).toMatchObject({ passNo: 1, plannedCount: 3, doneCount: 3 });
    });

    it('closes the pass when nothing is left, and the next run opens the next one', async () => {
      await seedMany(['t-a', 't-b']);
      const { source, calls } = fakeSource(() => [offer()]);

      await run(source, NOW);
      const first = await pass();
      expect(first).toMatchObject({ passNo: 1, finishedAt: NOW });

      calls.length = 0;
      await run(source, NOW + HOUR);

      // A new lap over the same products: "tarama bitince tekrar baştan başlasın".
      expect(await pass()).toMatchObject({ passNo: 2, plannedCount: 2, doneCount: 2 });
      expect(calls.map((c) => c.contentId).sort()).toEqual(['t-a', 't-b']);
      const events = await eventsRepo.listRecentEvents(db.appDb, 50);
      expect(events.filter((e) => e.code === 'TrackedSweepPassCompleted')).toHaveLength(2);
    });

    /**
     * The property the old ceiling could not have, and the reason the ceiling can now go: a run
     * that stops early leaves the pass open, and the next run continues it rather than starting
     * the catalogue again. Driven here through `maxProductsPerRun`, which is what a worker
     * restart or a halted chunk looks like from the pass's point of view.
     */
    it('resumes an open pass instead of restarting it', async () => {
      await seedMany(['t-a', 't-b', 't-c']);
      const { source, calls } = fakeSource(() => [offer()]);

      await run(source, NOW, { chunkSize: 1, maxProductsPerRun: 2 });
      expect(calls).toHaveLength(2);
      const open = await pass();
      expect(open).toMatchObject({ passNo: 1, finishedAt: null, doneCount: 2 });

      const readFirst = calls.map((c) => c.contentId);
      calls.length = 0;
      await run(source, NOW + HOUR, { chunkSize: 1, maxProductsPerRun: 2 });

      // The one product the first run did not reach — not a re-read of the two it did.
      const remaining = ['t-a', 't-b', 't-c'].filter((id) => !readFirst.includes(id));
      expect(calls.map((c) => c.contentId)).toEqual(remaining);
      expect(await pass()).toMatchObject({ passNo: 1, finishedAt: NOW + HOUR, doneCount: 3 });
    });

    /** A paused product is the sweep's to skip; the pass plans and reads around it. */
    it('leaves a paused product out of the pass', async () => {
      await seedMany(['t-a', 't-paused']);
      await trackedProductsRepo.setTrackedProductsActive(db.appDb, ['t-paused'], false);
      const { source, calls } = fakeSource(() => [offer()]);

      await run(source, NOW);

      expect(calls.map((c) => c.contentId)).toEqual(['t-a']);
      expect(await pass()).toMatchObject({ plannedCount: 1, doneCount: 1 });
    });

    it('reports the pass as the progress denominator, not the chunk', async () => {
      await seedMany(['t-a', 't-b', 't-c', 't-d']);
      const { source } = fakeSource(() => [offer()]);
      const totals: number[] = [];
      const scheduler = new Scheduler({
        appDb: db.appDb,
        clock: new FakeClock(NOW),
        adapters: buildAdapterRegistry([['trendyol', createFakeAdapter()]]),
        competitorSources: buildCompetitorSourceRegistry([['trendyol', source]]),
        instanceId: `tracked-progress-${runCounter++}`,
      });
      scheduler.register({
        jobName: SWEEP_TRACKED_PRODUCTS_JOB,
        handler: async (ctx) =>
          sweepTrackedProducts({
            ...ctx,
            reportProgress: (progress) => totals.push(progress.total ?? 0),
          }),
      });
      await scheduler.enqueueNow(
        SWEEP_TRACKED_PRODUCTS_JOB,
        JSON.stringify({ marketplaceCode: 'trendyol', chunkSize: 2 }),
      );
      await scheduler.tick();
      await scheduler.shutdown();

      // Four, reported by every chunk — never "2 of 2" twice, which is what the operator was
      // shown when the run's own size was the denominator.
      expect(new Set(totals)).toEqual(new Set([4]));
    });

    it('stops after a run of consecutive failures rather than spending the rest of the catalogue on a dead source', async () => {
      const ids = Array.from({ length: 40 }, (_, i) => `t-f-${String(i).padStart(2, '0')}`);
      await seedMany(ids);
      // What a died-mid-run headless browser does to every later fetch.
      const { source, calls } = fakeSource(
        () => new CompetitorSourceError('Target page, context or browser has been closed', 'fetchFailed'),
      );

      const result = await run(source, NOW, { chunkSize: 40, concurrency: 3 });

      /**
       * The limit plus, at most, what was already in flight when it tripped.
       *
       * With three pages reading at once the guard cannot stop work that has already started —
       * two fetches are in the air when the twenty-fifth failure is counted — so the bound is
       * `limit + concurrency - 1`, not the limit exactly. Asserted as a range rather than the
       * exact 27 because the overshoot depends on scheduling, and pinning it would be a test of
       * the event loop rather than of the guard. What matters is that a dead source costs a
       * couple of dozen requests instead of the remaining catalogue.
       */
      expect(calls.length).toBeGreaterThanOrEqual(SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT);
      expect(calls.length).toBeLessThanOrEqual(SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT + 2);
      expect(result.itemsFailed).toBe(calls.length);
      const events = await eventsRepo.listRecentEvents(db.appDb, 50);
      expect(events.some((e) => e.code === 'TrackedProductsScrapeHalted')).toBe(true);
      // The pass is *not* closed: the products it never reached are owed a look, and the next
      // run continues this lap rather than declaring it complete.
      expect(await pass()).toMatchObject({ finishedAt: null });
      // Seeding 40 tracked products dominates the runtime here; see the timeout note below.
    }, 30_000);

    it('does not stop on failures that are broken up by successes', async () => {
      const ids = Array.from({ length: 40 }, (_, i) => `t-m-${String(i).padStart(2, '0')}`);
      await seedMany(ids);
      const { source, calls } = fakeSource((_ref, index) =>
        index % 2 === 0 ? new CompetitorSourceError('boom', 'fetchFailed') : [offer()],
      );

      await run(source, NOW, { chunkSize: 40 });

      expect(calls).toHaveLength(40);
      // 40 sequential scrapes, each writing an observation row: the slowest test in the file, and
      // measured at ~6s once the suite is running other DB-backed files alongside it. The default
      // 5s is a stopwatch on the machine, not an assertion about the code.
    }, 30_000);
  });

  it('scrapes an active tracked product even with zero listing candidates, and never touches listings/repricing_state', async () => {
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id: 'tracked-1',
      marketplaceCode: 'trendyol',
      productRef: '757251065',
      productUrl: 'https://www.trendyol.com/x-p-757251065',
      label: 'Rakip Ürün X',
      isActive: true,
      addedAt: NOW,
    });
    const { source } = fakeSource(() => [offer({ rank: 1, price: Money.fromKurus(99_00n) })]);

    const result = await run(source);

    expect(result.itemsOk).toBe(1);
    expect(result.itemsFailed).toBe(0);
    const obs = await trackedProductsRepo.latestTrackedProductObservations(db.appDb, 'tracked-1');
    expect(obs).toHaveLength(1);
    expect(obs[0]?.status).toBe('ok');
    expect(obs[0]?.price).toBe(99_00n);
    // Isolation is structural (a separate table `Reprice`/`ObserveBuybox` never query), asserted
    // here rather than merely assumed: nothing about tracking this product created a listing.
    const listings = await listingsRepo.queryListings(db.appDb, { limit: 10, offset: 0 });
    expect(listings.total).toBe(0);
  });

  it('a fetch failure for a tracked product is recorded and does not fail the run', async () => {
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id: 'tracked-2',
      marketplaceCode: 'trendyol',
      productRef: '1',
      productUrl: 'https://www.trendyol.com/x-p-1',
      label: 'Rakip Ürün Y',
      isActive: true,
      addedAt: NOW,
    });
    const { source } = fakeSource(() => new CompetitorSourceError('boom', 'fetchFailed'));

    const result = await run(source);

    expect(result.itemsFailed).toBe(1);
    const obs = await trackedProductsRepo.latestTrackedProductObservations(db.appDb, 'tracked-2');
    expect(obs).toHaveLength(1);
    expect(obs[0]?.status).toBe('fetchFailed');
    expect(obs[0]?.price).toBeNull();
  });

  /**
   * 2026-09-03. The offer's seller score, dispatch time, promotion and listing ref were arriving
   * on every `CompetitorOffer` and being dropped here, while the listings half stored all of
   * them. The asymmetry cost the brand audit "who is cutting with a coupon" and "who holds the
   * buybox on something other than price", so it is pinned down in both directions: written on a
   * successful look, and left `null` — never `false` — on a failed one.
   */
  it('stores the rest of the offer: seller score, dispatch time, promotion and listing ref', async () => {
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id: 'tracked-fields',
      marketplaceCode: 'trendyol',
      productRef: '3',
      productUrl: 'https://www.trendyol.com/x-p-3',
      label: 'Kuponlu',
      isActive: true,
      addedAt: NOW,
    });
    const { source } = fakeSource(() => [
      offer({
        sellerRating: 8.4,
        dispatchTime: 2,
        hasPromotion: true,
        promotionText: "300 TL'ye 30 TL İndirim",
        listingRef: 'listing-xyz',
      }),
    ]);

    await run(source);

    const [row] = await trackedProductsRepo.latestTrackedProductObservations(db.appDb, 'tracked-fields');
    expect(row?.sellerRating).toBe(8.4);
    expect(row?.dispatchTime).toBe(2);
    expect(row?.hasPromotion).toBe(true);
    expect(row?.promotionText).toBe("300 TL'ye 30 TL İndirim");
    expect(row?.listingRef).toBe('listing-xyz');
  });

  it('leaves the new offer fields null on a failed look rather than claiming no promotion', async () => {
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id: 'tracked-fields-failed',
      marketplaceCode: 'trendyol',
      productRef: '4',
      productUrl: 'https://www.trendyol.com/x-p-4',
      label: 'Okunamayan',
      isActive: true,
      addedAt: NOW,
    });
    const { source } = fakeSource(() => new CompetitorSourceError('boom', 'fetchFailed'));

    await run(source);

    const [row] = await trackedProductsRepo.latestTrackedProductObservations(
      db.appDb,
      'tracked-fields-failed',
    );
    expect(row?.status).toBe('fetchFailed');
    // `null`, not `false`: nothing was read, so nothing can be said about a promotion.
    expect(row?.hasPromotion).toBeNull();
    expect(row?.sellerRating).toBeNull();
    expect(row?.listingRef).toBeNull();
  });

  /**
   * 2026-09-03. The product page states the product's rating and the deep scrape was discarding
   * it, so `tracked_product_metrics` — the sales-velocity proxy the brand audit reads — moved
   * only once a day, from the catalogue sweep. The three cases that matter are all silent ones:
   * a rating that did not move must not add a row, an unreadable one must not erase a known
   * count, and a source that states no rating at all must not be read as stating zero.
   */
  describe('product rating from the deep scrape', () => {
    async function seedRated(id: string, ratingCount: number | null): Promise<void> {
      await trackedProductsRepo.addTrackedProduct(db.appDb, {
        id,
        marketplaceCode: 'trendyol',
        productRef: id,
        productUrl: `https://www.trendyol.com/x-p-${id}`,
        label: id,
        isActive: true,
        addedAt: NOW,
        ratingCount,
        ratingAverage: ratingCount === null ? null : 4.0,
      });
    }

    it('records the rating the page states, and updates the product row', async () => {
      await seedRated('rated-1', 100);
      const { source } = fakeSource(() => [offer()], { ratingCount: 219, ratingAverage: 4.68 });

      await run(source);

      const row = await trackedProductsRepo.getTrackedProduct(db.appDb, 'rated-1');
      expect(row?.ratingCount).toBe(219);
      expect(row?.ratingAverage).toBeCloseTo(4.68);
      const samples = await trackedProductsRepo.trackedProductMetricsSince(db.appDb, 'rated-1', 0);
      expect(samples.map((s) => s.ratingCount)).toEqual([219]);
    });

    it('adds no sample when the rating has not moved', async () => {
      await seedRated('rated-2', 219);
      const { source } = fakeSource(() => [offer()], { ratingCount: 219, ratingAverage: 4.68 });

      await run(source);

      // A rating moves slowly; a row per look would be millions a year saying "unchanged".
      expect(await trackedProductsRepo.trackedProductMetricsSince(db.appDb, 'rated-2', 0)).toHaveLength(0);
    });

    it('leaves a known count alone when the page states no rating', async () => {
      await seedRated('rated-3', 219);
      const { source } = fakeSource(() => [offer()], { ratingCount: null, ratingAverage: null });

      await run(source);

      // Our failure to read the node is not an event in the product's life, and writing it
      // would replace a known count with an unknown one.
      const row = await trackedProductsRepo.getTrackedProduct(db.appDb, 'rated-3');
      expect(row?.ratingCount).toBe(219);
      expect(await trackedProductsRepo.trackedProductMetricsSince(db.appDb, 'rated-3', 0)).toHaveLength(0);
    });

    it('writes nothing when the source states no product facts at all', async () => {
      await seedRated('rated-4', 219);
      // An offers-only source (Hepsiburada's listings endpoint) carries no product block. That
      // is "this source does not say", never "unrated".
      const { source } = fakeSource(() => [offer()]);

      await run(source);

      const row = await trackedProductsRepo.getTrackedProduct(db.appDb, 'rated-4');
      expect(row?.ratingCount).toBe(219);
      expect(await trackedProductsRepo.trackedProductMetricsSince(db.appDb, 'rated-4', 0)).toHaveLength(0);
    });

    it('keeps a genuine zero as a first sample rather than treating it as unknown', async () => {
      await seedRated('rated-5', null);
      const { source } = fakeSource(() => [offer()], { ratingCount: 0, ratingAverage: null });

      await run(source);

      const samples = await trackedProductsRepo.trackedProductMetricsSince(db.appDb, 'rated-5', 0);
      expect(samples.map((s) => s.ratingCount)).toEqual([0]);
      expect((await trackedProductsRepo.getTrackedProduct(db.appDb, 'rated-5'))?.ratingCount).toBe(0);
    });
  });

  it('an inactive tracked product is not scraped', async () => {
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id: 'tracked-3',
      marketplaceCode: 'trendyol',
      productRef: '2',
      productUrl: 'https://www.trendyol.com/x-p-2',
      label: 'Pasif',
      isActive: false,
      addedAt: NOW,
    });
    const { source, calls } = fakeSource(() => [offer()]);

    await run(source);

    expect(calls).toHaveLength(0);
    expect(await trackedProductsRepo.latestTrackedProductObservations(db.appDb, 'tracked-3')).toHaveLength(0);
  });

  /**
   * Change detection (Faz 4). The tracked-product half used to store every look, which was fine
   * for a few dozen operator-added products and is not for a brand catalogue of thousands.
   */
  describe('change detection', () => {
    async function seedTracked(id: string): Promise<void> {
      await trackedProductsRepo.addTrackedProduct(db.appDb, {
        id,
        marketplaceCode: 'trendyol',
        productRef: '757251065',
        productUrl: 'https://www.trendyol.com/x-p-757251065',
        label: 'Rakip Ürün X',
        isActive: true,
        addedAt: NOW,
      });
    }

    const HOUR = 60 * 60 * 1000;

    it('stores nothing on a second look with an unchanged offer set, but records the look', async () => {
      await seedTracked('tracked-cd-1');
      const { source } = fakeSource(() => [offer({ rank: 1, price: Money.fromKurus(99_00n) })]);

      await run(source);
      await run(source, NOW + HOUR);

      const all = await trackedProductsRepo.trackedProductObservationsSince(db.appDb, 'tracked-cd-1', 0);
      expect(all).toHaveLength(1);
      expect(all[0]?.observedAt).toBe(NOW);
      // The look itself is still recorded. Without this the screen would read a product whose
      // price has not moved in a week as one nobody has checked in a week.
      expect((await trackedProductsRepo.getTrackedProduct(db.appDb, 'tracked-cd-1'))?.lastScrapedAt).toBe(
        NOW + HOUR,
      );
    });

    it('stores the look when a price moves', async () => {
      await seedTracked('tracked-cd-2');
      const { source } = fakeSource((_ref, index) => [
        offer({ rank: 1, price: Money.fromKurus(index === 0 ? 99_00n : 89_00n) }),
      ]);

      await run(source);
      await run(source, NOW + HOUR);

      const all = await trackedProductsRepo.trackedProductObservationsSince(db.appDb, 'tracked-cd-2', 0);
      expect(all.map((o) => o.price)).toEqual([99_00n, 89_00n]);
    });

    it('a failed look never clears the hash, so the recovery look is not stored as a change', async () => {
      // The bug this guards: if a fetch failure reset the stored hash, every transient network
      // error would make the next successful look look like a price event and write a duplicate
      // offer set — a fake movement in the archive an audit would then report as real.
      await seedTracked('tracked-cd-3');
      const { source } = fakeSource((_ref, index) =>
        index === 1
          ? new CompetitorSourceError('boom', 'fetchFailed')
          : [offer({ rank: 1, price: Money.fromKurus(99_00n) })],
      );

      await run(source);
      await run(source, NOW + HOUR);
      await run(source, NOW + 2 * HOUR);

      const all = await trackedProductsRepo.trackedProductObservationsSince(db.appDb, 'tracked-cd-3', 0);
      expect(all.map((o) => o.status)).toEqual(['ok', 'fetchFailed']);
      expect(all.map((o) => o.observedAt)).toEqual([NOW, NOW + HOUR]);
    });

    it('never moves the recorded look backwards when a scrape lands out of order', async () => {
      await seedTracked('tracked-cd-4');
      const { source } = fakeSource(() => [offer({ rank: 1, price: Money.fromKurus(99_00n) })]);

      await run(source, NOW + HOUR);
      await run(source, NOW);

      expect((await trackedProductsRepo.getTrackedProduct(db.appDb, 'tracked-cd-4'))?.lastScrapedAt).toBe(
        NOW + HOUR,
      );
    });

    it('registers identified sellers, and skips the ones the page did not identify', async () => {
      // One seller record per company, whether we met them competing on a listing we sell or
      // selling a brand we own — what lets an operator's group and note (doc 05 §5) mean the
      // same thing on the brand screens as on the competitor ones.
      await seedTracked('tracked-cd-5');
      const { source } = fakeSource(() => [
        offer({ rank: 1, sellerRef: 'm-1', sellerName: 'Yetkili Bayi' }),
        offer({ rank: 2, sellerRef: null, sellerName: 'İsimsiz' }),
      ]);

      await run(source);

      const sellers = await competitorSellersRepo.listCompetitorSellers(db.appDb, {});
      expect(sellers.map((sel) => sel.sellerRef)).toEqual(['m-1']);
      expect(sellers[0]?.sellerName).toBe('Yetkili Bayi');
      expect(sellers[0]?.lastSeenAt).toBe(NOW);
    });

    it('keeps a seller current on an unchanged look', async () => {
      // A seller holding the same price all month is still there, and `last_seen_at` is the
      // field that says so — so registration follows the look, not the storing of it.
      await seedTracked('tracked-cd-6');
      const { source } = fakeSource(() => [offer({ rank: 1, sellerRef: 'm-1', sellerName: 'Bayi' })]);

      await run(source);
      await run(source, NOW + HOUR);

      const sellers = await competitorSellersRepo.listCompetitorSellers(db.appDb, {});
      expect(sellers[0]?.firstSeenAt).toBe(NOW);
      expect(sellers[0]?.lastSeenAt).toBe(NOW + HOUR);
    });
  });
});

