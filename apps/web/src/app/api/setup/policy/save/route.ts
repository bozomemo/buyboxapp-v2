import { NextResponse } from 'next/server';
import { configRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';

interface PolicyPayload {
  code: string;
  coarseStepMode: 'absolute' | 'percent';
  coarseStepPercent: string;
  refineTolerance: string;
  seekStrategy: 'direct' | 'stepped';
  undercutBy: string;
  seekStep: string;
  soleSellerMarginPct: string;
  lowStockGuardEnabled: boolean;
  lowStockThreshold: string;
  lowStockMarginPct: string;
  stockMode: 'respectStock' | 'ignoreStock';
  minPhysicalStock: string;
  settleDurationMinutes: string;
  competitorPriceDelta: string;
  pollIntervalMinutes: string;
  concurrency: string;
  budgetReservePct: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as PolicyPayload;
  const appDb = getAppDb();

  await configRepo.upsertRepricingPolicy(appDb, {
    marketplaceCode: body.code,
    coarseStepMode: body.coarseStepMode,
    coarseStepAbsolute: body.coarseStepMode === 'absolute' ? Money.fromMajorUnitsString('0').toKurus() : null,
    coarseStepPercent: body.coarseStepMode === 'percent' ? Number(body.coarseStepPercent) : null,
    refineTolerance: Money.fromMajorUnitsString(body.refineTolerance).toKurus(),
    seekStrategy: body.seekStrategy,
    undercutBy: Money.fromMajorUnitsString(body.undercutBy || '0.10').toKurus(),
    seekStep: Money.fromMajorUnitsString(body.seekStep || '1.00').toKurus(),
    soleSellerMarginPct: Number(body.soleSellerMarginPct),
    lowStockGuardEnabled: body.lowStockGuardEnabled,
    lowStockThreshold: Number(body.lowStockThreshold),
    lowStockMarginPct: Number(body.lowStockMarginPct),
    stockMode: body.stockMode,
    minPhysicalStock: Number(body.minPhysicalStock),
    requirePriceConfirmation: false,
    settleDurationMs: Number(body.settleDurationMinutes) * 60_000,
    competitorPriceDelta: Money.fromMajorUnitsString(body.competitorPriceDelta).toKurus(),
    useSellerIdentityTrigger: false,
    pollIntervalMs: Number(body.pollIntervalMinutes) * 60_000,
    concurrency: Number(body.concurrency),
    dailyUpdateAllowanceFormula: '',
    budgetReservePct: Number(body.budgetReservePct),
    // doc 10 §6 step 8 — everything starts DISABLED; the operator enables it deliberately later.
    enabled: false,
    updatedBy: 'setup-wizard',
    updatedAt: Date.now(),
  });

  return NextResponse.json({ ok: true });
}
