import { newId } from '@buybox/db';
import type { configRepo } from '@buybox/db';
import { Money } from '@buybox/shared';

interface FeesPayload {
  marketplaceCode: string;
  commissionVatRate: number;
  commissionRateIncludesVat: boolean;
  commissionVatDeductible: boolean;
  commissionBase: 'gross' | 'net';
  defaultCommissionRate: number;
  cargoBands: { maxPrice: string | null; amount: string }[];
  cargoAmountsIncludeVat: boolean;
  cargoVatRate: number;
  cargoVatDeductible: boolean;
  expenditureBands: { minPrice: string; amount: string }[];
  expenditureIncludesVat: boolean;
  expenditureVatRate: number;
  expenditureVatDeductible: boolean;
}

/**
 * `FeeSettingsRow.cargoBands`/`expenditureBands` are stored JSON where each amount is
 * `Money.toJSON()` — the exact kuruş integer as a string (see `packages/shared`'s `Money`) —
 * not a decimal string, even though the column doc comment says "decimal strings" (that
 * comment is stale; `packages/jobs`' `mapFeeSettings` has always read it via `Money.fromJSON`,
 * which requires the integer form). The wizard's form collects operator-friendly decimal major
 * units ("11.00"); this is the one place that converts them to the stored representation.
 */
function toStoredAmount(decimal: string): string {
  return Money.fromMajorUnitsString(decimal || '0').toJSON();
}

/** Shared by the fees preview and save routes so both build the exact same row shape. */
export function feesPayloadToRow(
  raw: unknown,
  marketplaceCodeFallback: string,
  effectiveFrom: number,
): configRepo.FeeSettingsRow {
  const payload = raw as FeesPayload;
  return {
    id: newId(),
    marketplaceCode: payload.marketplaceCode || marketplaceCodeFallback,
    effectiveFrom,
    commissionVatRate: payload.commissionVatRate,
    commissionRateIncludesVat: payload.commissionRateIncludesVat,
    commissionVatDeductible: payload.commissionVatDeductible,
    commissionBase: payload.commissionBase,
    defaultCommissionRate: payload.defaultCommissionRate,
    cargoBands: JSON.stringify(
      payload.cargoBands.map((b) => ({
        maxPrice: b.maxPrice ? toStoredAmount(b.maxPrice) : null,
        amount: toStoredAmount(b.amount),
      })),
    ),
    cargoAmountsIncludeVat: payload.cargoAmountsIncludeVat,
    cargoVatRate: payload.cargoVatRate,
    cargoVatDeductible: payload.cargoVatDeductible,
    expenditureBands: JSON.stringify(
      payload.expenditureBands.map((b) => ({
        minPrice: toStoredAmount(b.minPrice),
        amount: toStoredAmount(b.amount),
      })),
    ),
    expenditureIncludesVat: payload.expenditureIncludesVat,
    expenditureVatRate: payload.expenditureVatRate,
    expenditureVatDeductible: payload.expenditureVatDeductible,
  };
}
