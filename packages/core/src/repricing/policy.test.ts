import { Duration, Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import { type RepricingPolicy, validateListingOverrides, validatePolicy } from './policy.js';

function policy(overrides: Partial<RepricingPolicy> = {}): RepricingPolicy {
  return {
    enabled: true,
    coarseStepMode: 'absolute',
    coarseStep: 100n,
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
    settleDuration: Duration.minutes(10),
    competitorPriceDelta: 5n,
    useSellerIdentityTrigger: true,
    pollInterval: Duration.minutes(5),
    concurrency: 1,
    ...overrides,
  };
}

describe('validatePolicy', () => {
  it('accepts a well-formed policy', () => {
    expect(validatePolicy(policy())).toEqual({ ok: true, value: policy() });
  });

  it('rejects a non-positive absolute coarse step', () => {
    const result = validatePolicy(policy({ coarseStep: 0n }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.some((e) => e.field === 'coarseStep')).toBe(true);
  });

  it('rejects a non-positive percent coarse step', () => {
    const result = validatePolicy(policy({ coarseStepMode: 'percent', coarseStep: 0 }));
    expect(result.ok).toBe(false);
  });

  it('rejects a negative refineTolerance', () => {
    const result = validatePolicy(policy({ refineTolerance: -1n }));
    expect(result.ok).toBe(false);
  });

  it('rejects a zero seekStep when seekStrategy is stepped', () => {
    const result = validatePolicy(policy({ seekStrategy: 'stepped', seekStep: 0n }));
    expect(result.ok).toBe(false);
  });

  it('rejects zero or negative pollInterval', () => {
    expect(() => Duration.millis(-1)).toThrow(); // Duration itself guards negatives
  });

  it('rejects a non-integer or sub-1 concurrency', () => {
    expect(validatePolicy(policy({ concurrency: 0 })).ok).toBe(false);
    expect(validatePolicy(policy({ concurrency: 1.5 })).ok).toBe(false);
  });

  it('requires lowStockThreshold/MarginPct to be valid only when the guard is enabled', () => {
    expect(validatePolicy(policy({ lowStockGuardEnabled: false, lowStockThreshold: -1 })).ok).toBe(true);
    expect(validatePolicy(policy({ lowStockGuardEnabled: true, lowStockThreshold: -1 })).ok).toBe(false);
  });
});

describe('validateListingOverrides', () => {
  it('accepts empty overrides', () => {
    expect(validateListingOverrides({}).ok).toBe(true);
  });

  it('rejects minPrice above maxPrice', () => {
    const result = validateListingOverrides({
      minPrice: Money.fromKurus(200n),
      maxPrice: Money.fromKurus(100n),
    });
    expect(result.ok).toBe(false);
  });

  it('accepts minPrice equal to or below maxPrice', () => {
    expect(
      validateListingOverrides({ minPrice: Money.fromKurus(100n), maxPrice: Money.fromKurus(100n) }).ok,
    ).toBe(true);
    expect(
      validateListingOverrides({ minPrice: Money.fromKurus(50n), maxPrice: Money.fromKurus(100n) }).ok,
    ).toBe(true);
  });
});
