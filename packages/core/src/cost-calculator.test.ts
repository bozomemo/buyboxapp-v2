import { Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import { type BundleMember, type CostCalculatorDeps, originalUnitCost, unitCost } from './cost-calculator.js';

function deps(overrides: Partial<CostCalculatorDeps> = {}): CostCalculatorDeps {
  return {
    getUnitCost: (baseCode) => (baseCode === '12345' ? Money.fromKurus(1000n) : undefined),
    getBundleMembers: () => undefined,
    getPriceMultiplier: () => 1,
    ...overrides,
  };
}

describe('unitCost (doc 02 §4, vectors in §7.5)', () => {
  it('no dash: base cost × 1', () => {
    const result = unitCost('12345', 'trendyol', deps());
    expect(result).toEqual({ ok: true, value: Money.fromKurus(1000n) });
  });

  it('multi-pack: base cost × unit count', () => {
    const result = unitCost('12345-4', 'trendyol', deps());
    expect(result).toEqual({ ok: true, value: Money.fromKurus(4000n) });
  });

  it('decimal suffix discarded, same as the plain multi-pack', () => {
    const result = unitCost('12345-4.2', 'trendyol', deps());
    expect(result).toEqual({ ok: true, value: Money.fromKurus(4000n) });
  });

  it('multiplier applied on top of unit count', () => {
    const result = unitCost('12345-4', 'trendyol', deps({ getPriceMultiplier: () => 1.2 }));
    expect(result).toEqual({ ok: true, value: Money.fromKurus(4800n) });
  });

  it('unknown stock item is StockItemNotFound, never a sentinel', () => {
    const result = unitCost('99999-1', 'trendyol', deps());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({ type: 'StockItemNotFound', baseCode: '99999' });
  });

  it('bundle: sum of members', () => {
    const members: BundleMember[] = [
      { memberStockCode: '12345', quantity: 2 },
      { memberStockCode: '67890', quantity: 1 },
    ];
    const result = unitCost(
      '11111-k2',
      'trendyol',
      deps({
        getUnitCost: (baseCode) =>
          ({ '12345': Money.fromKurus(1000n), '67890': Money.fromKurus(500n) })[baseCode],
        getBundleMembers: (code) => (code === '11111-k2' ? members : undefined),
      }),
    );
    // 1000*2 + 500*1 = 2500
    expect(result).toEqual({ ok: true, value: Money.fromKurus(2500n) });
  });

  it('bundle with an undefined member set is BundleNotDefined, not a sentinel', () => {
    const result = unitCost('11111-k9', 'trendyol', deps({ getBundleMembers: () => undefined }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({ type: 'BundleNotDefined', bundleStockCode: '11111-k9' });
  });

  it('bundle with an empty member list is also BundleNotDefined', () => {
    const result = unitCost('11111-k9', 'trendyol', deps({ getBundleMembers: () => [] }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({ type: 'BundleNotDefined', bundleStockCode: '11111-k9' });
  });

  it('a bundle member with unknown cost yields BundleMemberUnknown, wrapping the cause', () => {
    const result = unitCost(
      '11111-k2',
      'trendyol',
      deps({ getBundleMembers: () => [{ memberStockCode: '99999', quantity: 1 }] }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      type: 'BundleMemberUnknown',
      bundleStockCode: '11111-k2',
      memberStockCode: '99999',
      cause: { type: 'StockItemNotFound', baseCode: '99999' },
    });
  });

  it('a bundle that contains itself is a BundleCycle', () => {
    const result = unitCost(
      '11111-k2',
      'trendyol',
      deps({
        getBundleMembers: (code) =>
          code === '11111-k2' ? [{ memberStockCode: '11111-k2', quantity: 1 }] : undefined,
      }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.type).toBe('BundleCycle');
  });

  it('an indirect cycle (A contains B, B contains A) is also a BundleCycle', () => {
    const result = unitCost(
      'A-k1',
      'trendyol',
      deps({
        getBundleMembers: (code) => {
          if (code === 'A-k1') return [{ memberStockCode: 'B-k1', quantity: 1 }];
          if (code === 'B-k1') return [{ memberStockCode: 'A-k1', quantity: 1 }];
          return undefined;
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.type).toBe('BundleCycle');
  });

  it('bundle recursion beyond the depth limit is rejected', () => {
    // A chain of 6 nested bundles, each containing the next — exceeds MAX_BUNDLE_DEPTH (5).
    const chain = ['B0-k1', 'B1-k1', 'B2-k1', 'B3-k1', 'B4-k1', 'B5-k1'];
    const result = unitCost(
      'B0-k1',
      'trendyol',
      deps({
        getUnitCost: () => undefined,
        getBundleMembers: (code) => {
          const i = chain.indexOf(code);
          if (i === -1 || i === chain.length - 1) return undefined;
          return [{ memberStockCode: chain[i + 1] as string, quantity: 1 }];
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('an unparseable stock code is rejected, not silently coerced', () => {
    const result = unitCost('bad-code-!!!', 'trendyol', deps());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.type).toBe('UnparseableStockCode');
  });

  it('originalUnitCost ignores the price multiplier', () => {
    const result = originalUnitCost('12345-4', 'trendyol', deps({ getPriceMultiplier: () => 1.2 }));
    expect(result).toEqual({ ok: true, value: Money.fromKurus(4000n) });
  });
});
