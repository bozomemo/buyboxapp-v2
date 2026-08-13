/** Settings > Policy (doc 06 §9): current repricing policy for one marketplace, as editable strings. */
import { NextResponse } from 'next/server';
import { configRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

function kurusToDecimalString(kurus: bigint): string {
  const negative = kurus < 0n;
  const abs = negative ? -kurus : kurus;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const marketplaceCode = url.searchParams.get('marketplaceCode');
  if (!marketplaceCode) return NextResponse.json({ error: 'marketplaceCode gerekli.' }, { status: 400 });
  const appDb = getAppDb();
  const policy = await configRepo.getRepricingPolicy(appDb, marketplaceCode);
  if (!policy) return NextResponse.json({ current: null });

  return NextResponse.json({
    current: {
      coarseStepMode: policy.coarseStepMode,
      coarseStepPercent: String(policy.coarseStepPercent ?? 5),
      refineTolerance: kurusToDecimalString(policy.refineTolerance),
      seekStrategy: policy.seekStrategy,
      undercutBy: kurusToDecimalString(policy.undercutBy),
      seekStep: kurusToDecimalString(policy.seekStep),
      soleSellerMarginPct: String(policy.soleSellerMarginPct),
      lowStockGuardEnabled: policy.lowStockGuardEnabled,
      lowStockThreshold: String(policy.lowStockThreshold),
      lowStockMarginPct: String(policy.lowStockMarginPct),
      stockMode: policy.stockMode,
      minPhysicalStock: String(policy.minPhysicalStock),
      settleDurationMinutes: String(policy.settleDurationMs / 60_000),
      competitorPriceDelta: kurusToDecimalString(policy.competitorPriceDelta),
      pollIntervalMinutes: String(policy.pollIntervalMs / 60_000),
      concurrency: String(policy.concurrency),
      budgetReservePct: String(policy.budgetReservePct),
      enabled: policy.enabled,
    },
  });
}
