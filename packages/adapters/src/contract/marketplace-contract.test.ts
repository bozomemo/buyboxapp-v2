import { Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import type { IMarketplaceAdapter, ListingSnapshot } from '../ports/marketplace.js';
import { runMarketplaceContractChecks, type MarketplaceContractFixture } from './marketplace-contract.js';

const fixture: MarketplaceContractFixture = {
  credentials: { key: 'k', secret: 's' },
  knownListingIds: ['barcode-1'],
  priceChanges: [{ marketplaceListingId: 'barcode-1', newPrice: Money.fromKurus(1000n) }],
};

const validListing: ListingSnapshot = {
  marketplaceListingId: 'barcode-1',
  sellerStockCode: 'SKU-1',
  productName: 'Test product',
  price: Money.fromKurus(1000n),
  listPrice: null,
  customerPrice: null,
  offeredStock: 5,
  commissionRate: 10,
  vatRate: 20,
  dispatchTime: 1,
  isSalable: true,
  isLocked: false,
  isSuspended: false,
  isArchived: false,
  isBlacklisted: false,
  lockReasons: [],
  deactivationReasons: [],
};

/** A fully compliant stub — proves the suite passes for a real implementation. */
function compliantAdapter(): IMarketplaceAdapter {
  return {
    code: 'trendyol',
    capabilities: {
      maxBatchSize: 100,
      competitorPriceDepth: 3,
      exposesCompetitorIdentity: false,
      exposesCompetitorStock: false,
      exposesCampaignPrice: true,
      supportsConfirmation: true,
      dailyUpdateAllowance: () => 10_000,
    },
    async testConnection() {
      return { ok: true, detail: 'connected' };
    },
    async *fetchListings() {
      yield validListing;
    },
    async fetchBuyboxObservations(ids) {
      return ids.map((id) => ({
        marketplaceListingId: id,
        rank: 1,
        buyboxPrice: Money.fromKurus(1000n),
        secondPrice: null,
        thirdPrice: null,
        hasMultipleSeller: false,
        observedAt: new Date(),
      }));
    },
    async submitPriceChanges(batch) {
      return { batchId: `batch-${batch.length}`, submittedAt: new Date() };
    },
    async pollSubmission() {
      return {
        status: 'completed',
        items: [{ marketplaceListingId: 'barcode-1', status: 'success', failureReason: null }],
      };
    },
  };
}

/** A stub that leaks the exact sentinels doc 10 §3 forbids — an "unimplemented adapter". */
function sentinelLeakingAdapter(): IMarketplaceAdapter {
  const adapter = compliantAdapter();
  return {
    ...adapter,
    async *fetchListings() {
      yield { ...validListing, productName: '< ? >' };
    },
  };
}

describe('runMarketplaceContractChecks', () => {
  it('passes for a fully compliant adapter', async () => {
    await expect(runMarketplaceContractChecks(compliantAdapter(), fixture)).resolves.toBeUndefined();
  });

  it('fails for an adapter that leaks a marketplace sentinel', async () => {
    await expect(runMarketplaceContractChecks(sentinelLeakingAdapter(), fixture)).rejects.toThrow(
      /sentinel value/i,
    );
  });

  it('fails for an adapter with an invalid capabilities shape', async () => {
    const broken = {
      ...compliantAdapter(),
      capabilities: { ...compliantAdapter().capabilities, maxBatchSize: 0 },
    };
    await expect(runMarketplaceContractChecks(broken, fixture)).rejects.toThrow(/maxBatchSize/i);
  });

  it('fails for an adapter returning the -1 rank sentinel instead of null', async () => {
    const broken: IMarketplaceAdapter = {
      ...compliantAdapter(),
      async fetchBuyboxObservations(ids) {
        return ids.map((id) => ({
          marketplaceListingId: id,
          rank: -1,
          buyboxPrice: null,
          secondPrice: null,
          thirdPrice: null,
          hasMultipleSeller: false,
          observedAt: new Date(),
        }));
      },
    };
    await expect(runMarketplaceContractChecks(broken, fixture)).rejects.toThrow(/sentinel -1/i);
  });
});
