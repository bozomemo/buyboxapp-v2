import { describe, expect, it } from 'vitest';
import { buildCommissionTiers } from './commission-tariff.js';
import {
  breakEvenPrice,
  desiBandFor,
  estimateSellerProfit,
  tierAt,
  type CommissionTier,
  type SellerProfitInput,
  type SellerProfitSettings,
} from './seller-profit.js';

// The product owner's sample tariff row, 2026-11-02: Acana Indoor Entree Sterilised 4,5 Kg.
const ACANA = buildCommissionTiers(
  {
    tier1Min: 426660n,
    tier2Max: 426659n,
    tier2Min: 361360n,
    tier3Max: 361359n,
    tier3Min: 313565n,
    tier4Max: 313564n,
  },
  [16.5, 6.2, 2.8, 2.7],
);
if (!ACANA.ok) throw new Error('fixture tariff refused');
const TIERS: readonly CommissionTier[] = ACANA.tiers;

const SETTINGS: SellerProfitSettings = {
  fixedSaleFee: 1250n,
  desiBands: [
    { maxDesi: 5, cargo: 8000n, operation: 3000n },
    { maxDesi: 10, cargo: 10000n, operation: 5000n },
    { maxDesi: null, cargo: 15000n, operation: 8000n },
  ],
};

function input(overrides: Partial<SellerProfitInput> = {}): SellerProfitInput {
  return {
    price: 500000n,
    unitPrice: 300000n,
    desi: 7,
    unitMultiplier: 1,
    tiers: TIERS,
    settings: SETTINGS,
    ...overrides,
  };
}

describe('tierAt — the commission band a price falls in', () => {
  it.each([
    [500000n, 16.5],
    [426660n, 16.5],
    [426659n, 6.2],
    [361360n, 6.2],
    [361359n, 2.8],
    [313565n, 2.8],
    [313564n, 2.7],
    [1n, 2.7],
  ])('price %s -> %s %%', (price, rate) => {
    expect(tierAt(price, TIERS)?.rate).toBe(rate);
  });
});

describe('desiBandFor — first band whose upper desi bound holds', () => {
  it.each([
    [0.5, 8000n],
    [5, 8000n],
    [5.01, 10000n],
    [10, 10000n],
    [40, 15000n],
  ])('desi %s -> cargo %s', (desi, cargo) => {
    expect(desiBandFor(desi, SETTINGS.desiBands)?.cargo).toBe(cargo);
  });

  it('a table with no catch-all row has no band for a large parcel', () => {
    expect(desiBandFor(11, SETTINGS.desiBands.slice(0, 2))).toBeUndefined();
  });
});

describe('estimateSellerProfit (doc 17 §8)', () => {
  // Fixed costs at desi 7: cargo 100.00 + operation 50.00 + fee 12.50 + unit price 3,000.00
  // = 3,162.50 ₺. profit = P − P × c(P) − 3,162.50.
  it.each([
    [500000n, 16.5, 82500n, 101250n],
    [426660n, 16.5, 70399n, 40011n],
    [426659n, 6.2, 26453n, 83956n],
    [420000n, 6.2, 26040n, 77710n],
    [350000n, 2.8, 9800n, 23950n],
  ])('price %s -> rate %s, commission %s, profit %s', (price, rate, commission, profit) => {
    const result = estimateSellerProfit(input({ price }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.estimate.commissionRate).toBe(rate);
    expect(result.estimate.commission).toBe(commission);
    expect(result.estimate.profit).toBe(profit);
    expect(result.estimate.cost).toBe(300000n);
    expect(result.estimate.breakEvenPrice).toBe(325361n);
  });

  it('reports profit as a percentage of the price', () => {
    const result = estimateSellerProfit(input());
    expect(result.ok && result.estimate.profitPct).toBeCloseTo(20.25, 10);
  });

  it.each([
    ['noSettings', { settings: null }],
    ['noUnitPrice', { unitPrice: null }],
    ['noDesi', { desi: null }],
    ['packCard', { unitMultiplier: 3 }],
    ['noTariff', { tiers: null }],
    ['noTariff', { tiers: [] }],
    ['noDesiBand', { settings: { ...SETTINGS, desiBands: SETTINGS.desiBands.slice(0, 1) } }],
    ['priceOutsideTariff', { tiers: [{ minPrice: 100000n, maxPrice: 200000n, rate: 10 }] }],
  ] as const)('says %s rather than guessing', (missing, overrides) => {
    expect(estimateSellerProfit(input(overrides))).toEqual({ ok: false, missing });
  });
});

describe('breakEvenPrice — solved per tier, lowest that lies inside its own tier', () => {
  it('lands in the 2.8 % tier for the sample, rounded up so it never breaks even short', () => {
    // 316,250 / 0.972 = 325,360.08… -> 325,361. The other tiers' solutions fall outside them:
    // 0.973 -> 325,025 > 313,564; 0.938 -> 337,154 < 361,360; 0.835 -> 378,743 < 426,660.
    expect(breakEvenPrice(316250n, TIERS)).toBe(325361n);
    const at = (price: bigint) => estimateSellerProfit(input({ price, desi: 7 }));
    const justAbove = at(325361n);
    const justBelow = at(325360n);
    expect(justAbove.ok && justAbove.estimate.profit >= 0n).toBe(true);
    expect(justBelow.ok && justBelow.estimate.profit <= 0n).toBe(true);
  });

  it('is null when no tier admits a break-even', () => {
    expect(breakEvenPrice(10_000_000n, [{ minPrice: null, maxPrice: 100000n, rate: 10 }])).toBeNull();
  });

  it('skips a tier whose rate takes everything', () => {
    expect(breakEvenPrice(1000n, [{ minPrice: null, maxPrice: null, rate: 100 }])).toBeNull();
  });
});
