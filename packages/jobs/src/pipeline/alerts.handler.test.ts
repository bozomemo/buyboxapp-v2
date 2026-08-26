/**
 * The alert state machine, driven through `ScrapeCompetitors` (doc 12 Phase 10C).
 *
 * These assert the behaviours the feature lives or dies by: an alert is a *condition* with a
 * lifetime rather than a log line, a market-wide breach is one row carrying its offenders, a
 * rule created after the fact still fires, and none of it can disturb the scrape.
 */
import { CompetitorSourceError, type CompetitorOffer, type ICompetitorSource } from '@buybox/adapters';
import { alertsRepo, competitionRepo, eventsRepo, newId } from '@buybox/db';
import { Money } from '@buybox/shared';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from '../adapter-registry.js';
import { buildCompetitorSourceRegistry } from '../competitor-source-registry.js';
import { FakeClock } from '../clock.js';
import type { JobResult } from '../job.js';
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
import { SCRAPE_COMPETITORS_JOB, scrapeCompetitors } from './scrape-competitors.js';

const PAGE_EXTRA = encodeListingExtra({ url: null, contentId: '757251065' });
const HOUR = 60 * 60_000;

function offer(overrides: Partial<CompetitorOffer> = {}): CompetitorOffer {
  return {
    rank: 1,
    sellerRef: 's-1',
    sellerName: 'Rakip A',
    sellerRating: 9,
    listingRef: 'l-1',
    price: Money.fromKurus(45_000n),
    finalPrice: null,
    offeredStock: 5,
    dispatchTime: null,
    hasPromotion: false,
    promotionText: null,
    isWinner: true,
    ...overrides,
  };
}

function fakeSource(behaviour: (callIndex: number) => CompetitorOffer[] | Error): ICompetitorSource {
  let calls = 0;
  return {
    marketplaceCode: 'trendyol',
    fetchProductOffers: async () => {
      const result = behaviour(calls++);
      if (result instanceof Error) throw result;
      return { offers: result, diagnostics: { merchantCount: result.length, variantCount: result.length } };
    },
  } as ICompetitorSource;
}

