/**
 * `ScrapeCompetitors` (doc 07 §7, doc 12 Phase 7).
 *
 * The last test in this file is the phase's definition of done — "disabling the scraper
 * entirely leaves repricing fully functional" — asserted rather than assumed.
 */
import {
  CompetitorSourceError,
  type CompetitorOffer,
  type CompetitorPageSnapshot,
  type ICompetitorSource,
  type ProductPageRef,
} from '@buybox/adapters';
import { competitionRepo, competitorSellersRepo, configRepo, eventsRepo, repricingRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from '../adapter-registry.js';
import { buildCompetitorSourceRegistry } from '../competitor-source-registry.js';
import { FakeClock } from '../clock.js';
import type { JobProgress, JobResult } from '../job.js';
import { Scheduler } from '../scheduler.js';
import {
  createFakeAdapter,
  createSqliteTestDb,
  NOW,
  seedListing,
  seedMarketplace,
  type TestDb,
} from '../test-helpers.js';
import { encodeListingExtra } from './listing-extra.js';
import { REPRICE_JOB, reprice } from './reprice.js';
import {
  hashOffers,
  isDueForScrape,
  scrapeCompetitors,
  SCRAPE_COMPETITORS_JOB,
} from './scrape-competitors.js';

const PAGE_EXTRA = encodeListingExtra({ url: null, contentId: '757251065' });

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

/** A controllable `ICompetitorSource` double — never a network call (doc 10 §10). */
function fakeSource(behaviour: (ref: ProductPageRef, callIndex: number) => CompetitorOffer[] | Error): {
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

describe('ScrapeCompetitors', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createSqliteTestDb();
    await seedMarketplace(db.appDb);
  });

  afterEach(() => db.cleanup());

  /**
   * Runs the job through a real `Scheduler`, as the other pipeline tests do: `app_events`
   * carries a real FK to `job_runs.id`, so a handler that logs events can only be exercised
   * from inside an actual run.
   */
  async function run(
    source: ICompetitorSource | undefined,
    payload: Record<string, unknown> = {},
    nowMs: number = NOW,
    /** Taps the live progress the job reports to the Jobs screen (doc 06 §7), without the throttle. */
    onProgress?: (progress: JobProgress) => void,
  ): Promise<JobResult> {
    const scheduler = new Scheduler({
      appDb: db.appDb,
      clock: new FakeClock(nowMs),
      adapters: buildAdapterRegistry([['trendyol', createFakeAdapter()]]),
      competitorSources: source ? buildCompetitorSourceRegistry([['trendyol', source]]) : undefined,
      instanceId: `test-${runCounter++}`,
    });
    let result: JobResult = { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
    scheduler.register({
      jobName: SCRAPE_COMPETITORS_JOB,
      handler: async (ctx) => {
        result = await scrapeCompetitors(
          onProgress
            ? {
                ...ctx,
                reportProgress: (progress) => {
                  onProgress(progress);
                  ctx.reportProgress(progress);
                },
              }
            : ctx,
        );
        return result;
      },
    });
    await scheduler.enqueueNow(
      SCRAPE_COMPETITORS_JOB,
      JSON.stringify({ marketplaceCode: 'trendyol', cycleNumber: 0, ...payload }),
    );
    await scheduler.tick();
    await scheduler.shutdown();
    return result;
  }

  it('doc 07 §4: hot every cycle, warm daily, cold weekly, frozen never', () => {
    expect(isDueForScrape('hot', 7, 24, 168)).toBe(true);
    expect(isDueForScrape('warm', 24, 24, 168)).toBe(true);
    expect(isDueForScrape('warm', 25, 24, 168)).toBe(false);
    expect(isDueForScrape('cold', 168, 24, 168)).toBe(true);
    expect(isDueForScrape('cold', 24, 24, 168)).toBe(false);
    expect(isDueForScrape('frozen', 0, 24, 168)).toBe(false);
  });

  it('doc 07 §7: writes a scrape_runs row on every run and observations on the first', async () => {
    const listingId = await seedListing(db.appDb, { extra: PAGE_EXTRA });
    const { source, calls } = fakeSource(() => [
      offer(),
      offer({ rank: 2, sellerRef: 'seller-b', isWinner: false }),
    ]);

    const result = await run(source);

    expect(result).toMatchObject({ itemsTotal: 1, itemsOk: 1, itemsFailed: 0 });
    expect(calls).toEqual([{ url: null, contentId: '757251065' }]);

    const scrapeRun = await competitionRepo.latestScrapeRun(db.appDb, listingId);
    expect(scrapeRun).toMatchObject({ status: 'ok', sellerCount: 2, changed: true });

    const observations = await competitionRepo.observationsAsOf(db.appDb, listingId, NOW);
    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({ rank: 1, sellerRef: 'seller-a', price: 150_000n, rating: 9.2 });
  });

  it('doc 06 §7: reports which listing is in flight, before fetching it', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA, baseStockCode: 'ABC-1' });
    await seedListing(db.appDb, {
      extra: PAGE_EXTRA,
      baseStockCode: 'ABC-2',
      marketplaceListingId: 'barcode-2',
    });
    const { source } = fakeSource(() => [offer()]);

    const progress: JobProgress[] = [];
    await run(source, {}, NOW, (p) => progress.push(p));

    expect(progress).toHaveLength(2);
    // `done` is the count *completed*, so the first report is 0 — the operator sees an empty
    // bar with the first product named, not a bar already claiming one item done.
    expect(progress[0]).toMatchObject({ done: 0, total: 2 });
    expect(progress[1]).toMatchObject({ done: 1, total: 2 });
    expect(progress.map((p) => p.currentItem)).toEqual(['ABC-1 · Widget', 'ABC-2 · Widget']);
  });

  it('doc 07 §7: an unchanged seller set writes the proof-of-look row but no new observations', async () => {
    const listingId = await seedListing(db.appDb, { extra: PAGE_EXTRA });
    const { source } = fakeSource(() => [offer()]);

    await run(source);
    await run(source, {}, NOW + 60 * 60_000);

    const runs = await competitionRepo.scrapeRunsInRange(db.appDb, {
      sinceMs: 0,
      untilMs: NOW + 60 * 60_001,
    });
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.changed)).toEqual([true, false]);

    const observations = await competitionRepo.observationsAsOf(db.appDb, listingId, NOW);
    expect(observations).toHaveLength(1); // not duplicated by the second, identical scrape
  });

  it('a changed price writes a fresh observation set', async () => {
    const listingId = await seedListing(db.appDb, { extra: PAGE_EXTRA });
    const { source } = fakeSource((_ref, index) =>
      index === 0 ? [offer()] : [offer({ price: Money.fromKurus(140_000n) })],
    );

    // Two cycles an hour apart — as they would be in production. Same-millisecond runs would
    // land in one batch, which `observationsAsOf` reconstructs as a single point in time.
    await run(source);
    await run(source, {}, NOW + 60 * 60_000);

    const observations = await competitionRepo.observationsAsOf(db.appDb, listingId, NOW + 60 * 60_000);
    expect(observations).toHaveLength(1);
    expect(observations[0]!.price).toBe(140_000n);
  });

  it('hashes normalised offers, not the page, so identical sellers hash identically', () => {
    expect(hashOffers([offer()])).toBe(hashOffers([offer()]));
    expect(hashOffers([offer()])).not.toBe(hashOffers([offer({ price: Money.fromKurus(1n) })]));
  });

  // The measured churn (see `hashOffers`): stock, rating and promotion text moved on most
  // scrapes without any competitive event, rewriting whole batches for nothing.
  it.each([
    ['offeredStock', { offeredStock: 99 }],
    ['sellerRating', { sellerRating: 1.1 }],
    ['promotionText', { promotionText: '3 Adet ve Üzeri 150 TL İndirim' }],
    ['hasPromotion', { hasPromotion: true }],
    ['sellerName', { sellerName: 'Satıcı A (yeni unvan)' }],
    ['listingRef', { listingRef: 'listing-b' }],
    ['dispatchTime', { dispatchTime: 3 }],
  ])('does not treat a change in %s as a new seller set', (_field, override) => {
    expect(hashOffers([offer(override)])).toBe(hashOffers([offer()]));
  });

  // The other half of the same decision: ranking is data, not churn. Every rank-only
  // transition in the measured sample was a real buybox hand-over at an unchanged price,
  // which is exactly what doc 06 §6's buybox-share report counts.
  it.each([
    ['rank', { rank: 2, isWinner: false }],
    ['sellerRef', { sellerRef: 'seller-b' }],
    ['price', { price: Money.fromKurus(149_900n) }],
    ['finalPrice', { finalPrice: Money.fromKurus(149_900n) }],
  ])('treats a change in %s as a new seller set', (_field, override) => {
    expect(hashOffers([offer(override)])).not.toBe(hashOffers([offer()]));
  });

  it('records a buybox hand-over between two equally-priced sellers', () => {
    const before = [offer({ rank: 1, sellerRef: 'a' }), offer({ rank: 2, sellerRef: 'b', isWinner: false })];
    const after = [offer({ rank: 2, sellerRef: 'a', isWinner: false }), offer({ rank: 1, sellerRef: 'b' })];
    expect(hashOffers(after)).not.toBe(hashOffers(before));
  });

  it('records seller identities, skipping the ones the payload never identified', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA });
    const { source } = fakeSource(() => [
      offer({ rank: 1, sellerRef: 'm-1', sellerName: 'The Olympus' }),
      offer({ rank: 2, sellerRef: 'm-2', sellerName: 'TurnaStore', isWinner: false }),
      // No id on the page: nothing durable to record, and matching it by display name is the
      // mistake the table exists to avoid.
      offer({ rank: 3, sellerRef: null, sellerName: 'İsimsiz', isWinner: false }),
    ]);

    await run(source);

    const sellers = await competitorSellersRepo.listCompetitorSellers(db.appDb);
    expect(sellers.map((s) => s.sellerRef).sort()).toEqual(['m-1', 'm-2']);
    expect(sellers.every((s) => s.marketplaceCode === 'trendyol')).toBe(true);
    expect(sellers.find((s) => s.sellerRef === 'm-1')?.sellerName).toBe('The Olympus');
  });

  it('a failure to record seller identities never fails the scrape', async () => {
    const listingId = await seedListing(db.appDb, { extra: PAGE_EXTRA });
    const { source } = fakeSource(() => [offer({ sellerRef: 'm-1' })]);

    // Fault injection by removing the table outright, rather than by feeding it a bad value:
    // an over-long ref would be rejected by MySQL/Postgres but silently accepted by SQLite,
    // which is the only dialect this file runs on — the test would then assert nothing.
    if (db.appDb.dialect !== 'sqlite') throw new Error('this fault injection assumes the sqlite test db');
    db.appDb.db.run(sql`DROP TABLE competitor_sellers`);

    const result = await run(source);

    // The scrape's own output is what matters and it is untouched.
    expect(result).toMatchObject({ itemsOk: 1, itemsFailed: 0 });
    expect(result.error).toBeUndefined();
    const scrapeRun = await competitionRepo.latestScrapeRun(db.appDb, listingId);
    expect(scrapeRun?.status).toBe('ok');
    expect(await competitionRepo.observationsAsOf(db.appDb, listingId, NOW)).toHaveLength(1);

    // Recorded, not swallowed silently: this one is a real defect, unlike a single page 404.
    const events = await eventsRepo.listRecentEvents(db.appDb, 50);
    expect(events.filter((e) => e.code === 'CompetitorSellerUpsertFailed').map((e) => e.level)).toEqual([
      'warn',
    ]);
  });

  it('records fetchFailed and parseFailed distinctly, and stays silent per failure', async () => {
    const listingId = await seedListing(db.appDb, { extra: PAGE_EXTRA });
    const { source } = fakeSource(() => new CompetitorSourceError('page gone', 'parseFailed'));

    const result = await run(source);

    expect(result).toMatchObject({ itemsOk: 0, itemsFailed: 1 });
    expect(result.error).toBeUndefined(); // doc 07 §7: one bad page never fails the run
    const scrapeRun = await competitionRepo.latestScrapeRun(db.appDb, listingId);
    expect(scrapeRun).toMatchObject({ status: 'parseFailed', changed: false, sellerCount: 0 });

    const events = await eventsRepo.listRecentEvents(db.appDb, 50);
    // Per-failure silence: recorded at debug, never as a warn/error alert of its own.
    expect(events.filter((e) => e.code === 'ScrapeFailed').map((e) => e.level)).toEqual(['debug']);
    expect(events.some((e) => e.code === 'ScrapeFailureRateHigh')).toBe(false);
  });

  it('a failed scrape does not make the next identical successful scrape look "changed"', async () => {
    const listingId = await seedListing(db.appDb, { extra: PAGE_EXTRA });
    const { source } = fakeSource((_ref, index) =>
      index === 1 ? new CompetitorSourceError('timeout', 'fetchFailed') : [offer()],
    );

    await run(source); // ok    → changed
    await run(source, {}, NOW + 60 * 60_000); // failed
    await run(source, {}, NOW + 120 * 60_000); // ok, identical to the first

    const runs = await competitionRepo.scrapeRunsInRange(db.appDb, {
      sinceMs: 0,
      untilMs: NOW + 200 * 60_000,
    });
    expect(runs.map((r) => `${r.status}:${r.changed}`)).toEqual(['ok:true', 'fetchFailed:false', 'ok:false']);
    expect(await competitionRepo.observationsAsOf(db.appDb, listingId, NOW)).toHaveLength(1);
  });

  it('doc 07 §7: the failure *rate* alerts once the sample is big enough', async () => {
    for (let i = 0; i < 12; i += 1) {
      await seedListing(db.appDb, {
        baseStockCode: `1000${i}`,
        marketplaceListingId: `barcode-${i}`,
        extra: PAGE_EXTRA,
      });
    }
    const { source } = fakeSource(() => new CompetitorSourceError('blocked', 'fetchFailed'));

    await run(source);

    const events = await eventsRepo.listRecentEvents(db.appDb, 50, 'error');
    const alert = events.find((e) => e.code === 'ScrapeFailureRateHigh');
    expect(alert).toBeDefined();
    expect(alert!.message).toContain('repricing is unaffected');
  });

  it('skips listings with no product-page reference, and says so once', async () => {
    await seedListing(db.appDb, { extra: null });
    const { source, calls } = fakeSource(() => [offer()]);

    const result = await run(source);

    expect(calls).toHaveLength(0);
    expect(result).toMatchObject({ itemsOk: 0, itemsFailed: 0 });
    const events = await eventsRepo.listRecentEvents(db.appDb, 50);
    expect(events.filter((e) => e.code === 'ScrapeSkippedNoProductPage')).toHaveLength(1);
  });

  it('scrape candidates are gated on observationEnabled, independent of repriceEnabled', async () => {
    // Watched, but not opted into the pricing engine — must still be scraped.
    await seedListing(db.appDb, {
      marketplaceListingId: 'watched-only',
      baseStockCode: '20001',
      extra: PAGE_EXTRA,
      repriceEnabled: false,
      observationEnabled: true,
    });
    // Opted into the pricing engine, but not watched — must NOT be scraped.
    await seedListing(db.appDb, {
      marketplaceListingId: 'reprice-only',
      baseStockCode: '20002',
      extra: PAGE_EXTRA,
      repriceEnabled: true,
      observationEnabled: false,
    });
    const { source, calls } = fakeSource(() => [offer()]);

    const result = await run(source);

    expect(calls).toHaveLength(1);
    expect(result.itemsTotal).toBe(1);
  });

  it('with no competitor source registered, reports a no-op instead of throwing', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA });
    const result = await run(undefined);
    expect(result).toMatchObject({ itemsTotal: 0, itemsOk: 0, itemsFailed: 0 });
    expect(result.error).toContain('no competitor source registered');
  });

  it('caps the pages fetched per run so one cycle can never crawl the whole catalogue', async () => {
    for (let i = 0; i < 5; i += 1) {
      await seedListing(db.appDb, {
        baseStockCode: `2000${i}`,
        marketplaceListingId: `bc-${i}`,
        extra: PAGE_EXTRA,
      });
    }
    const { source, calls } = fakeSource(() => [offer()]);

    const result = await run(source, { maxListings: 2 });

    expect(calls).toHaveLength(2);
    expect(result.itemsTotal).toBe(2);
  });
});

