import { describe, expect, it } from 'vitest';
import { runProductSourceContractChecks } from '../contract/product-source-contract.js';
import { ManualProductSource } from './manual.js';

describe('ManualProductSource', () => {
  it('passes the product source contract suite', async () => {
    await expect(
      runProductSourceContractChecks(ManualProductSource, {
        validConfig: { baseStockCode: 'ABC123', name: 'Test Item', unitCostMajor: '42.50', unitStock: 10 },
      }),
    ).resolves.toBeUndefined();
  });

  it('yields exactly one stock item with an exact Money unit cost', async () => {
    const items = [];
    for await (const item of ManualProductSource.fetch({
      baseStockCode: 'ABC123',
      name: 'Test Item',
      unitCostMajor: '42.50',
      unitStock: 10,
    })) {
      items.push(item);
    }
    expect(items).toHaveLength(1);
    expect(items[0]?.unitCost.toKurus()).toBe(4250n);
    expect(items[0]?.unitStock).toBe(10);
  });

  it('rejects an invalid config via the Zod schema', async () => {
    await expect(async () => {
      for await (const _item of ManualProductSource.fetch({ baseStockCode: '', name: '', unitStock: -1 })) {
        // never reached
      }
    }).rejects.toThrow();
  });
});
