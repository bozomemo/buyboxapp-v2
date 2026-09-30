import { newId } from '@buybox/db';
import type { configRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { z } from 'zod';

/**
 * The form's payload, checked before a row is built (2026-09-27). It used to be cast and read
 * field by field, so a body missing `cargoBands` threw a TypeError into a 500, and one missing a
 * rate stored `undefined` — into the settings the floor price is computed from. A refused
 * request is the right outcome for both.
 */
const VatRate = z.number().int().min(0).max(100);
const FeesPayloadSchema = z.object({
  marketplaceCode: z.string().optional(),
  commissionVatRate: VatRate,
  commissionRateIncludesVat: z.boolean(),
  commissionVatDeductible: z.boolean(),
  commissionBase: z.enum(['gross', 'net']),
  defaultCommissionRate: z.number().min(0).max(100),
  cargoBands: z.array(z.object({ maxPrice: z.string().nullable(), amount: z.string() })),
  cargoAmountsIncludeVat: z.boolean(),
  cargoVatRate: VatRate,
  cargoVatDeductible: z.boolean(),
  expenditureBands: z.array(z.object({ minPrice: z.string(), amount: z.string() })),
  expenditureIncludesVat: z.boolean(),
  expenditureVatRate: VatRate,
  expenditureVatDeductible: z.boolean(),
});

/** A payload the fee form would never send. Routes answer it with a 400 naming the field. */
export class FeesPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeesPayloadError';
  }
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
  try {
    return Money.fromMajorUnitsString(decimal || '0').toJSON();
  } catch {
    throw new FeesPayloadError(`Geçersiz tutar: "${decimal}". Örnek: 49,90`);
  }
}

/** Shared by the fees preview and save routes so both build the exact same row shape. */
export function feesPayloadToRow(
  raw: unknown,
  marketplaceCodeFallback: string,
  effectiveFrom: number,
): configRepo.FeeSettingsRow {
  const parsed = FeesPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new FeesPayloadError(`Ücret ayarları eksik veya hatalı: ${issue?.path.join('.') || 'gövde'} — ${issue?.message ?? ''}`);
  }
  const payload = parsed.data;
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
