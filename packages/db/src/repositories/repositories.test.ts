import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as competitionRepo from './competition.js';
import * as configRepo from './config.js';
import * as eventsRepo from './events.js';
import * as jobsRepo from './jobs.js';
import * as listingsRepo from './listings.js';
import * as repricingRepo from './repricing.js';
import * as stockRepo from './stock.js';

const NOW = Date.UTC(2026, 0, 1);

async function seed(
  appDb: AppDatabase,
): Promise<{ marketplaceCode: string; baseStockCode: string; listingId: string }> {
  const marketplaceCode = 'TY';
  await configRepo.upsertMarketplace(appDb, {
    code: marketplaceCode,
    displayName: 'Trendyol',
    enabled: true,
    merchantRef: 'merchant-1',
    createdAt: NOW,
    updatedAt: NOW,
  });

  const baseStockCode = '12345';
  await stockRepo.upsertStockItem(appDb, {
    baseStockCode,
    name: 'Widget',
    unitCost: 1000n,
    unitStock: 50,
    sourceCode: 'manual',
    sourceRef: null,
    costUpdatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });

  const listingId = newId();
  await listingsRepo.upsertListing(appDb, {
    id: listingId,
    marketplaceCode,
    marketplaceListingId: 'barcode-1',
    sellerStockCode: baseStockCode,
    baseStockCode,
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
    repriceEnabled: true,
    extra: null,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    updatedAt: NOW,
  });

  return { marketplaceCode, baseStockCode, listingId };
}

