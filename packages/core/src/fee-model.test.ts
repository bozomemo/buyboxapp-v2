import { Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import {
  type CargoBand,
  type ExpenditureBand,
  type FeeSettings,
  normalisedCargo,
  normalisedExpenditure,
  selectCargoBandIndex,
  selectExpenditureBandIndex,
} from './fee-model.js';
import { Fraction } from './fraction.js';

describe('band amounts are used exactly as entered — no VAT adjustment (doc 02 §3)', () => {
  const fees: FeeSettings = {
    effectiveFrom: new Date(0),
    defaultCommissionRate: 16,
    cargoBands: [{ maxPrice: null, amount: Money.fromKurus(1000n) }],
    expenditureBands: [{ minPrice: Money.fromKurus(0n), amount: Money.fromKurus(250n) }],
  };

  it('cargo', () => {
    expect(Fraction.toMoneyRoundHalfUp(normalisedCargo(Money.fromKurus(5000n), fees)).toKurus()).toBe(1000n);
  });

  it('expenditure', () => {
    expect(Fraction.toMoneyRoundHalfUp(normalisedExpenditure(Money.fromKurus(5000n), fees)).toKurus()).toBe(
      250n,
    );
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
