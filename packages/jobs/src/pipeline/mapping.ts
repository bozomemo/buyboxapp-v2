/**
 * DB row ↔ `packages/core` type conversions for the repricing pipeline. Kept in one place
 * so every job that needs `FeeSettings`/`RepricingPolicy` builds them the same way.
 */
import type { CargoBand, ExpenditureBand, FeeSettings, RepricingPolicy } from '@buybox/core';
import type { configRepo } from '@buybox/db';
import { Duration, Money } from '@buybox/shared';

interface SerialisedBand {
  readonly maxPrice?: string | null;
  readonly minPrice?: string;
  readonly amount: string;
}

export function mapFeeSettings(row: configRepo.FeeSettingsRow): FeeSettings {
  const cargoBands: CargoBand[] = (JSON.parse(row.cargoBands) as SerialisedBand[]).map((b) => ({
    maxPrice: b.maxPrice ? Money.fromJSON(b.maxPrice) : null,
    amount: Money.fromJSON(b.amount),
  }));
  const expenditureBands: ExpenditureBand[] = (JSON.parse(row.expenditureBands) as SerialisedBand[]).map(
    (b) => ({
      minPrice: Money.fromJSON(b.minPrice ?? '0'),
      amount: Money.fromJSON(b.amount),
    }),
  );

  return {
    effectiveFrom: new Date(row.effectiveFrom),
    commissionVatRate: row.commissionVatRate,
    commissionRateIncludesVat: row.commissionRateIncludesVat,
    commissionVatDeductible: row.commissionVatDeductible,
    commissionBase: row.commissionBase,
    defaultCommissionRate: row.defaultCommissionRate,
    cargoBands,
    cargoAmountsIncludeVat: row.cargoAmountsIncludeVat,
    cargoVatRate: row.cargoVatRate,
    cargoVatDeductible: row.cargoVatDeductible,
    expenditureBands,
    expenditureIncludesVat: row.expenditureIncludesVat,
    expenditureVatRate: row.expenditureVatRate,
    expenditureVatDeductible: row.expenditureVatDeductible,
  };
}

export function mapPolicy(row: configRepo.RepricingPolicyRow): RepricingPolicy {
  const coarseStep: bigint | number =
    row.coarseStepMode === 'absolute' ? (row.coarseStepAbsolute ?? 0n) : (row.coarseStepPercent ?? 0);

  return {
    enabled: row.enabled,
    coarseStepMode: row.coarseStepMode,
    coarseStep,
    refineTolerance: row.refineTolerance,
    seekStrategy: row.seekStrategy,
    undercutBy: row.undercutBy,
    seekStep: row.seekStep,
    soleSellerMarginPct: row.soleSellerMarginPct,
    lowStockGuardEnabled: row.lowStockGuardEnabled,
    lowStockThreshold: row.lowStockThreshold,
    lowStockMarginPct: row.lowStockMarginPct,
    stockMode: row.stockMode,
    minPhysicalStock: row.minPhysicalStock,
    requirePriceConfirmation: row.requirePriceConfirmation,
    settleDuration: Duration.millis(row.settleDurationMs),
    competitorPriceDelta: row.competitorPriceDelta,
    useSellerIdentityTrigger: row.useSellerIdentityTrigger,
    pollInterval: Duration.millis(row.pollIntervalMs),
    concurrency: row.concurrency,
  };
}
