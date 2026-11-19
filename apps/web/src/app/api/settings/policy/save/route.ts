/**
 * Settings > Policy save (doc 06 §9), audited. Unlike the setup wizard's policy step (which
 * always force-saves `enabled: false` — doc 10 §6 step 8: automation starts off deliberately),
 * this route honours the operator's `enabled` toggle, since flipping automation on/off here
 * *is* the deliberate act doc 10 §6 describes.
 */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { Money } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';
import { parseCoarseStep } from '@/lib/policy-coarse-step';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';
import { toWireDecimal } from '@/lib/operator-money';
import { refuseUnreadableAmounts } from '@/lib/server/refuse-unreadable-amounts';

interface PolicyPayload {
  code: string;
  coarseStepMode: 'absolute' | 'percent';
  coarseStepPercent: string;
  coarseStepAbsolute?: string;
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
  enabled: boolean;
}

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const body = await readJsonBody<PolicyPayload>(request);
  if (body === null) return invalidBody();
  if (!body.code) return NextResponse.json({ error: 'code gerekli.' }, { status: 400 });
  const coarseStep = parseCoarseStep(body.coarseStepMode, body.coarseStepPercent, body.coarseStepAbsolute);
  if (!coarseStep.ok) return NextResponse.json({ error: coarseStep.error }, { status: 400 });
  const appDb = getAppDb();
  const nowMs = Date.now();
  const previous = await configRepo.getRepricingPolicy(appDb, body.code);

  const row = {
    marketplaceCode: body.code,
    coarseStepMode: body.coarseStepMode,
    coarseStepAbsolute: coarseStep.absolute,
    coarseStepPercent: coarseStep.percent,
    refineTolerance: Money.fromMajorUnitsString(toWireDecimal(body.refineTolerance)).toKurus(),
    seekStrategy: body.seekStrategy,
    undercutBy: Money.fromMajorUnitsString(toWireDecimal(body.undercutBy || '0.10')).toKurus(),
    seekStep: Money.fromMajorUnitsString(toWireDecimal(body.seekStep || '1.00')).toKurus(),
    soleSellerMarginPct: Number(body.soleSellerMarginPct),
    lowStockGuardEnabled: body.lowStockGuardEnabled,
    lowStockThreshold: Number(body.lowStockThreshold),
    lowStockMarginPct: Number(body.lowStockMarginPct),
    stockMode: body.stockMode,
    minPhysicalStock: Number(body.minPhysicalStock),
    requirePriceConfirmation: previous?.requirePriceConfirmation ?? false,
    settleDurationMs: Number(body.settleDurationMinutes) * 60_000,
    competitorPriceDelta: Money.fromMajorUnitsString(toWireDecimal(body.competitorPriceDelta)).toKurus(),
    useSellerIdentityTrigger: previous?.useSellerIdentityTrigger ?? false,
    pollIntervalMs: Number(body.pollIntervalMinutes) * 60_000,
    concurrency: Number(body.concurrency),
    dailyUpdateAllowanceFormula: previous?.dailyUpdateAllowanceFormula ?? '',
    budgetReservePct: Number(body.budgetReservePct),
    enabled: body.enabled,
    updatedBy: auth.actor,
    updatedAt: nowMs,
  };
  await configRepo.upsertRepricingPolicy(appDb, row);

  await configRepo.recordSettingsAudit(appDb, {
    id: newId(),
    entity: 'repricing_policies',
    entityId: body.code,
    field: 'all',
    oldValue: previous
      ? JSON.stringify(previous, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      : null,
    newValue: JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
    changedBy: auth.actor,
    changedAt: nowMs,
  });

  return NextResponse.json({ ok: true });
}

export const POST = withPermission('settings.manage', refuseUnreadableAmounts(postHandler));
