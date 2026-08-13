/**
 * FeeModel — effective commission rate, cargo/expenditure band selection and VAT
 * treatment (docs/02-cost-and-price-model.md §3).
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

  // Commission
  readonly commissionVatRate: number; // default 20
  readonly commissionRateIncludesVat: boolean; // default false — APIs return ex-VAT
  readonly commissionVatDeductible: boolean; // default false — VAT is a real cost
  readonly commissionBase: 'gross' | 'net'; // default 'gross'
  readonly defaultCommissionRate: number; // fallback when the API omits it

  // Cargo — bands are tried in array order, first match wins
  readonly cargoBands: readonly CargoBand[];
  readonly cargoAmountsIncludeVat: boolean; // default true
  readonly cargoVatRate: number; // default 20
  readonly cargoVatDeductible: boolean; // default false

  // Other expenditure (marketing / service fees) — bands tried in array order, first match wins
  readonly expenditureBands: readonly ExpenditureBand[];
  readonly expenditureIncludesVat: boolean; // default true
  readonly expenditureVatRate: number; // default 20
  readonly expenditureVatDeductible: boolean; // default false
}

/** Effective commission rate `c_eff`, as a percentage (doc 02 §3.1). */
export function effectiveCommissionRate(
  apiCommissionRate: number,
  fees: Pick<FeeSettings, 'commissionVatRate' | 'commissionRateIncludesVat' | 'commissionVatDeductible'>,
): number {
  const grossRate = fees.commissionRateIncludesVat
    ? apiCommissionRate
    : apiCommissionRate * (1 + fees.commissionVatRate / 100);
  return fees.commissionVatDeductible ? apiCommissionRate : grossRate;
}

/** doc 02 §3.2 `normalise`, kept as a `Fraction` — the caller rounds once, at the end. */
export function normaliseAmount(
  amount: Money,
  includesVat: boolean,
  vatRatePercent: number,
  deductible: boolean,
): Fraction {
  const vatFactor = Fraction.add(Fraction.one, Fraction.fromPercent(vatRatePercent));
  const amountF = Fraction.fromMoney(amount);
  const withVat = includesVat ? amountF : Fraction.mul(amountF, vatFactor);
  return deductible ? Fraction.div(withVat, vatFactor) : withVat;
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
  const band = fees.cargoBands[index] as CargoBand;
  return normaliseAmount(
    band.amount,
    fees.cargoAmountsIncludeVat,
    fees.cargoVatRate,
    fees.cargoVatDeductible,
  );
}

export function normalisedExpenditure(customerPrice: Money, fees: FeeSettings): Fraction {
  const index = selectExpenditureBandIndex(customerPrice, fees.expenditureBands);
  if (index === -1) return Fraction.zero;
  const band = fees.expenditureBands[index] as ExpenditureBand;
  return normaliseAmount(
    band.amount,
    fees.expenditureIncludesVat,
    fees.expenditureVatRate,
    fees.expenditureVatDeductible,
  );
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
  const band = fees.cargoBands[index] as CargoBand;
  return normaliseAmount(
    band.amount,
    fees.cargoAmountsIncludeVat,
    fees.cargoVatRate,
    fees.cargoVatDeductible,
  );
}

export function normalisedExpenditureFraction(customerPrice: Fraction, fees: FeeSettings): Fraction {
  const index = selectExpenditureBandIndexFraction(customerPrice, fees.expenditureBands);
  if (index === -1) return Fraction.zero;
  const band = fees.expenditureBands[index] as ExpenditureBand;
  return normaliseAmount(
    band.amount,
    fees.expenditureIncludesVat,
    fees.expenditureVatRate,
    fees.expenditureVatDeductible,
  );
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
