/**
 * RepricingPolicy — docs/03-repricing-engines.md §3.
 */
import { Duration, type Money, err, ok, type Result } from '@buybox/shared';

export interface RepricingPolicy {
  readonly enabled: boolean;

  // Climbing
  readonly coarseStepMode: 'absolute' | 'percent';
  readonly coarseStep: bigint | number; // kuruş if absolute, percent if 'percent'
  readonly refineTolerance: bigint; // kuruş

  // Seeking
  readonly seekStrategy: 'direct' | 'stepped';
  readonly undercutBy: bigint; // kuruş
  readonly seekStep: bigint; // kuruş, only used when seekStrategy = 'stepped'

  // Sole seller
  readonly soleSellerMarginPct: number;

  // Competitor low-stock guard
  readonly lowStockGuardEnabled: boolean;
  readonly lowStockThreshold: number;
  readonly lowStockMarginPct: number;

  // Stock policy
  readonly stockMode: 'respectStock' | 'ignoreStock';
  readonly minPhysicalStock: number;

  // Settle
  readonly requirePriceConfirmation: boolean;
  readonly settleDuration: Duration;

  // Invalidation sensitivity
  readonly competitorPriceDelta: bigint; // kuruş
  readonly useSellerIdentityTrigger: boolean;

  // Scheduling
  readonly pollInterval: Duration;
  readonly concurrency: number;
}

/** Per-listing overrides (doc 03 §3): hard bounds the engine may never cross. */
export interface ListingPriceOverrides {
  readonly minPrice?: Money;
  readonly maxPrice?: Money;
  readonly allowIncrease?: boolean;
  readonly allowDecrease?: boolean;
  readonly enabled?: boolean;
}

export interface PolicyValidationError {
  readonly field: string;
  readonly message: string;
}

function checkNonNegativeBigint(value: bigint, field: string, errors: PolicyValidationError[]): void {
  if (value < 0n) errors.push({ field, message: `must be >= 0, got ${value}` });
}

function checkNonNegativeNumber(value: number, field: string, errors: PolicyValidationError[]): void {
  if (!Number.isFinite(value) || value < 0)
    errors.push({ field, message: `must be a finite number >= 0, got ${value}` });
}

export function validatePolicy(policy: RepricingPolicy): Result<RepricingPolicy, PolicyValidationError[]> {
  const errors: PolicyValidationError[] = [];

  if (policy.coarseStepMode === 'absolute') {
    if (typeof policy.coarseStep !== 'bigint' || policy.coarseStep <= 0n) {
      errors.push({
        field: 'coarseStep',
        message: 'must be a positive bigint when coarseStepMode is absolute',
      });
    }
  } else {
    if (
      typeof policy.coarseStep !== 'number' ||
      !Number.isFinite(policy.coarseStep) ||
      policy.coarseStep <= 0
    ) {
      errors.push({
        field: 'coarseStep',
        message: 'must be a positive number when coarseStepMode is percent',
      });
    }
  }
  checkNonNegativeBigint(policy.refineTolerance, 'refineTolerance', errors);
  checkNonNegativeBigint(policy.undercutBy, 'undercutBy', errors);
  if (policy.seekStrategy === 'stepped') {
    if (policy.seekStep <= 0n)
      errors.push({ field: 'seekStep', message: 'must be positive when seekStrategy is stepped' });
  }
  checkNonNegativeNumber(policy.soleSellerMarginPct, 'soleSellerMarginPct', errors);
  if (policy.lowStockGuardEnabled) {
    checkNonNegativeNumber(policy.lowStockThreshold, 'lowStockThreshold', errors);
    checkNonNegativeNumber(policy.lowStockMarginPct, 'lowStockMarginPct', errors);
  }
  if (policy.stockMode === 'respectStock') {
    checkNonNegativeNumber(policy.minPhysicalStock, 'minPhysicalStock', errors);
  }
  checkNonNegativeBigint(policy.competitorPriceDelta, 'competitorPriceDelta', errors);
  if (Duration.toMillis(policy.pollInterval) <= 0) {
    errors.push({ field: 'pollInterval', message: 'must be positive' });
  }
  if (!Number.isInteger(policy.concurrency) || policy.concurrency < 1) {
    errors.push({ field: 'concurrency', message: 'must be an integer >= 1' });
  }

  return errors.length === 0 ? ok(policy) : err(errors);
}

export function validateListingOverrides(
  overrides: ListingPriceOverrides,
): Result<ListingPriceOverrides, PolicyValidationError[]> {
  const errors: PolicyValidationError[] = [];
  if (overrides.minPrice && overrides.maxPrice && overrides.minPrice.compareTo(overrides.maxPrice) > 0) {
    errors.push({ field: 'minPrice', message: 'minPrice must not exceed maxPrice' });
  }
  return errors.length === 0 ? ok(overrides) : err(errors);
}
