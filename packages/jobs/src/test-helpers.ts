/**
 * Test-only: a fresh, migrated SQLite database per test file, plus fixture builders shared
 * across this package's job tests. Not exported from `index.ts` — mirrors `packages/db`'s own
 * `test-helpers.ts` convention. SQLite only: cross-dialect correctness is `packages/db`'s own
 * Phase 3 DoD; these tests are about job-orchestration logic, not repository portability.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IMarketplaceAdapter, MarketplaceCapabilities } from '@buybox/adapters';
import {
  configRepo,
  createDb,
  listingsRepo,
  newId,
  runMigrations,
  stockRepo,
  type AppDatabase,
} from '@buybox/db';
import type { MarketplaceCode } from '@buybox/core';

export interface TestDb {
  readonly appDb: AppDatabase;
  cleanup(): void;
}

export async function createSqliteTestDb(): Promise<TestDb> {
  const dir = mkdtempSync(path.join(tmpdir(), 'buybox-jobs-test-'));
  const file = path.join(dir, 'test.db');
  const appDb = createDb(`file:${file}`, 'sqlite');
  await runMigrations(appDb);
  return {
    appDb,
    cleanup: () => {
      appDb.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const NOW = Date.UTC(2026, 0, 1);

// Zero cargo/expenditure keeps the floor-price math in tests driven purely by commission and
// VAT, so test prices (already small, in kuruş) don't need to model realistic cargo tariffs.
const FLAT_CARGO_BANDS = JSON.stringify([{ maxPrice: null, amount: '0' }]);
const FLAT_EXPENDITURE_BANDS = JSON.stringify([{ minPrice: '0', amount: '0' }]);

export async function seedMarketplace(appDb: AppDatabase, marketplaceCode = 'trendyol'): Promise<void> {
  await configRepo.upsertMarketplace(appDb, {
    code: marketplaceCode,
    displayName: 'Trendyol',
    enabled: true,
    merchantRef: 'merchant-1',
    createdAt: NOW,
    updatedAt: NOW,
  });
  await configRepo.insertFeeSettings(appDb, {
    id: newId(),
    marketplaceCode,
    effectiveFrom: NOW - 1000,
    commissionVatRate: 20,
    commissionRateIncludesVat: false,
    commissionVatDeductible: false,
    commissionBase: 'gross',
    defaultCommissionRate: 15,
    cargoBands: FLAT_CARGO_BANDS,
    cargoAmountsIncludeVat: true,
    cargoVatRate: 20,
    cargoVatDeductible: false,
    expenditureBands: FLAT_EXPENDITURE_BANDS,
    expenditureIncludesVat: true,
    expenditureVatRate: 20,
    expenditureVatDeductible: false,
  });
  await configRepo.upsertRepricingPolicy(appDb, {
    marketplaceCode,
    coarseStepMode: 'percent',
    coarseStepAbsolute: null,
    coarseStepPercent: 5,
    refineTolerance: 50n,
    seekStrategy: 'direct',
    undercutBy: 10n,
    seekStep: 100n,
    soleSellerMarginPct: 10,
    lowStockGuardEnabled: false,
    lowStockThreshold: 3,
    lowStockMarginPct: 5,
    stockMode: 'ignoreStock',
    minPhysicalStock: 0,
    requirePriceConfirmation: false,
    settleDurationMs: 60_000,
    competitorPriceDelta: 10n,
    useSellerIdentityTrigger: false,
    pollIntervalMs: 300_000,
    concurrency: 1,
    dailyUpdateAllowanceFormula: '',
    budgetReservePct: 20,
    enabled: true,
    updatedBy: 'test',
    updatedAt: NOW,
  });
}

export interface SeedListingOptions {
  readonly marketplaceCode?: string;
  readonly baseStockCode?: string;
  readonly marketplaceListingId?: string;
  readonly price?: bigint;
  readonly unitCost?: bigint;
  readonly repriceEnabled?: boolean;
  /** `listings.extra` JSON — carries the public product-page ref the scrape job reads. */
  readonly extra?: string | null;
}

/** A ready-to-reprice listing: stock item, marketplace prefs, and the listing row itself. */
export async function seedListing(appDb: AppDatabase, options: SeedListingOptions = {}): Promise<string> {
  const marketplaceCode = options.marketplaceCode ?? 'trendyol';
  const baseStockCode = options.baseStockCode ?? '12345';
  const marketplaceListingId = options.marketplaceListingId ?? 'barcode-1';

  await stockRepo.upsertStockItem(appDb, {
    baseStockCode,
    name: 'Widget',
    unitCost: options.unitCost ?? 1000n,
    unitStock: 50,
    sourceCode: 'manual',
    sourceRef: null,
    costUpdatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await stockRepo.ensureStockMarketplacePrefs(appDb, {
    baseStockCode,
    marketplaceCode,
    priceMultiplier: 1,
    autoRepriceEnabled: true,
    updatedBy: 'test',
    updatedAt: NOW,
  });

  const listingId = newId();
  await listingsRepo.upsertListing(appDb, {
    id: listingId,
    marketplaceCode,
    marketplaceListingId,
    sellerStockCode: baseStockCode,
    baseStockCode,
    unitCount: 1,
    isBundle: false,
    productName: 'Widget',
    price: options.price ?? 2000n,
    listPrice: null,
    customerPrice: null,
    offeredStock: 10,
    commissionRate: 15,
    vatRate: 20,
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
    repriceEnabled: options.repriceEnabled ?? true,
    extra: options.extra ?? null,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    updatedAt: NOW,
  });
  return listingId;
}

/** A fully in-memory, controllable `IMarketplaceAdapter` double for job tests. */
export function createFakeAdapter(overrides: Partial<IMarketplaceAdapter> = {}): IMarketplaceAdapter {
  const capabilities: MarketplaceCapabilities = {
    maxBatchSize: 1000,
    competitorPriceDepth: 3,
    exposesCompetitorIdentity: false,
    exposesCompetitorStock: false,
    exposesCampaignPrice: true,
    supportsConfirmation: true,
    dailyUpdateAllowance: (listingCount) => Math.max(10, listingCount * 10),
  };
  return {
    code: 'trendyol' as MarketplaceCode,
    capabilities,
    async testConnection() {
      return { ok: true, detail: 'fake' };
    },
    async *fetchListings() {
      // empty by default
    },
    async fetchBuyboxObservations(ids) {
      return ids.map((id) => ({
        marketplaceListingId: id,
        rank: 1,
        buyboxPrice: null,
        secondPrice: null,
        thirdPrice: null,
        hasMultipleSeller: false,
        observedAt: new Date(),
      }));
    },
    async submitPriceChanges(batch) {
      return { batchId: `batch-${batch.length}-${newId()}`, submittedAt: new Date() };
    },
    async pollSubmission() {
      return { status: 'completed', items: [] };
    },
    ...overrides,
  };
}
