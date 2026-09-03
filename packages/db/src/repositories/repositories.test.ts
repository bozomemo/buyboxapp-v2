import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as alertsRepo from './alerts.js';
import * as circuitBreakerRepo from './circuit-breaker.js';
import * as competitionRepo from './competition.js';
import * as competitorReportsRepo from './competitor-reports.js';
import * as competitorSellersRepo from './competitor-sellers.js';
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
    observationEnabled: true,
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

    // deleteAppSetting clears the row and audits the deletion — distinct from setting it to a
    // value that happens to match the default (doc 07 §8 cadence override "reset").
    await configRepo.deleteAppSetting(appDb, 'store.name', 'op', NOW + 2, newId());
    expect(await configRepo.getAppSetting(appDb, 'store.name')).toBeUndefined();
    const auditAfterDelete = await configRepo.listSettingsAudit(appDb, 'app_settings', 'store.name');
    expect(auditAfterDelete).toHaveLength(3);
    expect(auditAfterDelete[0]?.oldValue).toBe('"Renamed"');
    expect(auditAfterDelete[0]?.newValue).toBeNull();

    // Deleting a key that was never set is a no-op — no row, no audit trail to append to.
    await configRepo.deleteAppSetting(appDb, 'never.set', 'op', NOW + 3, newId());
    expect(await configRepo.listSettingsAudit(appDb, 'app_settings', 'never.set')).toHaveLength(0);
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

  it('listings: queryListings pages and filters structurally, joined with repricing phase', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { marketplaceCode, baseStockCode, listingId } = await seed(appDb);
    await repricingRepo.upsertRepricingState(appDb, {
      listingId,
      phase: 'OPTIMUM',
      lastGoodPrice: 1900n,
      lastBadPrice: null,
      optimumPrice: 1950n,
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
    const secondId = newId();
    await listingsRepo.upsertListing(appDb, {
      id: secondId,
      marketplaceCode,
      marketplaceListingId: 'barcode-2',
      sellerStockCode: baseStockCode,
      baseStockCode,
      unitCount: 1,
      isBundle: false,
      productName: 'Gadget',
      price: 3000n,
      listPrice: null,
      customerPrice: null,
      offeredStock: 5,
      commissionRate: 16,
      vatRate: 10,
      dispatchTime: null,
      isSalable: false,
      isLocked: true,
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
      observationEnabled: false,
      extra: null,
      firstSeenAt: NOW,
      lastSeenAt: NOW + 1,
      updatedAt: NOW,
    });

    const page1 = await listingsRepo.queryListings(appDb, {
      marketplaceCode,
      limit: 1,
      offset: 0,
      sort: 'lastSeenAt',
      sortDir: 'desc',
    });
    expect(page1.total).toBe(2); // total reflects the whole filtered set, not just this page
    expect(page1.rows).toHaveLength(1);
    expect(page1.rows[0]!.id).toBe(secondId); // most recently seen first

    const byPhase = await listingsRepo.queryListings(appDb, { phases: ['OPTIMUM'], limit: 10, offset: 0 });
    expect(byPhase.rows.map((r) => r.id)).toEqual([listingId]);
    expect(byPhase.rows[0]!.optimumPrice).toBe(1950n);

    const byText = await listingsRepo.queryListings(appDb, { text: 'Gadget', limit: 10, offset: 0 });
    expect(byText.rows.map((r) => r.id)).toEqual([secondId]);

    const locked = await listingsRepo.queryListings(appDb, { isLocked: true, limit: 10, offset: 0 });
    expect(locked.rows.map((r) => r.id)).toEqual([secondId]);

    // Freshly-seeded listing has no repricing_state row yet — phase must surface as null, not throw.
    const unphased = await listingsRepo.queryListings(appDb, {
      marketplaceCode,
      isLocked: true,
      limit: 10,
      offset: 0,
    });
    expect(unphased.rows[0]!.phase).toBeNull();
  }, 30_000);

  it('listings: bulk overrides and force-reoptimisation apply to every id in the selection', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { listingId } = await seed(appDb);
    await repricingRepo.upsertRepricingState(appDb, {
      listingId,
      phase: 'BLOCKED',
      lastGoodPrice: 1800n,
      lastBadPrice: 1700n,
      optimumPrice: null,
      optimumCtxUnitCost: null,
      optimumCtxCommissionRate: null,
      optimumCtxVatRate: null,
      optimumCtxCampaignRatio: null,
      optimumCtxSecondPrice: null,
      optimumCtxSecondSellerRef: null,
      pendingSubmissionId: null,
      settleUntil: null,
      consecutiveRejections: 3,
      updatedAt: NOW,
    });

    await listingsRepo.bulkSetListingOverrides(appDb, [listingId], { repriceEnabled: false }, NOW + 1);
    expect((await listingsRepo.getListing(appDb, listingId))?.repriceEnabled).toBe(false);

    await repricingRepo.resetPhaseToSeeking(appDb, [listingId], NOW + 2);
    const state = await repricingRepo.getRepricingState(appDb, listingId);
    expect(state?.phase).toBe('SEEKING');
    expect(state?.lastGoodPrice).toBeNull();
    expect(state?.consecutiveRejections).toBe(0);
  }, 30_000);

  it('stock: listStockGrid joins prefs and derived offered stock per marketplace', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { marketplaceCode, baseStockCode } = await seed(appDb);
    await stockRepo.ensureStockMarketplacePrefs(appDb, {
      baseStockCode,
      marketplaceCode,
      priceMultiplier: 1.0,
      autoRepriceEnabled: false,
      updatedBy: 'import',
      updatedAt: NOW,
    });
    await stockRepo.updateStockMarketplacePrefs(appDb, baseStockCode, marketplaceCode, {
      priceMultiplier: 1.1,
      autoRepriceEnabled: true,
      updatedBy: 'operator',
      updatedAt: NOW,
    });

    const grid = await stockRepo.listStockGrid(appDb);
    const row = grid.find((r) => r.baseStockCode === baseStockCode);
    expect(row?.prefs[marketplaceCode]).toEqual({ priceMultiplier: 1.1, autoRepriceEnabled: true });
    expect(row?.offeredStock[marketplaceCode]).toBe(10); // from the seeded listing's offeredStock
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
    // No scrape has run yet — buybox_observations (API-sourced) and competitor_observations
    // (scrape-sourced) are separate tables, so a buybox_observations row alone is not enough.
    expect(await competitionRepo.latestBuyboxSellerName(appDb, listingId)).toBeUndefined();

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

    // Mağaza Adı (doc 06 §4.1): the rank-1 seller name from the newest scrape batch, reporting
    // only — unaffected by pruning buybox_observations (the pricing-path table) below.
    expect(await competitionRepo.latestBuyboxSellerName(appDb, listingId)).toBe('Farmaucuz');

    await competitionRepo.pruneBuyboxObservations(appDb, NOW + 500);
    expect(await competitionRepo.latestBuyboxObservation(appDb, listingId)).toBeUndefined();
  }, 30_000);

  it('competition: bounded reporting fetches for competitor-history (doc 06 §6, doc 12 6.8)', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { marketplaceCode, baseStockCode, listingId } = await seed(appDb);

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
    await competitionRepo.insertBuyboxObservation(appDb, {
      id: newId(),
      listingId,
      observedAt: NOW + 1000,
      rank: 2,
      buyboxPrice: 1950n,
      secondPrice: 2000n,
      thirdPrice: null,
      hasMultipleSeller: true,
      source: 'api',
    });

    const history = await competitionRepo.buyboxObservationHistory(appDb, listingId, NOW);
    expect(history.map((h) => h.rank)).toEqual([1, 2]); // oldest first

    const run1 = newId();
    await competitionRepo.recordScrapeRun(
      appDb,
      {
        id: run1,
        listingId,
        observedAt: NOW,
        source: 'trendyol',
        sellerCount: 2,
        payloadHash: 'h1',
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
        {
          id: newId(),
          listingId,
          scrapeRunId: run1,
          observedAt: NOW,
          rank: 2,
          sellerName: 'Rakip A',
          sellerRef: 'seller-2',
          price: 2050n,
          finalPrice: null,
          rating: 4.1,
          dispatchTime: 2,
          offeredStock: 5,
          hasPromotion: false,
          promotionText: null,
        },
      ],
    );
    const run2 = newId();
    await competitionRepo.recordScrapeRun(
      appDb,
      {
        id: run2,
        listingId,
        observedAt: NOW + 3600_000,
        source: 'trendyol',
        sellerCount: 1,
        payloadHash: 'h2-fetch-failed',
        status: 'fetchFailed',
        changed: false,
      },
      [],
    );

    const observations = await competitionRepo.competitorObservationsInRange(appDb, {
      sinceMs: NOW - 1000,
      untilMs: NOW + 7200_000,
      marketplaceCode,
    });
    expect(observations).toHaveLength(2);
    expect(
      observations.every((o) => o.marketplaceCode === marketplaceCode && o.productName === 'Widget'),
    ).toBe(true);
    // sellerRef filter is a structural equality predicate, not a substring scan.
    const onlySeller1 = await competitionRepo.competitorObservationsInRange(appDb, {
      sinceMs: NOW - 1000,
      untilMs: NOW + 7200_000,
      sellerRef: 'seller-1',
    });
    expect(onlySeller1).toHaveLength(1);
    expect(onlySeller1[0]?.sellerName).toBe('Farmaucuz');

    // baseStockCode narrows in SQL, not after the fetch. Applied afterwards it would be
    // filtering whatever slice of the archive fit under the row cap, which on a large
    // catalogue silently answers a stock-code question from unrelated rows.
    expect(
      await competitionRepo.competitorObservationsInRange(appDb, {
        sinceMs: NOW - 1000,
        untilMs: NOW + 7200_000,
        baseStockCode,
      }),
    ).toHaveLength(2);
    expect(
      await competitionRepo.competitorObservationsInRange(appDb, {
        sinceMs: NOW - 1000,
        untilMs: NOW + 7200_000,
        baseStockCode: 'no-such-stock-code',
      }),
    ).toEqual([]);

    // A second *changed* batch, later, with a different seller set (seller-2 dropped out,
    // seller-3 appeared). `observationsAsOf` at "now" must return only this latest batch —
    // not the union of every changed batch ever written (the bug the listing detail page's
    // Competition panel caught live: stale sellers from run1 leaking alongside run3's).
    const run3 = newId();
    await competitionRepo.recordScrapeRun(
      appDb,
      {
        id: run3,
        listingId,
        observedAt: NOW + 7200_000,
        source: 'trendyol',
        sellerCount: 2,
        payloadHash: 'h3',
        status: 'ok',
        changed: false,
      },
      [
        {
          id: newId(),
          listingId,
          scrapeRunId: run3,
          observedAt: NOW + 7200_000,
          rank: 1,
          sellerName: 'Farmaucuz',
          sellerRef: 'seller-1',
          price: 1990n,
          finalPrice: null,
          rating: 4.5,
          dispatchTime: 1,
          offeredStock: 9,
          hasPromotion: false,
          promotionText: null,
        },
        {
          id: newId(),
          listingId,
          scrapeRunId: run3,
          observedAt: NOW + 7200_000,
          rank: 2,
          sellerName: 'Rakip B',
          sellerRef: 'seller-3',
          price: 2100n,
          finalPrice: null,
          rating: 3.9,
          dispatchTime: 3,
          offeredStock: 2,
          hasPromotion: false,
          promotionText: null,
        },
      ],
    );

    const current = await competitionRepo.observationsAsOf(appDb, listingId, NOW + 8000_000);
    expect(current.map((o) => o.sellerRef).sort()).toEqual(['seller-1', 'seller-3']); // seller-2 is gone
    expect(current.every((o) => o.observedAt === NOW + 7200_000)).toBe(true); // only the latest batch

    const runs = await competitionRepo.scrapeRunsInRange(appDb, {
      sinceMs: NOW - 1000,
      untilMs: NOW + 7200_000,
    });
    expect(runs).toHaveLength(3); // run1, run2 (fetch-failed), run3
    expect(runs.find((r) => r.id === run2)?.status).toBe('fetchFailed'); // observation-coverage gap

    // The price chart's hover readout (doc 06 §5): one row per look, rank-1 only, oldest first.
    // Rank 2 must not appear — attributing the buybox to the runner-up would name the wrong
    // company on a screen whose whole point is who is beating us.
    const buyboxSellers = await competitionRepo.buyboxSellerHistory(appDb, listingId, NOW - 1000);
    expect(buyboxSellers.map((b) => [b.observedAt, b.sellerRef, b.price])).toEqual([
      [NOW, 'seller-1', 2000n],
      [NOW + 7200_000, 'seller-1', 1990n],
    ]);
    // `sinceMs` bounds it — the window is the chart's window, never the whole archive.
    expect(await competitionRepo.buyboxSellerHistory(appDb, listingId, NOW + 1)).toHaveLength(1);
  }, 30_000);

  it('competitor sellers: durable identity, operator-owned grouping, cross-marketplace expansion', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { marketplaceCode } = await seed(appDb);

    const hbCode = 'HB';
    await configRepo.upsertMarketplace(appDb, {
      code: hbCode,
      displayName: 'Hepsiburada',
      enabled: true,
      merchantRef: 'merchant-2',
      createdAt: NOW,
      updatedAt: NOW,
    });

    // One scrape's worth of sightings, including the same merchant twice — one offer set can
    // list a merchant once per variant, and the unique key would reject the batch untouched.
    await competitorSellersRepo.recordSeenSellers(appDb, [
      { id: newId(), marketplaceCode, sellerRef: 'm-1', sellerName: 'The Olympus', seenAt: NOW },
      { id: newId(), marketplaceCode, sellerRef: 'm-1', sellerName: 'The Olympus', seenAt: NOW },
      { id: newId(), marketplaceCode, sellerRef: 'm-2', sellerName: 'TurnaStore', seenAt: NOW },
    ]);
    const afterFirst = await competitorSellersRepo.listCompetitorSellers(appDb, { marketplaceCode });
    expect(afterFirst).toHaveLength(2);

    const olympus = afterFirst.find((s) => s.sellerRef === 'm-1')!;
    await competitorSellersRepo.setSellerNote(appDb, olympus.id, 'ana rakip');

    const group = { id: newId(), displayName: 'Olympus Grup', note: null, createdAt: NOW, updatedAt: NOW };
    await competitorSellersRepo.upsertSellerGroup(appDb, group);
    await competitorSellersRepo.setSellerGroup(appDb, olympus.id, group.id);

    // A later scrape sees the same merchant under a new trading name. The name follows, but
    // the operator's grouping and note must survive — they are the one thing here no automatic
    // process can reconstruct — and `first_seen_at` must not drift forward.
    await competitorSellersRepo.recordSeenSellers(appDb, [
      {
        id: newId(),
        marketplaceCode,
        sellerRef: 'm-1',
        sellerName: 'The Olympus Mağaza',
        seenAt: NOW + 3600_000,
      },
    ]);
    const renamed = (await competitorSellersRepo.getCompetitorSeller(appDb, marketplaceCode, 'm-1'))!;
    expect(renamed.sellerName).toBe('The Olympus Mağaza');
    expect(renamed.firstSeenAt).toBe(NOW);
    expect(renamed.lastSeenAt).toBe(NOW + 3600_000);
    expect(renamed.groupId).toBe(group.id);
    expect(renamed.operatorNote).toBe('ana rakip');

    // An out-of-order sighting (a retried older cycle landing after a newer one) must not drag
    // "last seen" backwards.
    await competitorSellersRepo.recordSeenSellers(appDb, [
      { id: newId(), marketplaceCode, sellerRef: 'm-1', sellerName: 'Eski Ad', seenAt: NOW - 3600_000 },
    ]);
    expect((await competitorSellersRepo.getCompetitorSeller(appDb, marketplaceCode, 'm-1'))?.lastSeenAt).toBe(
      NOW + 3600_000,
    );

    // The same company on the other marketplace, linked by hand into the same group. Ids live
    // in per-marketplace namespaces, so this link is the only thing that makes them one.
    await competitorSellersRepo.recordSeenSellers(appDb, [
      { id: newId(), marketplaceCode: hbCode, sellerRef: 'm-1', sellerName: 'Olympus HB', seenAt: NOW },
    ]);
    const hbSeller = (await competitorSellersRepo.getCompetitorSeller(appDb, hbCode, 'm-1'))!;
    expect(hbSeller.groupId).toBeNull(); // never inferred from the matching ref or a similar name
    await competitorSellersRepo.setSellerGroup(appDb, hbSeller.id, group.id);

    const expanded = await competitorSellersRepo.expandSellerGroup(appDb, marketplaceCode, 'm-1');
    expect(expanded.map((e) => `${e.marketplaceCode}:${e.sellerRef}`).sort()).toEqual([
      'HB:m-1',
      'TY:m-1',
    ]);
    // An ungrouped seller expands to itself, so callers need no special case.
    expect(await competitorSellersRepo.expandSellerGroup(appDb, marketplaceCode, 'm-2')).toEqual([
      { marketplaceCode, sellerRef: 'm-2' },
    ]);

    // Withdrawing the opinion must not erase the evidence.
    await competitorSellersRepo.deleteSellerGroup(appDb, group.id);
    expect((await competitorSellersRepo.getCompetitorSeller(appDb, marketplaceCode, 'm-1'))?.groupId).toBeNull();
    expect(await competitorSellersRepo.listCompetitorSellers(appDb)).toHaveLength(3);
  }, 30_000);

  it('alerts: open/resolve lifecycle, seller children, quiet period — on every engine', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { listingId } = await seed(appDb);
    const HOUR = 3600_000;

    const ruleId = newId();
    await alertsRepo.upsertAlertRule(appDb, {
      id: ruleId,
      name: 'Piyasa altı',
      scopeType: 'all',
      scopeValue: null,
      subjectType: 'any',
      subjectValue: null,
      predicate: 'priceBelow',
      thresholdType: 'fixed',
      thresholdValue: 40_000n,
      thresholdPct: null,
      quietPeriodMs: 6 * HOUR,
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(await alertsRepo.listAlertRules(appDb, true)).toHaveLength(1);

    const outcome = (matched: boolean, sellers: { ref: string; price: bigint }[]) => ({
      ruleId,
      alertKey: `${ruleId}::${listingId}`,
      listingId,
      sellerRef: null,
      quietPeriodMs: 6 * HOUR,
      matched,
      thresholdApplied: 40_000n,
      snapshot: matched
        ? JSON.stringify({ sellers: sellers.map((x) => ({ ...x, price: x.price.toString() })) })
        : null,
      sellers: sellers.map((s) => ({
        sellerRef: s.ref,
        sellerName: `Satici ${s.ref}`,
        observedPrice: s.price,
        priceSource: 'price',
        rank: 1,
        promotionText: null,
      })),
    });

    // Opens.
    let result = await alertsRepo.reconcileAlerts(appDb, [outcome(true, [{ ref: 's-1', price: 39_000n }])], NOW);
    expect(result).toMatchObject({ opened: 1, resolved: 0 });

    // Still breaching, and a second seller joins: one alert, two children — not two alerts.
    result = await alertsRepo.reconcileAlerts(
      appDb,
      [outcome(true, [{ ref: 's-1', price: 38_000n }, { ref: 's-2', price: 37_000n }])],
      NOW + HOUR,
    );
    expect(result).toMatchObject({ opened: 0, stillOpen: 1, sellersJoined: 1 });

    const open = await alertsRepo.listAlerts(appDb, 'open');
    expect(open).toHaveLength(1);
    expect(open[0]!.firstSeenAt).toBe(NOW);
    expect(open[0]!.lastSeenAt).toBe(NOW + HOUR);
    expect(open[0]!.sellers.filter((s) => s.leftAt === null)).toHaveLength(2);
    // Money round-trips as exact kuruş on all three engines, SQLite's sortable text included.
    expect(open[0]!.sellers.find((s) => s.sellerRef === 's-1')!.observedPrice).toBe(38_000n);
    expect(open[0]!.thresholdApplied).toBe(40_000n);
    expect(await alertsRepo.countOpenAlerts(appDb)).toBe(1);

    // Clears: resolved, and every still-active child is stamped as departed.
    result = await alertsRepo.reconcileAlerts(appDb, [outcome(false, [])], NOW + 2 * HOUR);
    expect(result).toMatchObject({ resolved: 1 });
    expect(await alertsRepo.countOpenAlerts(appDb)).toBe(0);
    const resolved = await alertsRepo.listAlerts(appDb, 'resolved');
    expect(resolved[0]!.resolvedAt).toBe(NOW + 2 * HOUR);
    expect(resolved[0]!.sellers.every((s) => s.leftAt === NOW + 2 * HOUR)).toBe(true);

    // Inside the quiet period a returning breach is suppressed, so a competitor oscillating
    // around the threshold cannot reopen this every cycle.
    result = await alertsRepo.reconcileAlerts(
      appDb,
      [outcome(true, [{ ref: 's-1', price: 39_000n }])],
      NOW + 3 * HOUR,
    );
    expect(result).toMatchObject({ opened: 0, suppressedByQuietPeriod: 1 });

    // Past it, a genuinely new episode gets its own row rather than reusing the old span.
    result = await alertsRepo.reconcileAlerts(
      appDb,
      [outcome(true, [{ ref: 's-1', price: 39_000n }])],
      NOW + 9 * HOUR,
    );
    expect(result).toMatchObject({ opened: 1 });
    expect(await alertsRepo.listAlerts(appDb, 'all')).toHaveLength(2);

    // Deleting the rule takes its alerts with it: an alert whose rule is gone can never be
    // explained or resolved by anything.
    await alertsRepo.deleteAlertRule(appDb, ruleId);
    expect(await alertsRepo.listAlerts(appDb, 'all')).toHaveLength(0);
  }, 30_000);

  it('competitor reports: seller aggregates counted in SQL, identically on every engine', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { marketplaceCode, baseStockCode, listingId } = await seed(appDb);

    // A second listing, so "on how many of our products" is a real count rather than 1.
    const listingId2 = newId();
    await listingsRepo.upsertListing(appDb, {
      id: listingId2,
      marketplaceCode,
      marketplaceListingId: 'barcode-2',
      sellerStockCode: baseStockCode,
      baseStockCode,
      unitCount: 1,
      isBundle: false,
      productName: 'Widget II',
      price: 3000n,
      listPrice: null,
      customerPrice: null,
      offeredStock: 4,
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

    const obs = (
      scrapeRunId: string,
      lid: string,
      at: number,
      rank: number,
      sellerRef: string | null,
      price: bigint,
    ) => ({
      id: newId(),
      listingId: lid,
      scrapeRunId,
      observedAt: at,
      rank,
      sellerName: sellerRef === null ? 'Kimliksiz' : `Satici ${sellerRef}`,
      sellerRef,
      price,
      finalPrice: null,
      rating: null,
      dispatchTime: null,
      offeredStock: null,
      hasPromotion: false,
      promotionText: null,
    });

    // Listing 1: s-1 holds the buybox at 1900, s-2 second at 2000, plus an unidentified offer.
    const r1 = newId();
    await competitionRepo.recordScrapeRun(
      appDb,
      {
        id: r1,
        listingId,
        observedAt: NOW,
        source: 'publicPage',
        sellerCount: 3,
        payloadHash: 'h1',
        status: 'ok',
        changed: false,
      },
      [
        obs(r1, listingId, NOW, 1, 's-1', 1900n),
        obs(r1, listingId, NOW, 2, 's-2', 2000n),
        obs(r1, listingId, NOW, 3, null, 2200n),
      ],
    );

    // Listing 2, an hour later: the buybox changes hands to s-2; s-1 drops to rank 2 cheaper.
    const r2 = newId();
    await competitionRepo.recordScrapeRun(
      appDb,
      {
        id: r2,
        listingId: listingId2,
        observedAt: NOW + 3600_000,
        source: 'publicPage',
        sellerCount: 2,
        payloadHash: 'h2',
        status: 'ok',
        changed: false,
      },
      [obs(r2, listingId2, NOW + 3600_000, 1, 's-2', 2900n), obs(r2, listingId2, NOW + 3600_000, 2, 's-1', 1500n)],
    );

    // A failed look on listing 2: proof we tried, and it must not read as fresh coverage.
    const r3 = newId();
    await competitionRepo.recordScrapeRun(
      appDb,
      {
        id: r3,
        listingId: listingId2,
        observedAt: NOW + 7200_000,
        source: 'publicPage',
        sellerCount: 0,
        payloadHash: '',
        status: 'fetchFailed',
        changed: false,
      },
      [],
    );

    const window = { sinceMs: NOW - 1000, untilMs: NOW + 8000_000 };
    const aggregates = await competitorReportsRepo.sellerAggregatesInRange(appDb, window);

    // Only identified sellers, ordered by how much of our catalogue they overlap.
    expect(aggregates.map((a) => a.sellerRef)).toEqual(['s-1', 's-2']);

    const s1 = aggregates.find((a) => a.sellerRef === 's-1')!;
    expect(s1.listingCount).toBe(2);
    expect(s1.observationCount).toBe(2);
    expect(s1.buyboxCount).toBe(1);
    expect(s1.avgRank).toBeCloseTo(1.5, 5);
    // Money survives as exact kuruş on all three engines, including SQLite's sortable-text
    // encoding, where min/max run over the encoding rather than a native integer.
    expect(s1.minPrice).toBe(1500n);
    expect(s1.maxPrice).toBe(1900n);
    expect(s1.firstSeenAt).toBe(NOW);
    expect(s1.lastSeenAt).toBe(NOW + 3600_000);

    const s2 = aggregates.find((a) => a.sellerRef === 's-2')!;
    expect(s2.buyboxCount).toBe(1);
    expect(s2.minPrice).toBe(2000n);
    expect(s2.maxPrice).toBe(2900n);

    // The blind spot is reported, not silently dropped.
    expect(await competitorReportsRepo.countUnidentifiedObservations(appDb, window)).toBe(1);

    // Passing several refs is how a seller *group* is viewed as one company.
    const breakdown = await competitorReportsRepo.sellerListingBreakdown(appDb, window, ['s-1']);
    expect(breakdown).toHaveLength(2);
    const onListing1 = breakdown.find((b) => b.listingId === listingId)!;
    expect(onListing1.productName).toBe('Widget');
    expect(onListing1.ourPrice).toBe(2000n);
    expect(onListing1.buyboxCount).toBe(1);
    expect(onListing1.minPrice).toBe(1900n);

    const combined = await competitorReportsRepo.sellerListingBreakdown(appDb, window, ['s-1', 's-2']);
    expect(combined.reduce((n, b) => n + b.observationCount, 0)).toBe(4);

    const coverage = await competitorReportsRepo.coverageInRange(appDb, window);
    expect(coverage).toMatchObject({ ok: 2, fetchFailed: 1, parseFailed: 0 });
    // Freshness comes from successful looks only: the newest run here failed, and reporting
    // its timestamp would present a broken scraper as an up-to-date one.
    expect(coverage.lastOkAt).toBe(NOW + 3600_000);

    // The marketplace filter is a predicate in SQL, not a post-filter over a capped fetch.
    expect(
      await competitorReportsRepo.sellerAggregatesInRange(appDb, { ...window, marketplaceCode: 'NOPE' }),
    ).toEqual([]);

    // Our own store is in the archive on purpose — a rank is meaningless without the offers it
    // ranks among — but a *competitor* report that counts it puts us at the top of our own
    // overlap list on every listing we sell. Treating `s-1` as ours here:
    const ours = [{ marketplaceCode, sellerRef: 's-1' }];
    const competitors = await competitorReportsRepo.sellerAggregatesInRange(appDb, {
      ...window,
      excludeSellers: ours,
    });
    expect(competitors.map((a) => a.sellerRef)).toEqual(['s-2']);

    // Excluded from the report, not from the archive: the observations are untouched.
    expect(await competitorReportsRepo.countUnidentifiedObservations(appDb, window)).toBe(1);

    // The mirror filter, which is how the same screen reports "and here is how *we* are doing"
    // from the identical aggregation rather than a second, divergent one.
    const own = await competitorReportsRepo.sellerAggregatesInRange(appDb, {
      ...window,
      onlySellers: ours,
    });
    expect(own.map((a) => a.sellerRef)).toEqual(['s-1']);
    expect(own[0]!.listingCount).toBe(2);

    // The two filters partition the sellers: nothing is counted twice and nothing is lost.
    expect(competitors.length + own.length).toBe(aggregates.length);

    // A ref is a marketplace's own id and repeats across marketplaces, so exclusion is keyed on
    // the pair. The same ref under a different marketplace must not remove anything.
    expect(
      (
        await competitorReportsRepo.sellerAggregatesInRange(appDb, {
          ...window,
          excludeSellers: [{ marketplaceCode: 'other-marketplace', sellerRef: 's-1' }],
        })
      ).map((a) => a.sellerRef),
    ).toEqual(['s-1', 's-2']);

    // "Restrict to none of them" must return nothing, not everything — the difference between
    // an empty list and `undefined`. Getting this backwards would silently report our own
    // stores as the entire competitor set whenever no merchant id is configured.
    expect(
      await competitorReportsRepo.sellerAggregatesInRange(appDb, { ...window, onlySellers: [] }),
    ).toEqual([]);
    expect(
      await competitorReportsRepo.sellerAggregatesInRange(appDb, { ...window, excludeSellers: [] }),
    ).toHaveLength(aggregates.length);

    // The cross-marketplace overlap export excludes us too, on the same key.
    const tuples = await competitorReportsRepo.productSellerTuplesInRange(appDb, {
      ...window,
      excludeSellers: ours,
    });
    expect(tuples.every((t) => t.sellerRef !== 's-1')).toBe(true);
    expect(tuples.some((t) => t.sellerRef === 's-2')).toBe(true);
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

    // Listing detail's History panel (doc 06 §5): every submission for this listing, newest first.
    const history = await repricingRepo.listPriceSubmissionsForListing(appDb, listingId);
    expect(history.map((s) => s.id)).toEqual([submissionId]);
    expect(history[0]?.state).toBe('confirmed');

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
      jobQueueId: null,
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

  it('jobs: run history filters, latest-per-job-name, queue depth, claimed jobs (doc 06 §7, doc 12 6.9)', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;

    await jobsRepo.startJobRun(appDb, {
      id: newId(),
      jobName: 'ObserveBuybox',
      startedAt: NOW,
      finishedAt: NOW + 10,
      state: 'success',
      itemsTotal: 3,
      itemsOk: 3,
      itemsFailed: 0,
      error: null,
      correlationId: 'corr-a',
      jobQueueId: null,
    });
    const laterRunId = newId();
    await jobsRepo.startJobRun(appDb, {
      id: laterRunId,
      jobName: 'ObserveBuybox',
      startedAt: NOW + 1000,
      finishedAt: NOW + 1010,
      state: 'failed',
      itemsTotal: 1,
      itemsOk: 0,
      itemsFailed: 1,
      error: 'boom',
      correlationId: 'corr-b',
      jobQueueId: null,
    });
    await jobsRepo.startJobRun(appDb, {
      id: newId(),
      jobName: 'Reprice',
      startedAt: NOW + 500,
      finishedAt: NOW + 510,
      state: 'success',
      itemsTotal: 2,
      itemsOk: 2,
      itemsFailed: 0,
      error: null,
      correlationId: 'corr-c',
      jobQueueId: null,
    });

    const allRuns = await jobsRepo.listJobRuns(appDb, {});
    expect(allRuns).toHaveLength(3);
    const observeOnly = await jobsRepo.listJobRuns(appDb, { jobName: 'ObserveBuybox' });
    expect(observeOnly).toHaveLength(2);
    const failedOnly = await jobsRepo.listJobRuns(appDb, { state: 'failed' });
    expect(failedOnly.map((r) => r.id)).toEqual([laterRunId]);

    const latest = await jobsRepo.latestJobRunPerJobName(appDb);
    const observeLatest = latest.find((r) => r.jobName === 'ObserveBuybox');
    expect(observeLatest?.id).toBe(laterRunId); // the more recent of the two ObserveBuybox runs

    await jobsRepo.enqueueJob(appDb, {
      id: newId(),
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
    const claimedId = newId();
    await jobsRepo.enqueueJob(appDb, {
      id: claimedId,
      jobName: 'Reprice',
      payload: '{}',
      priority: 0,
      state: 'locked',
      runAfter: NOW,
      lockedBy: 'worker-1',
      lockedUntil: NOW + 60_000,
      attempts: 1,
      maxAttempts: 3,
      lastError: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const depth = await jobsRepo.queueDepthByState(appDb);
    expect(depth.ready).toBe(1);
    expect(depth.locked).toBe(1);

    const claimed = await jobsRepo.listClaimedJobs(appDb);
    expect(claimed.map((j) => j.id)).toEqual([claimedId]);
  }, 30_000);

  it('circuit breaker: closed by default, opens on threshold, half-opens after cooldown, manual reset (doc 07 §3, doc 12 6.9)', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    await configRepo.upsertMarketplace(appDb, {
      code: 'trendyol',
      displayName: 'Trendyol',
      enabled: true,
      merchantRef: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    // No row yet: proceeds, and the Jobs screen sees nothing tripped.
    expect(await circuitBreakerRepo.canProceed(appDb, 'trendyol', NOW, 60_000)).toBe(true);
    expect(await circuitBreakerRepo.getCircuitBreakerState(appDb, 'trendyol')).toBeUndefined();

    // Two failures below the threshold of 3: still closed.
    await circuitBreakerRepo.recordFailure(appDb, 'trendyol', NOW, 'timeout', 3);
    await circuitBreakerRepo.recordFailure(appDb, 'trendyol', NOW + 10, 'timeout', 3);
    let state = await circuitBreakerRepo.getCircuitBreakerState(appDb, 'trendyol');
    expect(state?.state).toBe('closed');
    expect(state?.consecutiveFailures).toBe(2);

    // Third consecutive failure trips it open.
    await circuitBreakerRepo.recordFailure(appDb, 'trendyol', NOW + 20, 'timeout', 3);
    state = await circuitBreakerRepo.getCircuitBreakerState(appDb, 'trendyol');
    expect(state?.state).toBe('open');
    expect(state?.openedAt).toBe(NOW + 20);
    expect(await circuitBreakerRepo.canProceed(appDb, 'trendyol', NOW + 20, 60_000)).toBe(false);

    // Still within the cooldown: stays blocked.
    expect(await circuitBreakerRepo.canProceed(appDb, 'trendyol', NOW + 30_000, 60_000)).toBe(false);

    // Cooldown elapsed: self-transitions to half-open and allows one trial.
    expect(await circuitBreakerRepo.canProceed(appDb, 'trendyol', NOW + 60_020, 60_000)).toBe(true);
    state = await circuitBreakerRepo.getCircuitBreakerState(appDb, 'trendyol');
    expect(state?.state).toBe('half-open');

    // A failure during the half-open trial reopens immediately (not after another full threshold).
    await circuitBreakerRepo.recordFailure(appDb, 'trendyol', NOW + 60_030, 'timeout again', 3);
    state = await circuitBreakerRepo.getCircuitBreakerState(appDb, 'trendyol');
    expect(state?.state).toBe('open');

    // Manual reset (doc 12 6.9 DoD) overrides regardless of current state.
    await circuitBreakerRepo.resetCircuitBreaker(appDb, 'trendyol', NOW + 70_000);
    state = await circuitBreakerRepo.getCircuitBreakerState(appDb, 'trendyol');
    expect(state?.state).toBe('closed');
    expect(state?.consecutiveFailures).toBe(0);
    expect(await circuitBreakerRepo.canProceed(appDb, 'trendyol', NOW + 70_001, 60_000)).toBe(true);

    // A success closes it and clears the counter, from any state.
    await circuitBreakerRepo.recordFailure(appDb, 'trendyol', NOW + 80_000, 'x', 3);
    await circuitBreakerRepo.recordSuccess(appDb, 'trendyol', NOW + 80_010);
    state = await circuitBreakerRepo.getCircuitBreakerState(appDb, 'trendyol');
    expect(state?.state).toBe('closed');
    expect(state?.consecutiveFailures).toBe(0);

    const listed = await circuitBreakerRepo.listCircuitBreakerStates(appDb);
    expect(listed.map((r) => r.marketplaceCode)).toEqual(['trendyol']);
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

  it('events: full filter set — level, marketplace, listing, job run, code, date range (doc 06 §8)', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    const { marketplaceCode, listingId } = await seed(appDb);

    const jobRunId = newId();
    await jobsRepo.startJobRun(appDb, {
      id: jobRunId,
      jobName: 'ObserveBuybox',
      startedAt: NOW,
      finishedAt: NOW + 10,
      state: 'success',
      itemsTotal: 1,
      itemsOk: 1,
      itemsFailed: 0,
      error: null,
      correlationId: 'corr-x',
      jobQueueId: null,
    });

    const matchId = newId();
    await eventsRepo.logEvent(appDb, {
      id: matchId,
      at: NOW + 100,
      level: 'warn',
      marketplaceCode,
      listingId,
      jobRunId,
      code: 'PriceRejected',
      message: 'rejected',
      context: null,
    });
    // A near-identical event on a different listing/job run/code — must not match the filters below.
    await eventsRepo.logEvent(appDb, {
      id: newId(),
      at: NOW + 100,
      level: 'warn',
      marketplaceCode,
      listingId: null,
      jobRunId: null,
      code: 'OtherCode',
      message: 'other',
      context: null,
    });

    const byListing = await eventsRepo.listEventsFiltered(appDb, { listingId });
    expect(byListing.map((e) => e.id)).toEqual([matchId]);
    const byJobRun = await eventsRepo.listEventsFiltered(appDb, { jobRunId });
    expect(byJobRun.map((e) => e.id)).toEqual([matchId]);
    const byCode = await eventsRepo.listEventsFiltered(appDb, { code: 'PriceRejected' });
    expect(byCode.map((e) => e.id)).toEqual([matchId]);
    const byMarketplaceAndRange = await eventsRepo.listEventsFiltered(appDb, {
      marketplaceCode,
      sinceMs: NOW + 50,
      untilMs: NOW + 150,
    });
    expect(byMarketplaceAndRange).toHaveLength(2); // both events on this marketplace, within range
    const outsideRange = await eventsRepo.listEventsFiltered(appDb, { sinceMs: NOW + 200 });
    expect(outsideRange).toHaveLength(0);
  }, 30_000);
});
