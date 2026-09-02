import { afterEach, describe, expect, it } from 'vitest';
import { newId } from './id.js';
import { DEFAULT_RETENTION_WINDOWS, pruneHistory } from './prune-history.js';
import * as competitionRepo from './repositories/competition.js';
import * as configRepo from './repositories/config.js';
import * as eventsRepo from './repositories/events.js';
import * as listingsRepo from './repositories/listings.js';
import * as stockRepo from './repositories/stock.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from './test-helpers.js';

const NOW = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

describe.each(ALL_DIALECTS)('pruneHistory on %s', (dialect) => {
  let testDb: TestDb | undefined;

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it('enforces every configured retention window in one call', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    await configRepo.upsertMarketplace(appDb, {
      code: 'TY',
      displayName: 'Trendyol',
      enabled: true,
      merchantRef: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const oldEventId = newId();
    await eventsRepo.logEvent(appDb, {
      id: oldEventId,
      at: NOW - 200 * DAY_MS, // well past the 3-day info/debug window
      level: 'info',
      marketplaceCode: null,
      listingId: null,
      jobRunId: null,
      code: 'old.event',
      message: 'stale',
      context: null,
    });
    const recentEventId = newId();
    await eventsRepo.logEvent(appDb, {
      id: recentEventId,
      at: NOW - DAY_MS,
      level: 'info',
      marketplaceCode: null,
      listingId: null,
      jobRunId: null,
      code: 'recent.event',
      message: 'fresh',
      context: null,
    });

    // Between the two windows: gone under the 3-day info/debug rule, kept under the 30-day
    // warn/error one. This row is what makes the two windows separately observable — without it
    // the test passes with a single window applied to every level.
    const midErrorId = newId();
    await eventsRepo.logEvent(appDb, {
      id: midErrorId,
      at: NOW - 10 * DAY_MS,
      level: 'error',
      marketplaceCode: null,
      listingId: null,
      jobRunId: null,
      code: 'mid.error',
      message: 'kept',
      context: null,
    });
    const oldErrorId = newId();
    await eventsRepo.logEvent(appDb, {
      id: oldErrorId,
      at: NOW - 200 * DAY_MS,
      level: 'error',
      marketplaceCode: null,
      listingId: null,
      jobRunId: null,
      code: 'old.error',
      message: 'stale',
      context: null,
    });

    await pruneHistory(appDb, DEFAULT_RETENTION_WINDOWS, NOW);

    const remaining = await eventsRepo.listRecentEvents(appDb, 10);
    const ids = remaining.map((e) => e.id);
    expect(ids).not.toContain(oldEventId);
    expect(ids).toContain(recentEventId);
    expect(ids).toContain(midErrorId);
    expect(ids).not.toContain(oldErrorId);
  }, 30_000);

  it('ages out raw competitor offers but keeps every proof-of-look row', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    await configRepo.upsertMarketplace(appDb, {
      code: 'TY',
      displayName: 'Trendyol',
      enabled: true,
      merchantRef: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await stockRepo.upsertStockItem(appDb, {
      baseStockCode: 'SKU-1',
      name: 'Widget',
      unitCost: 1000n,
      unitStock: 5,
      sourceCode: 'manual',
      sourceRef: null,
      costUpdatedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const listingId = newId();
    await listingsRepo.upsertListing(appDb, {
      id: listingId,
      marketplaceCode: 'TY',
      marketplaceListingId: 'barcode-1',
      sellerStockCode: 'SKU-1',
      baseStockCode: 'SKU-1',
      unitCount: 1,
      isBundle: false,
      productName: 'Widget',
      price: 2000n,
      listPrice: null,
      customerPrice: null,
      offeredStock: 10,
      commissionRate: 16,
      vatRate: 10,
      dispatchTime: null,
      isSalable: true,
      isLocked: false,
      isSuspended: false,
      isFrozen: false,
      isArchived: false,
      isBlacklisted: false,
      lockReasons: null,
      deactivationReasons: null,
      minPrice: null,
      maxPrice: null,
      allowIncrease: true,
      allowDecrease: true,
      repriceEnabled: false,
      observationEnabled: true,
      extra: null,
      firstSeenAt: NOW,
      lastSeenAt: NOW,
      updatedAt: NOW,
    });

    const offer = (scrapeRunId: string, observedAt: number, sellerRef: string) => ({
      id: newId(),
      listingId,
      scrapeRunId,
      observedAt,
      rank: 1,
      sellerName: 'Rakip',
      sellerRef,
      price: 1990n,
      finalPrice: null,
      rating: null,
      dispatchTime: null,
      offeredStock: null,
      hasPromotion: false,
      promotionText: null,
    });

    const staleRun = newId();
    const staleAt = NOW - 200 * DAY_MS; // past the 90-day window
    await competitionRepo.recordScrapeRun(
      appDb,
      {
        id: staleRun,
        listingId,
        observedAt: staleAt,
        source: 'publicPage',
        sellerCount: 1,
        payloadHash: 'hash-old',
        status: 'ok',
        changed: false,
      },
      [offer(staleRun, staleAt, 'seller-old')],
    );

    const freshRun = newId();
    const freshAt = NOW - DAY_MS;
    await competitionRepo.recordScrapeRun(
      appDb,
      {
        id: freshRun,
        listingId,
        observedAt: freshAt,
        source: 'publicPage',
        sellerCount: 1,
        payloadHash: 'hash-new',
        status: 'ok',
        changed: false,
      },
      [offer(freshRun, freshAt, 'seller-new')],
    );

    await pruneHistory(appDb, DEFAULT_RETENTION_WINDOWS, NOW);

    const offers = await competitionRepo.competitorObservationsInRange(appDb, {
      sinceMs: staleAt - DAY_MS,
      untilMs: NOW,
    });
    expect(offers.map((o) => o.sellerRef)).toEqual(['seller-new']);

    // The coverage denominator outlives the detail. Pruning these alongside the offers would
    // leave "no sellers observed" indistinguishable from "we no longer keep who they were".
    const runs = await competitionRepo.scrapeRunsInRange(appDb, {
      sinceMs: staleAt - DAY_MS,
      untilMs: NOW,
    });
    expect(runs.map((r) => r.id).sort()).toEqual([staleRun, freshRun].sort());
  }, 30_000);
});
