import { describe, expect, it } from 'vitest';
import { runProductSourceContractChecks } from '../contract/product-source-contract.js';
import { MarketplaceListingProductSource } from './marketplace-listing.js';

describe('MarketplaceListingProductSource', () => {
  const validConfig = {
    listings: [
      { sellerStockCode: 'ABC123-2', productName: 'İkili paket' },
      { sellerStockCode: 'ABC123-3', productName: 'Üçlü paket' }, // same base code, different bundle suffix
      { sellerStockCode: 'not a valid  stock code that still parses', productName: 'Edge case' },
    ],
  };

  it('passes the product source contract suite', async () => {
    await expect(
      runProductSourceContractChecks(MarketplaceListingProductSource, { validConfig }),
    ).resolves.toBeUndefined();
  });

  it('derives one stock item per distinct base stock code, deduplicating bundle variants', async () => {
    const items = [];
    for await (const item of MarketplaceListingProductSource.fetch(validConfig)) {
      items.push(item);
    }
    const baseCodes = items.map((i) => i.baseStockCode);
    expect(baseCodes).toContain('ABC123');
    expect(baseCodes.filter((c) => c === 'ABC123')).toHaveLength(1); // deduplicated
    expect(items.every((i) => i.unitCost.isZero())).toBe(true); // cost is genuinely unknown at this stage
  });
});