describe.each(ALL_DIALECTS)('repositories on %s', (dialect) => {
  let testDb: TestDb | undefined;

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it('config: marketplaces, effective-dated fee settings, repricing policy, settings audit', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { marketplaceCode } = await seed(appDb);

    const marketplace = await configRepo.getMarketplace(appDb, marketplaceCode);
    expect(marketplace?.displayName).toBe('Trendyol');

    // Two effective-dated fee settings rows; the getter must pick the latest at-or-before `atMs`.
    await configRepo.insertFeeSettings(appDb, {
      id: newId(),
      marketplaceCode,
      effectiveFrom: NOW - 10_000,
      commissionVatRate: 20,
      commissionRateIncludesVat: false,
      commissionVatDeductible: false,
      commissionBase: 'gross',
      defaultCommissionRate: 16,
      cargoBands: '[]',
      cargoAmountsIncludeVat: true,
      cargoVatRate: 20,
      cargoVatDeductible: false,
      expenditureBands: '[]',
      expenditureIncludesVat: true,
      expenditureVatRate: 20,
      expenditureVatDeductible: false,
    });
    const laterId = newId();
    await configRepo.insertFeeSettings(appDb, {
      id: laterId,
      marketplaceCode,
      effectiveFrom: NOW - 1_000,
      commissionVatRate: 20,
      commissionRateIncludesVat: false,
      commissionVatDeductible: false,
      commissionBase: 'net',
      defaultCommissionRate: 18,
      cargoBands: '[]',
      cargoAmountsIncludeVat: true,
      cargoVatRate: 20,
      cargoVatDeductible: false,
      expenditureBands: '[]',
      expenditureIncludesVat: true,
      expenditureVatRate: 20,
      expenditureVatDeductible: false,
    });
    const effective = await configRepo.getEffectiveFeeSettings(appDb, marketplaceCode, NOW);
    expect(effective?.id).toBe(laterId);
    expect(effective?.commissionBase).toBe('net');

    await configRepo.upsertRepricingPolicy(appDb, {
      marketplaceCode,
      coarseStepMode: 'absolute',
      coarseStepAbsolute: 100n,
      coarseStepPercent: null,
      refineTolerance: 10n,
      seekStrategy: 'direct',
      undercutBy: 1n,
      seekStep: 50n,
      soleSellerMarginPct: 20,
      lowStockGuardEnabled: false,
      lowStockThreshold: 0,
      lowStockMarginPct: 0,
      stockMode: 'ignoreStock',
      minPhysicalStock: 0,
      requirePriceConfirmation: true,
      settleDurationMs: 600_000,
      competitorPriceDelta: 5n,
      useSellerIdentityTrigger: true,
      pollIntervalMs: 300_000,
      concurrency: 1,
      dailyUpdateAllowanceFormula: '10 * listingCount',
      budgetReservePct: 20,
      enabled: true,
      updatedBy: 'system',
      updatedAt: NOW,
    });
    const policy = await configRepo.getRepricingPolicy(appDb, marketplaceCode);
    expect(policy?.coarseStepAbsolute).toBe(100n);

    // setAppSetting writes the value and an audit row in the same call.
    const auditId1 = newId();
    await configRepo.setAppSetting(
      appDb,
      { key: 'store.name', value: '"Farmaucuz"', updatedBy: 'op', updatedAt: NOW },
      auditId1,
    );
    const auditId2 = newId();
    await configRepo.setAppSetting(
      appDb,
      { key: 'store.name', value: '"Renamed"', updatedBy: 'op', updatedAt: NOW + 1 },
      auditId2,
    );
    const setting = await configRepo.getAppSetting(appDb, 'store.name');
    expect(setting?.value).toBe('"Renamed"');
    const audit = await configRepo.listSettingsAudit(appDb, 'app_settings', 'store.name');
    expect(audit).toHaveLength(2);
    expect(audit[0]?.newValue).toBe('"Renamed"'); // most recent first
    expect(audit[1]?.oldValue).toBeNull(); // first-ever write had no previous value
  }, 30_000);

  it('stock: upsert stock item, operator prefs never overwritten by ensure, bundle replace', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { marketplaceCode, baseStockCode } = await seed(appDb);

    const item = await stockRepo.getStockItem(appDb, baseStockCode);
    expect(item?.unitCost).toBe(1000n);

    // ensureStockMarketplacePrefs must not clobber an operator's multiplier on re-import.
    await stockRepo.ensureStockMarketplacePrefs(appDb, {
      baseStockCode,
      marketplaceCode,
      priceMultiplier: 1.0,
      autoRepriceEnabled: false,
      updatedBy: 'import',
      updatedAt: NOW,
    });
    await stockRepo.updateStockMarketplacePrefs(appDb, baseStockCode, marketplaceCode, {
      priceMultiplier: 1.25,
      updatedBy: 'operator',
      updatedAt: NOW + 1,
    });
    await stockRepo.ensureStockMarketplacePrefs(appDb, {
      baseStockCode,
      marketplaceCode,
      priceMultiplier: 1.0, // a re-import trying to reset the multiplier
      autoRepriceEnabled: false,
      updatedBy: 'import',
      updatedAt: NOW + 2,
    });
    const prefs = await stockRepo.getStockMarketplacePrefs(appDb, baseStockCode, marketplaceCode);
    expect(prefs?.priceMultiplier).toBeCloseTo(1.25, 10); // operator's value survived the re-import

    await stockRepo.replaceBundle(
      appDb,
      '99999-k2',
      'Bundle A',
      [{ memberStockCode: baseStockCode, quantity: 2 }],
      NOW,
    );
    let members = await stockRepo.getBundleMembers(appDb, '99999-k2');
    expect(members).toEqual([{ memberStockCode: baseStockCode, quantity: 2 }]);

    await stockRepo.replaceBundle(
      appDb,
      '99999-k2',
      'Bundle A renamed',
      [{ memberStockCode: baseStockCode, quantity: 3 }],
      NOW + 1,
    );
    members = await stockRepo.getBundleMembers(appDb, '99999-k2');
    expect(members).toEqual([{ memberStockCode: baseStockCode, quantity: 3 }]); // old members replaced, not appended
  }, 30_000);

  it('listings: upsert preserves operator overrides, stale sweep, campaigns', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { marketplaceCode, listingId } = await seed(appDb);

    // Simulate an operator setting minPrice directly through the dedicated overrides path.
    await listingsRepo.setListingOverrides(appDb, listingId, { minPrice: 1500n }, NOW);
    expect((await listingsRepo.getListing(appDb, listingId))?.minPrice).toBe(1500n);

    // A subsequent import upsert with a different minPrice must not overwrite it.
    const current = (await listingsRepo.getListing(appDb, listingId))!;
    await listingsRepo.upsertListing(appDb, {
      ...current,
      price: 2500n,
      minPrice: 999n,
      lastSeenAt: NOW + 1000,
    });
    const afterImport = await listingsRepo.getListing(appDb, listingId);
    expect(afterImport?.price).toBe(2500n); // price DOES update
    expect(afterImport?.minPrice).toBe(1500n); // minPrice is untouched by the import

    const found = await listingsRepo.findListingByMarketplaceId(appDb, marketplaceCode, 'barcode-1');
    expect(found?.id).toBe(listingId);

    const repriceable = await listingsRepo.listRepriceableListings(appDb, marketplaceCode);
    expect(repriceable.map((l) => l.id)).toContain(listingId);

    await listingsRepo.sweepStaleListings(appDb, marketplaceCode, NOW + 5000);
    expect((await listingsRepo.getListing(appDb, listingId))?.isArchived).toBe(true);

    const campaignId = newId();
    await listingsRepo.insertListingCampaign(appDb, {
      id: campaignId,
      listingId,
      finalPrice: 1900n,
      storeSharePct: 50,
      startsAt: null,
      endsAt: null,
      observedAt: NOW,
    });
    const latest = await listingsRepo.latestListingCampaign(appDb, listingId);
    expect(latest?.id).toBe(campaignId);
  }, 30_000);

  it('listings: upsert never repoints the primary key on conflict, even when the caller supplies a fresh id', async () => {
    // A real import job doesn't know a listing's existing row id in advance — it generates a
    // fresh one for `values()` on every call and relies on the upsert to leave an existing
    // row's actual id alone (the FKs from campaigns/repricing_state/price_submissions all
    // point at it). This is the scenario `current.id` in the test above can't catch, since
    // there `current` already carries the real id.
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { marketplaceCode, listingId } = await seed(appDb);
    const existing = (await listingsRepo.getListing(appDb, listingId))!;

    const freshId = newId();
    await listingsRepo.upsertListing(appDb, { ...existing, id: freshId, price: 3000n });

    const stillThere = await listingsRepo.getListing(appDb, listingId);
    expect(stillThere?.id).toBe(listingId); // unchanged
    expect(stillThere?.price).toBe(3000n); // the update itself did apply

    const underFreshId = await listingsRepo.getListing(appDb, freshId);
    expect(underFreshId).toBeUndefined(); // no second row was created either

    const found = await listingsRepo.findListingByMarketplaceId(appDb, marketplaceCode, 'barcode-1');
    expect(found?.id).toBe(listingId);
  }, 30_000);

  it('competition: buybox observations, scrape-run change detection, point-in-time reconstruction', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { listingId } = await seed(appDb);

    await competitionRepo.insertBuyboxObservation(appDb, {
      id: newId(),
      listingId,
      observedAt: NOW,
      rank: 1,
      buyboxPrice: 2000n,
      secondPrice: 2100n,
      thirdPrice: null,
      hasMultipleSeller: true,
      source: 'api',
    });
    const latestObs = await competitionRepo.latestBuyboxObservation(appDb, listingId);
    expect(latestObs?.rank).toBe(1);

    const run1 = newId();
    await competitionRepo.recordScrapeRun(
      appDb,
      {
        id: run1,
        listingId,
        observedAt: NOW,
        source: 'trendyol',
        sellerCount: 2,
        payloadHash: 'hash-a',
        status: 'ok',
        changed: false,
      },
      [
        {
          id: newId(),
          listingId,
          scrapeRunId: run1,
          observedAt: NOW,
          rank: 1,
          sellerName: 'Farmaucuz',
          sellerRef: 'seller-1',
          price: 2000n,
          finalPrice: null,
          rating: 4.5,
          dispatchTime: 1,
          offeredStock: 10,
          hasPromotion: false,
          promotionText: null,
        },
      ],
    );
    // Second scrape, same hash -> scrape_runs written, competitor_observations NOT written again.
    const run2 = newId();
    await competitionRepo.recordScrapeRun(
      appDb,
      {
        id: run2,
        listingId,
        observedAt: NOW + 1000,
        source: 'trendyol',
        sellerCount: 2,
        payloadHash: 'hash-a',
        status: 'ok',
        changed: false,
      },
      [
        {
          id: newId(),
          listingId,
          scrapeRunId: run2,
          observedAt: NOW + 1000,
          rank: 1,
          sellerName: 'Farmaucuz',
          sellerRef: 'seller-1',
          price: 2000n,
          finalPrice: null,
          rating: 4.5,
          dispatchTime: 1,
          offeredStock: 10,
          hasPromotion: false,
          promotionText: null,
        },
      ],
    );
    const asOfAfterUnchanged = await competitionRepo.observationsAsOf(appDb, listingId, NOW + 1000);
    expect(asOfAfterUnchanged).toHaveLength(1); // still just the one observation row from run1

    // Third scrape, different hash -> a new competitor_observations row.
    const run3 = newId();
    await competitionRepo.recordScrapeRun(
      appDb,
      {
        id: run3,
        listingId,
        observedAt: NOW + 2000,
        source: 'trendyol',
        sellerCount: 1,
        payloadHash: 'hash-b',
        status: 'ok',
        changed: false,
      },
      [
        {
          id: newId(),
          listingId,
          scrapeRunId: run3,
          observedAt: NOW + 2000,
          rank: 1,
          sellerName: 'Farmaucuz',
          sellerRef: 'seller-1',
          price: 1950n,
          finalPrice: null,
          rating: 4.5,
          dispatchTime: 1,
          offeredStock: 8,
          hasPromotion: false,
          promotionText: null,
        },
      ],
    );
    const latestRun = await competitionRepo.latestScrapeRun(appDb, listingId);
    expect(latestRun?.id).toBe(run3);
    expect(latestRun?.changed).toBe(true);

    const asOfLatest = await competitionRepo.observationsAsOf(appDb, listingId, NOW + 2000);
    expect(asOfLatest[0]?.price).toBe(1950n);

    await competitionRepo.pruneBuyboxObservations(appDb, NOW + 500);
    expect(await competitionRepo.latestBuyboxObservation(appDb, listingId)).toBeUndefined();
  }, 30_000);

  it('repricing: state, price submissions outbox + confirmation, budget usage increments', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { marketplaceCode, listingId } = await seed(appDb);

    await repricingRepo.upsertRepricingState(appDb, {
      listingId,
      phase: 'CLIMBING',
      lastGoodPrice: 2000n,
      lastBadPrice: null,
      optimumPrice: null,
      optimumCtxUnitCost: null,
      optimumCtxCommissionRate: null,
      optimumCtxVatRate: null,
      optimumCtxCampaignRatio: null,
      optimumCtxSecondPrice: null,
      optimumCtxSecondSellerRef: null,
      pendingSubmissionId: null,
      settleUntil: null,
      consecutiveRejections: 0,
      updatedAt: NOW,
    });
    expect((await repricingRepo.getRepricingState(appDb, listingId))?.phase).toBe('CLIMBING');

    const submissionId = newId();
    await repricingRepo.insertPriceSubmission(appDb, {
      id: submissionId,
      listingId,
      marketplaceCode,
      oldPrice: 2000n,
      newPrice: 2100n,
      reason: 'Climbing',
      explanation: 'probing upward',
      priority: 3,
      decidedAt: NOW,
      state: 'queued',
      submittedAt: null,
      confirmedAt: null,
      marketplaceHandle: null,
      failureCode: null,
      failureMessage: null,
      attempts: 0,
      unitCost: 1000n,
      floorPrice: 1800n,
      buyboxPrice: 2050n,
      secondPrice: null,
      rank: 1,
      commissionRate: 16,
      vatRate: 10,
    });
    let outbox = await repricingRepo.drainOutbox(appDb, marketplaceCode, 10);
    expect(outbox.map((s) => s.id)).toContain(submissionId);

    await repricingRepo.markSubmitted(appDb, submissionId, 'batch-1', NOW + 10);
    outbox = await repricingRepo.drainOutbox(appDb, marketplaceCode, 10);
    expect(outbox.map((s) => s.id)).not.toContain(submissionId); // no longer queued

    await repricingRepo.markConfirmed(appDb, submissionId, NOW + 20);

    await repricingRepo.prunePriceSubmissions(appDb, NOW - 1); // cutoff before decidedAt -> nothing pruned
    const stillThereResult = await repricingRepo.drainOutbox(appDb, marketplaceCode, 10);
    expect(stillThereResult).toEqual([]); // it's confirmed, not queued, so not in the outbox either way

    const usageDate = '2026-01-01';
    await repricingRepo.incrementBudgetUsage(appDb, marketplaceCode, usageDate, 1000);
    await repricingRepo.incrementBudgetUsage(appDb, marketplaceCode, usageDate, 1000);
    const usage = await repricingRepo.getBudgetUsage(appDb, marketplaceCode, usageDate);
    expect(usage?.consumed).toBe(2);
    expect(usage?.allowance).toBe(1000);
  }, 30_000);

  it('jobs: enqueue/claim-ready/done, job runs, retention prune', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;

    const jobId = newId();
    await jobsRepo.enqueueJob(appDb, {
      id: jobId,
      jobName: 'ImportListings',
      payload: '{}',
      priority: 0,
      state: 'ready',
      runAfter: NOW,
      lockedBy: null,
      lockedUntil: null,
      attempts: 0,
      maxAttempts: 3,
      lastError: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const ready = await jobsRepo.listReadyJobs(appDb, ['ImportListings'], NOW + 1);
    expect(ready.map((j) => j.id)).toContain(jobId);

    await jobsRepo.markJobDone(appDb, jobId, NOW + 10);
    expect((await jobsRepo.getJob(appDb, jobId))?.state).toBe('done');

    await jobsRepo.pruneFinishedJobs(appDb, NOW - 1);
    expect(await jobsRepo.getJob(appDb, jobId)).toBeDefined(); // cutoff before updatedAt -> not pruned yet
    await jobsRepo.pruneFinishedJobs(appDb, NOW + 1000);
    expect(await jobsRepo.getJob(appDb, jobId)).toBeUndefined();

    const runId = newId();
    await jobsRepo.startJobRun(appDb, {
      id: runId,
      jobName: 'ImportListings',
      startedAt: NOW,
      finishedAt: null,
      state: 'running',
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: null,
      correlationId: 'corr-1',
    });
    await jobsRepo.finishJobRun(appDb, runId, {
      state: 'success',
      finishedAt: NOW + 100,
      itemsTotal: 5,
      itemsOk: 5,
      itemsFailed: 0,
      error: null,
    });
    await jobsRepo.pruneJobRuns(appDb, NOW + 1000);
  }, 30_000);

  it('events: log, filter by level, retention prune', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;

    await eventsRepo.logEvent(appDb, {
      id: newId(),
      at: NOW,
      level: 'info',
      marketplaceCode: null,
      listingId: null,
      jobRunId: null,
      code: 'import.started',
      message: 'Import started',
      context: null,
    });
    await eventsRepo.logEvent(appDb, {
      id: newId(),
      at: NOW + 1,
      level: 'error',
      marketplaceCode: null,
      listingId: null,
      jobRunId: null,
      code: 'import.failed',
      message: 'Import failed',
      context: '{"reason":"timeout"}',
    });

    const all = await eventsRepo.listRecentEvents(appDb, 10);
    expect(all).toHaveLength(2);
    const errorsOnly = await eventsRepo.listRecentEvents(appDb, 10, 'warn');
    expect(errorsOnly).toHaveLength(1);
    expect(errorsOnly[0]?.level).toBe('error');

    await eventsRepo.pruneEvents(appDb, NOW + 1000, NOW - 1000);
    const afterPrune = await eventsRepo.listRecentEvents(appDb, 10);
    expect(afterPrune).toHaveLength(1); // info pruned (90d window passed), error kept (1y window not passed)
    expect(afterPrune[0]?.level).toBe('error');
  }, 30_000);
});