describe('competitor alerts', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createSqliteTestDb();
    await seedMarketplace(db.appDb);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  async function rule(overrides: Partial<alertsRepo.AlertRuleRow> = {}): Promise<string> {
    const id = newId();
    await alertsRepo.upsertAlertRule(db.appDb, {
      id,
      name: 'Test kuralı',
      scopeType: 'all',
      scopeValue: null,
      subjectType: 'any',
      subjectValue: null,
      predicate: 'priceBelow',
      thresholdType: 'fixed',
      thresholdValue: 46_000n,
      thresholdPct: null,
      quietPeriodMs: 0,
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    });
    return id;
  }

  // Driven through the Scheduler rather than by calling the handler directly: the job logs
  // `app_events` rows whose `job_run_id` is a real foreign key, so a hand-made correlation id
  // fails the constraint. Going through the scheduler is also what production does.
  let runCounter = 0;
  async function run(source: ICompetitorSource, atMs = NOW): Promise<JobResult> {
    const scheduler = new Scheduler({
      appDb: db.appDb,
      clock: new FakeClock(atMs),
      adapters: buildAdapterRegistry([['trendyol', createFakeAdapter()]]),
      competitorSources: buildCompetitorSourceRegistry([['trendyol', source]]),
      instanceId: `alerts-${runCounter++}`,
    });
    let result: JobResult = { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
    scheduler.register({
      jobName: SCRAPE_COMPETITORS_JOB,
      handler: async (ctx) => {
        result = await scrapeCompetitors(ctx);
        return result;
      },
    });
    await scheduler.enqueueNow(
      SCRAPE_COMPETITORS_JOB,
      JSON.stringify({ marketplaceCode: 'trendyol' }),
    );
    await scheduler.tick();
    await scheduler.shutdown();
    return result;
  }

  it('opens an alert, keeps it open, then resolves it when the breach clears', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA });
    await rule();

    // Cycle 1: below the threshold — opens.
    await run(fakeSource(() => [offer({ price: Money.fromKurus(45_000n) })]), NOW);
    let open = await alertsRepo.listAlerts(db.appDb, 'open');
    expect(open).toHaveLength(1);
    expect(open[0]!.firstSeenAt).toBe(NOW);
    expect(open[0]!.sellers.map((s) => s.sellerRef)).toEqual(['s-1']);

    // Cycle 2: still below — the same alert, not a second one. This is the whole point of
    // modelling state instead of appending events.
    await run(fakeSource(() => [offer({ price: Money.fromKurus(44_000n) })]), NOW + HOUR);
    open = await alertsRepo.listAlerts(db.appDb, 'open');
    expect(open).toHaveLength(1);
    expect(open[0]!.firstSeenAt).toBe(NOW);
    expect(open[0]!.lastSeenAt).toBe(NOW + HOUR);
    // The evidence tracks the latest price, not the one it first fired at.
    expect(open[0]!.sellers[0]!.observedPrice).toBe(44_000n);

    // Cycle 3: back above the threshold — resolves.
    await run(fakeSource(() => [offer({ price: Money.fromKurus(47_000n) })]), NOW + 2 * HOUR);
    expect(await alertsRepo.listAlerts(db.appDb, 'open')).toHaveLength(0);
    const resolved = await alertsRepo.listAlerts(db.appDb, 'resolved');
    expect(resolved[0]!.resolvedAt).toBe(NOW + 2 * HOUR);
    // Departure is stamped, so "who was breaching, and until when" survives.
    expect(resolved[0]!.sellers[0]!.leftAt).toBe(NOW + 2 * HOUR);
  });

  it('fires for a rule created after the seller set stopped changing', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA });
    const source = fakeSource(() => [offer({ price: Money.fromKurus(45_000n) })]);

    // Two identical scrapes: the second writes no observations, because the payload hash is
    // unchanged. The rule is only created afterwards.
    await run(source, NOW);
    await run(source, NOW + HOUR);
    await rule();

    // Evaluating stored observations would find nothing new here and the rule would never fire.
    await run(source, NOW + 2 * HOUR);
    expect(await alertsRepo.listAlerts(db.appDb, 'open')).toHaveLength(1);
  });

  it('groups a market-wide breach into one alert carrying every offender', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA });
    await rule({ subjectType: 'any', thresholdValue: 46_000n });

    await run(
      fakeSource(() => [
        offer({ sellerRef: 's-1', rank: 1, price: Money.fromKurus(45_000n) }),
        offer({ sellerRef: 's-2', rank: 2, price: Money.fromKurus(44_000n), isWinner: false }),
        offer({ sellerRef: 's-3', rank: 3, price: Money.fromKurus(47_000n), isWinner: false }),
      ]),
      NOW,
    );

    const open = await alertsRepo.listAlerts(db.appDb, 'open');
    expect(open).toHaveLength(1); // one row, not two
    expect(open[0]!.sellers.map((s) => s.sellerRef).sort()).toEqual(['s-1', 's-2']);

    // A fourth seller joining an open breach updates the same alert and is timestamped, so it
    // can drive a notification without becoming a separate dashboard row.
    await run(
      fakeSource(() => [
        offer({ sellerRef: 's-1', rank: 1, price: Money.fromKurus(45_000n) }),
        offer({ sellerRef: 's-2', rank: 2, price: Money.fromKurus(44_000n), isWinner: false }),
        offer({ sellerRef: 's-4', rank: 3, price: Money.fromKurus(43_000n), isWinner: false }),
      ]),
      NOW + HOUR,
    );
    const after = await alertsRepo.listAlerts(db.appDb, 'open');
    expect(after).toHaveLength(1);
    const active = after[0]!.sellers.filter((s) => s.leftAt === null);
    expect(active.map((s) => s.sellerRef).sort()).toEqual(['s-1', 's-2', 's-4']);
    expect(active.find((s) => s.sellerRef === 's-4')!.joinedAt).toBe(NOW + HOUR);
  });

  it('a targeted rule keys per seller, so two sellers are two alerts', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA });
    await rule({ subjectType: 'seller', subjectValue: 's-1', thresholdValue: 46_000n });
    await rule({ subjectType: 'seller', subjectValue: 's-2', thresholdValue: 46_000n });

    await run(
      fakeSource(() => [
        offer({ sellerRef: 's-1', rank: 1, price: Money.fromKurus(45_000n) }),
        offer({ sellerRef: 's-2', rank: 2, price: Money.fromKurus(44_000n), isWinner: false }),
      ]),
      NOW,
    );
    expect(await alertsRepo.listAlerts(db.appDb, 'open')).toHaveLength(2);
  });

  it('holds an alert shut for the quiet period after it clears', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA });
    await rule({ quietPeriodMs: 6 * HOUR });

    const low = fakeSource(() => [offer({ price: Money.fromKurus(45_000n) })]);
    const high = fakeSource(() => [offer({ price: Money.fromKurus(47_000n) })]);

    await run(low, NOW);
    await run(high, NOW + HOUR); // resolves
    expect(await alertsRepo.listAlerts(db.appDb, 'open')).toHaveLength(0);

    // A competitor oscillating around the threshold must not reopen this every cycle.
    await run(low, NOW + 2 * HOUR);
    expect(await alertsRepo.listAlerts(db.appDb, 'open')).toHaveLength(0);

    // Past the quiet period it is a genuinely new episode, and gets its own row rather than
    // reusing the old one — two spans, not one.
    await run(low, NOW + 8 * HOUR);
    expect(await alertsRepo.listAlerts(db.appDb, 'open')).toHaveLength(1);
    expect(await alertsRepo.listAlerts(db.appDb, 'all')).toHaveLength(2);
  });

  it('an offer exactly at the threshold is not a breach', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA });
    await rule({ thresholdValue: 45_000n });
    await run(fakeSource(() => [offer({ price: Money.fromKurus(45_000n) })]), NOW);
    expect(await alertsRepo.listAlerts(db.appDb, 'open')).toHaveLength(0);
  });

  // We are one of the offers on our own listing, so without the own-merchant filter an
  // "any seller below X" rule reports our own price back to us as a competitor breach — and
  // looks like it is working while doing it.
  it('never fires on our own offer', async () => {
    const listingId = await seedListing(db.appDb, { extra: PAGE_EXTRA });
    await rule({ thresholdValue: 46_000n });
    await run(
      fakeSource(() => [
        // `seedMarketplace` configures `merchant-1` as our own merchant ref.
        offer({ rank: 1, sellerRef: 'merchant-1', sellerName: 'Bizim Mağaza', price: Money.fromKurus(44_000n) }),
      ]),
      NOW,
    );
    expect(await alertsRepo.listAlerts(db.appDb, 'open')).toHaveLength(0);

    // Our offer is still archived: the observation rows are the record of what the page showed,
    // and our own rank is only meaningful among the offers it ranks against.
    const observed = await competitionRepo.observationsAsOf(db.appDb, listingId, NOW + 1);
    expect(observed.map((o) => o.sellerRef)).toContain('merchant-1');
  });

  it('still fires on a competitor when our own offer is also below the threshold', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA });
    await rule({ thresholdValue: 46_000n });
    await run(
      fakeSource(() => [
        offer({ rank: 1, sellerRef: 'merchant-1', sellerName: 'Bizim Mağaza', price: Money.fromKurus(44_000n) }),
        offer({ rank: 2, sellerRef: 's-9', sellerName: 'Rakip B', price: Money.fromKurus(43_000n), isWinner: false }),
      ]),
      NOW,
    );
    const open = await alertsRepo.listAlerts(db.appDb, 'open');
    expect(open).toHaveLength(1);
    // Exactly one offender, and it is not us.
    expect(open[0]!.sellers.map((s) => s.sellerRef)).toEqual(['s-9']);
  });

  it('never fires on a discount that only promotion text advertises', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA });
    await rule({ thresholdValue: 40_000n });
    await run(
      fakeSource(() => [
        offer({ price: Money.fromKurus(45_000n), hasPromotion: true, promotionText: '3 Adet ve Üzeri 150 TL İndirim' }),
      ]),
      NOW,
    );
    expect(await alertsRepo.listAlerts(db.appDb, 'open')).toHaveLength(0);
  });

  it('a failed scrape neither opens nor resolves anything', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA });
    await rule();
    await run(fakeSource(() => [offer({ price: Money.fromKurus(45_000n) })]), NOW);
    expect(await alertsRepo.listAlerts(db.appDb, 'open')).toHaveLength(1);

    // A page we could not read tells us nothing about the breach. Resolving here would report
    // "all clear" on the strength of a network failure — the exact inversion the staleness
    // banner exists to prevent.
    await run(fakeSource(() => new CompetitorSourceError('gone', 'fetchFailed')), NOW + HOUR);
    expect(await alertsRepo.listAlerts(db.appDb, 'open')).toHaveLength(1);
  });

  it('an alerting failure never fails the scrape', async () => {
    const listingId = await seedListing(db.appDb, { extra: PAGE_EXTRA });
    await rule();
    if (db.appDb.dialect !== 'sqlite') throw new Error('this fault injection assumes the sqlite test db');
    db.appDb.db.run(sql`DROP TABLE alert_sellers`);

    const result = await run(fakeSource(() => [offer({ price: Money.fromKurus(45_000n) })]), NOW);

    expect(result).toMatchObject({ itemsOk: 1, itemsFailed: 0 });
    expect(result.error).toBeUndefined();
    const scrapeRun = await competitionRepo.latestScrapeRun(db.appDb, listingId);
    expect(scrapeRun?.status).toBe('ok');
    expect(await competitionRepo.observationsAsOf(db.appDb, listingId, NOW)).toHaveLength(1);

    const events = await eventsRepo.listRecentEvents(db.appDb, 50);
    expect(events.filter((e) => e.code === 'AlertEvaluationFailed').map((e) => e.level)).toEqual(['warn']);
  });

  it('writes nothing at all when no rule exists', async () => {
    await seedListing(db.appDb, { extra: PAGE_EXTRA });
    await run(fakeSource(() => [offer({ price: Money.fromKurus(1n) })]), NOW);
    expect(await alertsRepo.listAlerts(db.appDb, 'all')).toHaveLength(0);
  });
});
