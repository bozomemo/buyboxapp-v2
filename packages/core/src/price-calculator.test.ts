import { Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import { effectiveCommissionRate, type CargoBand, type FeeSettings } from './fee-model.js';
import { Fraction } from './fraction.js';
import { floorPrice, netProceeds, retentionFactor } from './price-calculator.js';

function fees(overrides: Partial<FeeSettings> = {}): FeeSettings {
  return {
    effectiveFrom: new Date(0),
    commissionVatRate: 20,
    commissionRateIncludesVat: false,
    commissionVatDeductible: false,
    commissionBase: 'gross',
    defaultCommissionRate: 16,
    cargoBands: NO_CAMPAIGN_CARGO_BANDS,
    cargoAmountsIncludeVat: true,
    cargoVatRate: 20,
    cargoVatDeductible: false,
    expenditureBands: [],
    expenditureIncludesVat: true,
    expenditureVatRate: 20,
    expenditureVatDeductible: false,
    ...overrides,
  };
}

// doc 02 §7.2 fee setup: cargo bands [<=3000: 476, <=7500: 900, else: 1100], no expenditure.
const NO_CAMPAIGN_CARGO_BANDS: CargoBand[] = [
  { maxPrice: Money.fromKurus(3000n), amount: Money.fromKurus(476n) },
  { maxPrice: Money.fromKurus(7500n), amount: Money.fromKurus(900n) },
  { maxPrice: null, amount: Money.fromKurus(1100n) },
];

function cEff(c0: number, vc = 20, deductible = false): number {
  return effectiveCommissionRate(c0, {
    commissionVatRate: vc,
    commissionRateIncludesVat: false,
    commissionVatDeductible: deductible,
  });
}

describe('retentionFactor (doc 02 §7.1)', () => {
  // Verified independently against doc 02's own stated formula (§5.2 "Let D = 1/(1+v/100)
  // - c_eff/100"); the doc's worked table 7.1 contains arithmetic slips in three of its
  // seven rows (their D appears to have been computed from a rounded intermediate c_eff,
  // which doc 02 §1 itself says never to do — "never round intermediate values"). Per the
  // doc's own instruction ("if the table itself is wrong, fix it here and record why"),
  // these expectations are the values the stated formula actually produces, checked by
  // hand with exact fractions.
  it.each([
    [10, 16.0, 20, false, 19.2, 986n, 1375n],
    [20, 16.0, 20, false, 19.2, 481n, 750n],
    [1, 16.0, 20, false, 19.2, 10076n, 12625n],
    [10, 16.0, 20, true, 16, 206n, 275n],
    [10, 7.83, 20, false, 9.396, 224161n, 275000n],
    [20, 45.0, 20, false, 54, 22n, 75n],
  ])(
    'v=%s c0=%s vc=%s deductible=%s -> c_eff=%s, D=%s/%s',
    (v, c0, vc, deductible, expectedCEff, num, den) => {
      const eff = cEff(c0, vc, deductible as boolean);
      expect(eff).toBeCloseTo(expectedCEff as number, 6);
      const D = retentionFactor({ vatRate: v as number, effectiveCommissionRate: eff, campaign: null });
      expect(D).toEqual(Fraction.of(num, den));
    },
  );

  it('D <= 0 when commission plus VAT exceeds all revenue', () => {
    const eff = cEff(70, 20, false); // c_eff = 84
    const D = retentionFactor({ vatRate: 20, effectiveCommissionRate: eff, campaign: null });
    expect(Fraction.isPositive(D)).toBe(false);
  });
});

describe('floorPrice (doc 02 §7.2)', () => {
  // Verified independently by hand-checking self-consistency (the settled cargo band must
  // actually contain the settled price) against the exact D values above; the doc's own
  // worked table 7.2 is internally inconsistent for four of its five rows — e.g. its
  // row 1 (U=2000, v=10, c0=16) claims floor 3454 selecting the 900 cargo band, but 3454
  // does not fall in that band's range, and (2000+900)/D actually converges to 4045.
  // Only row 3 (U=1000) is self-consistent, and this implementation reproduces it exactly.
  it.each([
    [2000, 10, 16, 4045n],
    [2000, 20, 16, 4522n],
    [1000, 10, 16, 2059n],
    [5000, 20, 16, 9512n],
    [500, 1, 7.83, 1090n],
  ])('U=%s v=%s c0=%s -> floor %s', (U, v, c0, expected) => {
    const result = floorPrice({
      unitCost: Money.fromKurus(BigInt(U)),
      vatRate: v as number,
      effectiveCommissionRate: cEff(c0 as number),
      campaign: null,
      fees: fees(),
    });
    expect(result.ok && result.value.toKurus()).toBe(expected);
  });

  it('D <= 0 is NotProfitableAtAnyPrice, not a price', () => {
    const result = floorPrice({
      unitCost: Money.fromKurus(2000n),
      vatRate: 20,
      effectiveCommissionRate: cEff(70),
      campaign: null,
      fees: fees(),
    });
    expect(result).toEqual({ ok: false, error: { type: 'NotProfitableAtAnyPrice' } });
  });
});

describe('band-edge behaviour (doc 02 §7.3)', () => {
  it('is monotonically non-decreasing in U across the full cost range', () => {
    const input = { vatRate: 10, effectiveCommissionRate: cEff(16), campaign: null, fees: fees() };
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
    // Pick a unit cost whose unrounded floor lands close to the 3000-kuruş cargo band
    // edge and confirm netProceeds at the rounded floor is never short of cost.
    const input = { vatRate: 10, effectiveCommissionRate: cEff(16), campaign: null, fees: fees() };
    for (let u = 1600n; u <= 1620n; u++) {
      const result = floorPrice({ unitCost: Money.fromKurus(u), ...input });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const proceeds = netProceeds({
        price: result.value,
        vatRate: 10,
        effectiveCommissionRate: cEff(16),
        campaign: null,
        fees: fees(),
      });
      expect(proceeds.compareTo(Money.fromKurus(u)) >= 0).toBe(true);
    }
  });
});

describe('round-trip (doc 02 §7.4): netProceeds(floorPrice(U)) ≈ U within one kuruş', () => {
  const scenarios = [
    { vatRate: 10, c0: 16, cargo: NO_CAMPAIGN_CARGO_BANDS },
    { vatRate: 20, c0: 16, cargo: NO_CAMPAIGN_CARGO_BANDS },
    { vatRate: 1, c0: 7.83, cargo: NO_CAMPAIGN_CARGO_BANDS },
    { vatRate: 20, c0: 45, cargo: NO_CAMPAIGN_CARGO_BANDS },
  ];

  it.each(scenarios)(
    'holds across a range of unit costs for vatRate=$vatRate c0=$c0',
    ({ vatRate, c0, cargo }) => {
      const feeSettings = fees({ cargoBands: cargo });
      const effRate = cEff(c0);
      for (let u = 100n; u <= 15_000n; u += 731n) {
        const U = Money.fromKurus(u);
        const floor = floorPrice({
          unitCost: U,
          vatRate,
          effectiveCommissionRate: effRate,
          campaign: null,
          fees: feeSettings,
        });
        expect(floor.ok).toBe(true);
        if (!floor.ok) continue;
        const proceeds = netProceeds({
          price: floor.value,
          vatRate,
          effectiveCommissionRate: effRate,
          campaign: null,
          fees: feeSettings,
        });
        const diff = proceeds.subtract(U).abs().toKurus();
        expect(diff <= 1n).toBe(true);
      }
    },
  );
});

describe('netProceeds with a campaign (doc 02 §5.1)', () => {
  it('splits the discount between store and marketplace and nets VAT off the customer price', () => {
    const result = netProceeds({
      price: Money.fromKurus(10000n),
      vatRate: 10,
      effectiveCommissionRate: 19.2,
      campaign: { finalPrice: Money.fromKurus(9000n), storeSharePct: 50 },
      fees: fees({ cargoBands: [{ maxPrice: null, amount: Money.fromKurus(0n) }] }),
    });
    // totalDiscount=1000, storeDiscount=500, marketplaceRefund=500
    // commissionBase (gross) = 10000-500=9500, commission=9500*0.192=1824
    // revenueNet = 9000/1.1 = 8181.818...
    // net = 8181.818 - 1824 - 0 - 0 + 500 = 6857.818 -> round half-up 6858
    expect(result.toKurus()).toBe(6858n);
  });
});
