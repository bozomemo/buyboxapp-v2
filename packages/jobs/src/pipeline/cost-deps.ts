/**
 * Builds `CostCalculatorDeps` (doc 02 §4) for one stock code by walking exactly the codes
 * `unitCost`'s own recursion will touch — a direct code, or a bundle and its (possibly
 * nested, up to doc 02's depth limit) members — and pre-fetching each into an in-memory
 * lookup. `packages/core` stays pure; this is the I/O `unitCost` itself cannot do.
 */
import { parseStockCode, type CostCalculatorDeps, type MarketplaceCode } from '@buybox/core';
import { stockRepo, type AppDatabase } from '@buybox/db';
import { Money } from '@buybox/shared';

const MAX_WALK_DEPTH = 6; // one more than core's MAX_BUNDLE_DEPTH — lets unitCost itself report the cycle/depth error

export async function preloadCostDeps(
  appDb: AppDatabase,
  sellerStockCode: string,
  marketplaceCode: MarketplaceCode,
): Promise<CostCalculatorDeps> {
  const unitCostByBase = new Map<string, Money>();
  const bundleMembersByCode = new Map<string, readonly { memberStockCode: string; quantity: number }[]>();
  const multiplierByBase = new Map<string, number>();
  const visited = new Set<string>();

  async function walk(code: string, depth: number): Promise<void> {
    if (visited.has(code) || depth > MAX_WALK_DEPTH) return;
    visited.add(code);
    const parsed = parseStockCode(code);
    if (!parsed.ok) return; // unparseable — unitCost will surface its own typed error

    if (parsed.value.isBundle) {
      const members = await stockRepo.getBundleMembers(appDb, parsed.value.raw);
      bundleMembersByCode.set(parsed.value.raw, members);
      for (const member of members) {
        await walk(member.memberStockCode, depth + 1);
      }
      return;
    }

    const baseCode = parsed.value.baseCode;
    if (!unitCostByBase.has(baseCode)) {
      const item = await stockRepo.getStockItem(appDb, baseCode);
      if (item) unitCostByBase.set(baseCode, Money.fromKurus(item.unitCost));
    }
    if (!multiplierByBase.has(baseCode)) {
      const prefs = await stockRepo.getStockMarketplacePrefs(appDb, baseCode, marketplaceCode);
      multiplierByBase.set(baseCode, prefs?.priceMultiplier ?? 1);
    }
  }

  await walk(sellerStockCode, 0);

  return {
    getUnitCost: (baseCode) => unitCostByBase.get(baseCode),
    getBundleMembers: (bundleStockCode) => bundleMembersByCode.get(bundleStockCode),
    getPriceMultiplier: (baseCode) => multiplierByBase.get(baseCode) ?? 1,
  };
}
