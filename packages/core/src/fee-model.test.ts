import { Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import {
  type CargoBand,
  type ExpenditureBand,
  effectiveCommissionRate,
  normaliseAmount,
  selectCargoBandIndex,
  selectExpenditureBandIndex,
} from './fee-model.js';
import { Fraction } from './fraction.js';

describe('effectiveCommissionRate (doc 02 §3.1)', () => {
  it('grosses up an ex-VAT rate by the commission VAT rate by default', () => {
    const rate = effectiveCommissionRate(16, {
      commissionVatRate: 20,
      commissionRateIncludesVat: false,
      commissionVatDeductible: false,
    });
    expect(rate).toBeCloseTo(19.2, 10);
  });

  it('uses the raw rate directly when it already includes VAT', () => {
    const rate = effectiveCommissionRate(19.2, {
      commissionVatRate: 20,
      commissionRateIncludesVat: true,
      commissionVatDeductible: false,
    });
    expect(rate).toBeCloseTo(19.2, 10);
  });

  it('uses the ex-VAT rate directly when the VAT is deductible (reclaimed)', () => {
    const rate = effectiveCommissionRate(16, {
      commissionVatRate: 20,
      commissionRateIncludesVat: false,
      commissionVatDeductible: true,
    });
    expect(rate).toBe(16);
  });
});

describe('normaliseAmount (doc 02 §3.2)', () => {
  const toMoney = (f: ReturnType<typeof normaliseAmount>) => Fraction.toMoneyRoundHalfUp(f).toKurus();

  it('uses the amount as-is when it already includes VAT and is not deductible (the defaults)', () => {
    const f = normaliseAmount(Money.fromKurus(1000n), true, 20, false);
    expect(toMoney(f)).toBe(1000n);
  });

  it('grosses up an ex-VAT amount', () => {
    const f = normaliseAmount(Money.fromKurus(1000n), false, 20, false);
    expect(toMoney(f)).toBe(1200n);
  });

  it('nets a VAT-inclusive deductible amount back down', () => {
    const f = normaliseAmount(Money.fromKurus(1200n), true, 20, true);
    expect(toMoney(f)).toBe(1000n);
  });
});

describe('band selection — first match in array order wins', () => {
  const cargoBands: CargoBand[] = [
    { maxPrice: Money.fromKurus(3000n), amount: Money.fromKurus(476n) },
    { maxPrice: Money.fromKurus(7500n), amount: Money.fromKurus(900n) },
    { maxPrice: null, amount: Money.fromKurus(1100n) },
  ];

  it.each([
    [1n, 0],
    [3000n, 0],
    [3001n, 1],
    [7500n, 1],
    [7501n, 2],
    [1_000_000n, 2],
  ])('price %s kuruş selects band index %s', (price, expected) => {
    expect(selectCargoBandIndex(Money.fromKurus(price), cargoBands)).toBe(expected);
  });

  it('returns -1 when no band matches', () => {
    expect(selectCargoBandIndex(Money.fromKurus(1n), [])).toBe(-1);
  });

  const expenditureBands: ExpenditureBand[] = [
    { minPrice: Money.fromKurus(5000n), amount: Money.fromKurus(200n) },
    { minPrice: Money.fromKurus(0n), amount: Money.fromKurus(50n) },
  ];

  it('expenditure bands select the first array entry whose minPrice is satisfied', () => {
    expect(selectExpenditureBandIndex(Money.fromKurus(6000n), expenditureBands)).toBe(0);
    expect(selectExpenditureBandIndex(Money.fromKurus(1000n), expenditureBands)).toBe(1);
  });
});
