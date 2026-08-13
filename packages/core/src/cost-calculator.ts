/**
 * CostCalculator.unitCost — docs/02-cost-and-price-model.md §4.
 *
 * Pure: all data (stock items, bundle members, price multipliers) is supplied through
 * `CostCalculatorDeps` lookup functions rather than fetched here. `packages/core` has no
 * I/O, so the caller (a `packages/db` repository, in later phases) is responsible for
 * loading whatever these lookups need.
 */
import { Money, err, ok, type Result } from '@buybox/shared';
import type { CostError } from './errors.js';
import type { MarketplaceCode } from './marketplace.js';
import { parseStockCode, type StockCode } from './stock-code.js';

export interface BundleMember {
  readonly memberStockCode: string;
  readonly quantity: number;
}

export interface CostCalculatorDeps {
  /** Purchase cost of one physical unit of the base stock code, VAT-exclusive. */
  getUnitCost(baseCode: string): Money | undefined;
  /** Bundle members for a full bundle stock code (e.g. "12345-k2"). `undefined` = not defined. */
  getBundleMembers(bundleStockCode: string): readonly BundleMember[] | undefined;
  /** Per-base-code, per-marketplace cost multiplier; defaults to 1 when unset upstream. */
  getPriceMultiplier(baseCode: string, marketplace: MarketplaceCode): number;
}

const MAX_BUNDLE_DEPTH = 5;

/** `unitCost` with `multiplier` forced to 1 — the multiplier-free cost, per doc 02 §4. */
export function originalUnitCost(
  stockCode: string,
  marketplace: MarketplaceCode,
  deps: CostCalculatorDeps,
): Result<Money, CostError> {
  return computeUnitCost(stockCode, marketplace, { ...deps, getPriceMultiplier: () => 1 }, deps, []);
}

export function unitCost(
  stockCode: string,
  marketplace: MarketplaceCode,
  deps: CostCalculatorDeps,
): Result<Money, CostError> {
  return computeUnitCost(stockCode, marketplace, deps, deps, []);
}

function computeUnitCost(
  stockCode: string,
  marketplace: MarketplaceCode,
  multiplierDeps: CostCalculatorDeps,
  baseDeps: CostCalculatorDeps,
  bundleChain: readonly string[],
): Result<Money, CostError> {
  const parsed = parseStockCode(stockCode);
  if (!parsed.ok) {
    return err(parsed.error);
  }
  const code: StockCode = parsed.value;

  if (code.isBundle) {
    if (bundleChain.includes(code.raw)) {
      return err({ type: 'BundleCycle', stockCode: code.raw });
    }
    if (bundleChain.length >= MAX_BUNDLE_DEPTH) {
      return err({ type: 'MaxRecursionDepthExceeded', stockCode: code.raw });
    }
    const members = baseDeps.getBundleMembers(code.raw);
    if (members === undefined || members.length === 0) {
      return err({ type: 'BundleNotDefined', bundleStockCode: code.raw });
    }
    let total = Money.zero;
    for (const member of members) {
      const memberCost = computeUnitCost(member.memberStockCode, marketplace, multiplierDeps, baseDeps, [
        ...bundleChain,
        code.raw,
      ]);
      if (!memberCost.ok) {
        // A cycle detected while resolving a member is a structural problem with this
        // bundle chain itself, not an "unresolvable member" — propagate it directly
        // rather than wrapping it (doc 01 §6: "a bundle that references itself, directly
        // or transitively, returns CostError.BundleCycle").
        if (memberCost.error.type === 'BundleCycle') {
          return err(memberCost.error);
        }
        return err({
          type: 'BundleMemberUnknown',
          bundleStockCode: code.raw,
          memberStockCode: member.memberStockCode,
          cause: memberCost.error,
        });
      }
      total = total.add(memberCost.value.multiplyByFraction(BigInt(member.quantity), 1n));
    }
    return ok(total);
  }

  const itemUnitCost = baseDeps.getUnitCost(code.baseCode);
  if (itemUnitCost === undefined) {
    return err({ type: 'StockItemNotFound', baseCode: code.baseCode });
  }
  const multiplier = multiplierDeps.getPriceMultiplier(code.baseCode, marketplace);
  return ok(scaleByNumber(itemUnitCost, code.unitCount * multiplier));
}

/**
 * Exact-in-practice scaling by a plain-number factor (unit count × price multiplier).
 * Both factors are configured/entered values with at most a handful of decimal digits,
 * so a fixed six-decimal-digit precision is exact for anything this system will see;
 * see the precision note in `fraction.ts`.
 */
function scaleByNumber(amount: Money, factor: number): Money {
  const SCALE = 1_000_000n;
  const scaledFactor = BigInt(Math.round(factor * Number(SCALE)));
  return amount.multiplyByFraction(scaledFactor, SCALE);
}