describe('doc 12 Phase 7 definition of done — repricing without the scraper', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createSqliteTestDb();
    await seedMarketplace(db.appDb);
  });

  afterEach(() => db.cleanup());

  async function runReprice(): Promise<JobResult> {
    const scheduler = new Scheduler({
      appDb: db.appDb,
      clock: new FakeClock(NOW),
      adapters: buildAdapterRegistry([['trendyol', createFakeAdapter()]]),
      // No competitorSources at all — the scraper is not merely disabled, it does not exist.
      instanceId: `reprice-${runCounter++}`,
    });
    let result: JobResult = { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
    scheduler.register({
      jobName: REPRICE_JOB,
      handler: async (ctx) => {
        result = await reprice(ctx);
        return result;
      },
    });
    await scheduler.enqueueNow(REPRICE_JOB, JSON.stringify({ marketplaceCode: 'trendyol', mode: 'live' }));
    await scheduler.tick();
    await scheduler.shutdown();
    return result;
  }

  it('reprices normally with no competitor source, no scrape data and no scrape_runs', async () => {
    const listingId = await seedListing(db.appDb, { extra: null });
    await competitionRepo.insertBuyboxObservation(db.appDb, {
      id: 'obs-1',
      listingId,
      observedAt: NOW,
      rank: 2,
      buyboxPrice: 180_000n,
      secondPrice: 190_000n,
      thirdPrice: null,
      hasMultipleSeller: true,
      source: 'api',
    });

    const result = await runReprice();

    expect(result.itemsFailed).toBe(0);
    expect(result.itemsOk).toBe(1);
    // The engine ran and committed a decision — the scraper's absence changed nothing.
    expect(await repricingRepo.getRepricingState(db.appDb, listingId)).toBeDefined();
  });

  it('doc 03 T-22: the seller-identity trigger is skipped, not faked, when scrape data is stale', async () => {
    await configRepo.upsertRepricingPolicy(db.appDb, {
      ...(await configRepo.getRepricingPolicy(db.appDb, 'trendyol'))!,
      useSellerIdentityTrigger: true,
    });
    const listingId = await seedListing(db.appDb, { extra: PAGE_EXTRA });
    await competitionRepo.insertBuyboxObservation(db.appDb, {
      id: 'obs-2',
      listingId,
      observedAt: NOW,
      rank: 1,
      buyboxPrice: 150_000n,
      secondPrice: 190_000n,
      thirdPrice: null,
      hasMultipleSeller: true,
      source: 'api',
    });
    // Competitor data from three months ago: present, but far past the trust window.
    const staleAt = NOW - 90 * 24 * 60 * 60_000;
    await competitionRepo.recordScrapeRun(
      db.appDb,
      {
        id: 'stale-run',
        listingId,
        observedAt: staleAt,
        source: 'publicPage',
        sellerCount: 2,
        payloadHash: 'stale',
        status: 'ok',
        changed: true,
      },
      [
        {
          id: 'stale-obs',
          listingId,
          scrapeRunId: 'stale-run',
          observedAt: staleAt,
          rank: 1,
          sellerName: 'Eski Rakip',
          sellerRef: 'seller-long-gone',
          price: 190_000n,
          finalPrice: 190_000n,
          rating: 8,
          dispatchTime: null,
          offeredStock: 1,
          hasPromotion: false,
          promotionText: null,
        },
      ],
    );

    const result = await runReprice();
    expect(result.itemsFailed).toBe(0);

    const state = await repricingRepo.getRepricingState(db.appDb, listingId);
    // Stale identity is never written into the optimum context — it would fire a spurious
    // re-probe against a seller who has since left.
    expect(state?.optimumCtxSecondSellerRef ?? null).toBeNull();
  });

  it('doc 12 7.4: a fresh scrape showing a new runner-up invalidates the optimum', async () => {
    await configRepo.upsertRepricingPolicy(db.appDb, {
      ...(await configRepo.getRepricingPolicy(db.appDb, 'trendyol'))!,
      useSellerIdentityTrigger: true,
    });
    const listingId = await seedListing(db.appDb, { price: 150_000n, unitCost: 10_000n, extra: PAGE_EXTRA });
    await competitionRepo.insertBuyboxObservation(db.appDb, {
      id: 'obs-3',
      listingId,
      observedAt: NOW,
      rank: 1, // we hold the buybox — the OPTIMUM branch's precondition
      buyboxPrice: 150_000n,
      secondPrice: 190_000n,
      thirdPrice: null,
      hasMultipleSeller: true,
      source: 'api',
    });
    // Converged against a runner-up who has since been replaced.
    await repricingRepo.upsertRepricingState(db.appDb, {
      listingId,
      phase: 'OPTIMUM',
      lastGoodPrice: 150_000n,
      lastBadPrice: null,
      optimumPrice: 150_000n,
      optimumCtxUnitCost: 10_000n,
      optimumCtxCommissionRate: 15,
      optimumCtxVatRate: 20,
      optimumCtxCampaignRatio: 0,
      optimumCtxSecondPrice: 190_000n,
      optimumCtxSecondSellerRef: 'seller-old',
      pendingSubmissionId: null,
      settleUntil: null,
      consecutiveRejections: 0,
      updatedAt: NOW,
    });
    // A scrape from an hour ago: well inside the trust window, and the runner-up is new.
    // 'merchant-1' is our own merchant ref (seedMarketplace), so it is excluded as ours.
    const freshAt = NOW - 60 * 60_000;
    await competitionRepo.recordScrapeRun(
      db.appDb,
      {
        id: 'fresh-run',
        listingId,
        observedAt: freshAt,
        source: 'publicPage',
        sellerCount: 2,
        payloadHash: 'fresh',
        status: 'ok',
        changed: true,
      },
      [
        {
          id: 'fresh-obs-1',
          listingId,
          scrapeRunId: 'fresh-run',
          observedAt: freshAt,
          rank: 1,
          sellerName: 'Biz',
          sellerRef: 'merchant-1',
          price: 150_000n,
          finalPrice: 150_000n,
          rating: 9.5,
          dispatchTime: null,
          offeredStock: 10,
          hasPromotion: false,
          promotionText: null,
        },
        {
          id: 'fresh-obs-2',
          listingId,
          scrapeRunId: 'fresh-run',
          observedAt: freshAt,
          rank: 2,
          sellerName: 'Yeni Rakip',
          sellerRef: 'seller-new',
          price: 190_000n,
          finalPrice: 190_000n,
          rating: 8.1,
          dispatchTime: null,
          offeredStock: 3,
          hasPromotion: false,
          promotionText: null,
        },
      ],
    );

    const result = await runReprice();
    expect(result.itemsFailed).toBe(0);

    const state = await repricingRepo.getRepricingState(db.appDb, listingId);
    // doc 03 §6.5: the runner-up changed, so the optimum is stale and the engine re-probes.
    expect(state?.phase).not.toBe('OPTIMUM');
  });

  it('the scrape job is off until an operator turns it on (api-references §1.6)', async () => {
    const { isJobEnabled } = await import('../scheduler.js');
    expect(await isJobEnabled(db.appDb, SCRAPE_COMPETITORS_JOB)).toBe(false);

    await configRepo.setAppSetting(
      db.appDb,
      {
        key: `job.${SCRAPE_COMPETITORS_JOB}.enabled`,
        value: 'true',
        updatedBy: 'operator',
        updatedAt: NOW,
      },
      'audit-1',
    );
    expect(await isJobEnabled(db.appDb, SCRAPE_COMPETITORS_JOB)).toBe(true);
  });
});
