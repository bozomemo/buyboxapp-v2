import { Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import type { CargoBand, FeeSettings } from './fee-model.js';
import { Fraction } from './fraction.js';
import { floorPrice, netProceeds, retentionFactor } from './price-calculator.js';

function fees(overrides: Partial<FeeSettings> = {}): FeeSettings {
  return {
    effectiveFrom: new Date(0),
    defaultCommissionRate: 16,
    cargoBands: NO_CAMPAIGN_CARGO_BANDS,
    expenditureBands: [],
    ...overrides,
  };
}

// doc 02 §7.2 fee setup: cargo bands [<=3000: 476, <=7500: 900, else: 1100], no expenditure.
const NO_CAMPAIGN_CARGO_BANDS: CargoBand[] = [
  { maxPrice: Money.fromKurus(3000n), amount: Money.fromKurus(476n) },
  { maxPrice: Money.fromKurus(7500n), amount: Money.fromKurus(900n) },
  { maxPrice: null, amount: Money.fromKurus(1100n) },
];

describe('retentionFactor (doc 02 §7.1) — D = 1 - c, no VAT term', () => {
  it.each([
    [16, 21n, 25n],
    [7.83, 9217n, 10000n],
    [45, 11n, 20n],
    [0, 1n, 1n],
  ])('c=%s -> D=%s/%s', (c, num, den) => {
    expect(retentionFactor({ commissionRate: c, campaign: null })).toEqual(Fraction.of(num, den));
  });

  it.each([100, 120])('D <= 0 when commission takes all revenue (c=%s)', (c) => {
    expect(Fraction.isPositive(retentionFactor({ commissionRate: c, campaign: null }))).toBe(false);
  });
});

describe('floorPrice (doc 02 §7.2)', () => {
  // Each expectation is (U + cargo) / (1 - c) rounded up, and each was checked by hand to fall
  // inside the cargo band it was computed with — e.g. row 1: (2000 + 900) / 0.84 = 3452.38…,
  // which is inside 3000 < p <= 7500, the band that charges 900.
  it.each([
    [2000, 16, 3453n],
    [1000, 16, 1758n],
    [5000, 16, 7024n],
    [500, 7.83, 1059n],
    [5000, 45, 11091n],
  ])('U=%s c=%s -> floor %s', (U, c, expected) => {
    const result = floorPrice({
      unitCost: Money.fromKurus(BigInt(U)),
      commissionRate: c as number,
      campaign: null,
      fees: fees(),
    });
    expect(result.ok && result.value.toKurus()).toBe(expected);
  });

  it('D <= 0 is NotProfitableAtAnyPrice, not a price', () => {
    const result = floorPrice({
      unitCost: Money.fromKurus(2000n),
      commissionRate: 100,
      campaign: null,
      fees: fees(),
    });
    expect(result).toEqual({ ok: false, error: { type: 'NotProfitableAtAnyPrice' } });
  });
});

describe('band-edge behaviour (doc 02 §7.3)', () => {
  it('is monotonically non-decreasing in U across the full cost range', () => {
    const input = { commissionRate: 16, campaign: null, fees: fees() };
    let previous = -1n;
    for (let u = 0n; u <= 20_000n; u += 37n) {
      const result = floorPrice({ unitCost: Money.fromKurus(u), ...input });
      expect(result.ok).toBe(true);
      const value = result.ok ? result.value.toKurus() : -1n;
      expect(value >= previous).toBe(true);
      previous = value;
    }
  });

  it('never settles below the true break-even at a band boundary (safe-direction rounding)', () => {
    // (U + 476) / 0.84 crosses the 3000-kuruş cargo band edge at U = 2044.
    const input = { commissionRate: 16, campaign: null, fees: fees() };
    for (let u = 2030n; u <= 2060n; u++) {
      const result = floorPrice({ unitCost: Money.fromKurus(u), ...input });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const proceeds = netProceeds({ price: result.value, commissionRate: 16, campaign: null, fees: fees() });
      expect(proceeds.compareTo(Money.fromKurus(u)) >= 0).toBe(true);
    }
  });
});

describe('round-trip (doc 02 §7.4): netProceeds(floorPrice(U)) ≈ U within one kuruş', () => {
  it.each([16, 7.83, 45])('holds across a range of unit costs for c=%s', (c) => {
    const feeSettings = fees();
    for (let u = 100n; u <= 15_000n; u += 731n) {
      const U = Money.fromKurus(u);
      const floor = floorPrice({ unitCost: U, commissionRate: c, campaign: null, fees: feeSettings });
      expect(floor.ok).toBe(true);
      if (!floor.ok) continue;
      const proceeds = netProceeds({
        price: floor.value,
        commissionRate: c,
        campaign: null,
        fees: feeSettings,
      });
      expect(proceeds.subtract(U).abs().toKurus() <= 1n).toBe(true);
    }
  });
});

describe('netProceeds (doc 02 §5.1)', () => {
  it('is price minus commission minus cargo, with nothing netted off for VAT', () => {
    // 5000 - 5000 * 16% - 900 = 3300
    const result = netProceeds({
      price: Money.fromKurus(5000n),
      commissionRate: 16,
      campaign: null,
      fees: fees(),
    });
    expect(result.toKurus()).toBe(3300n);
  });

  it('splits a campaign discount between store and marketplace', () => {
    const result = netProceeds({
      price: Money.fromKurus(10000n),
      commissionRate: 16,
      campaign: { finalPrice: Money.fromKurus(9000n), storeSharePct: 50 },
      fees: fees({ cargoBands: [{ maxPrice: null, amount: Money.fromKurus(0n) }] }),
    });
    // totalDiscount=1000, storeDiscount=500, marketplaceRefund=500
    // commission = (10000 - 500) * 16% = 1520
    // net = 9000 - 1520 - 0 - 0 + 500 = 7980
    expect(result.toKurus()).toBe(7980n);
  });

  it('agrees with the campaign retention factor (floor round-trip under a campaign)', () => {
    const campaign = { ratio: 0.9, storeSharePct: 50 };
    const feeSettings = fees({ cargoBands: [{ maxPrice: null, amount: Money.fromKurus(0n) }] });
    const floor = floorPrice({
      unitCost: Money.fromKurus(7980n),
      commissionRate: 16,
      campaign,
      fees: feeSettings,
    });
    // D = 0.9 - (1 - 0.1 * 0.5) * 0.16 + 0.1 * 0.5 = 0.798 -> 7980 / 0.798 = 10000
    expect(floor.ok && floor.value.toKurus()).toBe(10000n);
  });
});
