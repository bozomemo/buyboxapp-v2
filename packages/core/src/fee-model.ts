/**
 * FeeModel — cargo/expenditure band selection (docs/02-cost-and-price-model.md §3).
 *
 * **No VAT anywhere** (product owner's decision, 2026-11-03, doc 02 §0): every amount — unit
 * cost, selling price, commission, cargo, expenditure — is taken as entered, on the same
 * VAT-inclusive basis as the marketplace price. There is no commission gross-up, no VAT rate
 * and no deductibility switch; band amounts are used exactly as configured.
 *
 * Band amounts stay in `Fraction` here rather than rounding to `Money` per band, because
 * they feed into `netProceeds`/`floorPrice` calculation chains that must round only once,
 * at their own final step (doc 02 §1). See `fraction.ts`.
 */
import type { Money } from '@buybox/shared';
import { Fraction } from './fraction.js';

export interface CargoBand {
  /** `null` = no upper bound (the catch-all last band). */
  readonly maxPrice: Money | null;
  readonly amount: Money;
}

export interface ExpenditureBand {
  readonly minPrice: Money;
  readonly amount: Money;
}

export interface FeeSettings {
  readonly effectiveFrom: Date;
  /** Commission percent used when the listing feed carries none. */
  readonly defaultCommissionRate: number;
  /** Bands are tried in array order, first match wins. */
  readonly cargoBands: readonly CargoBand[];
  /** Other expenditure (marketing / service fees) — bands tried in array order, first match wins. */
  readonly expenditureBands: readonly ExpenditureBand[];
}

/** First cargo band (in array order) whose `maxPrice` is null or `>= customerPrice`. */
export function selectCargoBandIndex(customerPrice: Money, bands: readonly CargoBand[]): number {
  return bands.findIndex((band) => band.maxPrice === null || customerPrice.compareTo(band.maxPrice) <= 0);
}

/** First expenditure band (in array order) whose `minPrice` is `<= customerPrice`. */
export function selectExpenditureBandIndex(customerPrice: Money, bands: readonly ExpenditureBand[]): number {
  return bands.findIndex((band) => customerPrice.compareTo(band.minPrice) >= 0);
}

export function normalisedCargo(customerPrice: Money, fees: FeeSettings): Fraction {
  const index = selectCargoBandIndex(customerPrice, fees.cargoBands);
  if (index === -1) return Fraction.zero;
  return Fraction.fromMoney((fees.cargoBands[index] as CargoBand).amount);
}

export function normalisedExpenditure(customerPrice: Money, fees: FeeSettings): Fraction {
  const index = selectExpenditureBandIndex(customerPrice, fees.expenditureBands);
  if (index === -1) return Fraction.zero;
  return Fraction.fromMoney((fees.expenditureBands[index] as ExpenditureBand).amount);
}

/** The `(cargoBandIndex, expenditureBandIndex)` pair — `bandsOf(P)` in doc 02 §5.3. */
export function bandKey(customerPrice: Money, fees: FeeSettings): string {
  return `${selectCargoBandIndex(customerPrice, fees.cargoBands)}:${selectExpenditureBandIndex(customerPrice, fees.expenditureBands)}`;
}

// --- Fraction-price variants, used by floorPrice's fixed-point iteration (doc 02 §5.3),
// where the candidate price is an exact rational, not yet rounded to Money. ---

export function selectCargoBandIndexFraction(customerPrice: Fraction, bands: readonly CargoBand[]): number {
  return bands.findIndex(
    (band) =>
      band.maxPrice === null || Fraction.compare(customerPrice, Fraction.fromMoney(band.maxPrice)) <= 0,
  );
}

export function selectExpenditureBandIndexFraction(
  customerPrice: Fraction,
  bands: readonly ExpenditureBand[],
): number {
  return bands.findIndex((band) => Fraction.compare(customerPrice, Fraction.fromMoney(band.minPrice)) >= 0);
}

export function normalisedCargoFraction(customerPrice: Fraction, fees: FeeSettings): Fraction {
  const index = selectCargoBandIndexFraction(customerPrice, fees.cargoBands);
  if (index === -1) return Fraction.zero;
  return Fraction.fromMoney((fees.cargoBands[index] as CargoBand).amount);
}

export function normalisedExpenditureFraction(customerPrice: Fraction, fees: FeeSettings): Fraction {
  const index = selectExpenditureBandIndexFraction(customerPrice, fees.expenditureBands);
  if (index === -1) return Fraction.zero;
  return Fraction.fromMoney((fees.expenditureBands[index] as ExpenditureBand).amount);
}

export function bandKeyFraction(customerPrice: Fraction, fees: FeeSettings): string {
  return `${selectCargoBandIndexFraction(customerPrice, fees.cargoBands)}:${selectExpenditureBandIndexFraction(customerPrice, fees.expenditureBands)}`;
}

/** The last (catch-all / highest) band's amount, used to seed the floor-price iteration. */
export function lastCargoAmount(bands: readonly CargoBand[]): Money | undefined {
  return bands.at(-1)?.amount;
}

export function lastExpenditureAmount(bands: readonly ExpenditureBand[]): Money | undefined {
  return bands.at(-1)?.amount;
}
