/**
 * "Preview impact" (doc 06 §9): "run the engine in shadow over the current catalogue and
 * report how many listings would change price and by how much, before saving." Unlike
 * `packages/jobs`' `Reprice` `mode: 'shadow'` (which persists `repricing_state` exactly as
 * live mode, just doesn't submit) this is a **pure read**, computing `decide()` against the
 * *candidate*, not-yet-saved fees/policy row for every real listing on the marketplace and
 * writing nothing at all — safe to call before the operator has decided to save.
 *
 * Mirrors `packages/jobs`' `reprice.ts` read path closely on purpose: `mapFeeSettings`/
 * `mapPolicy`/`preloadCostDeps` are the exact functions the real engine uses, so this preview
 * can never compute a different floor/decision than the engine would once saved.
 */
import { NextResponse } from 'next/server';
import {
  decide,
  effectiveCommissionRate,
  unitCost,
  type DecisionInput,
  type MarketplaceCode,
  type OptimumContext,
  type PendingSubmission,
  type RepricingState,
  type UpdateBudget,
} from '@buybox/core';
import { catalogRepo, competitionRepo, listingsRepo, repricingRepo } from '@buybox/db';
import { mapFeeSettings, mapPolicy, preloadCostDeps } from '@buybox/jobs';
import { Money } from '@buybox/shared';
import { withBrand } from '@/lib/product-name';
import { getAppDb } from '@/lib/server/db';
import { feesPayloadToRow } from '@/app/api/setup/fees/to-row';

async function loadState(appDb: ReturnType<typeof getAppDb>, listingId: string): Promise<RepricingState> {
  const row = await repricingRepo.getRepricingState(appDb, listingId);
  if (!row) {
    return {
      phase: 'SEEKING',
      lastGoodPrice: null,
      lastBadPrice: null,
      optimumPrice: null,
      optimumContext: null,
      pendingSubmission: null,
      settleUntil: null,
      consecutiveRejections: 0,
    };
  }
  let pendingSubmission: PendingSubmission | null = null;
  if (row.pendingSubmissionId) {
    const sub = await repricingRepo.getPriceSubmission(appDb, row.pendingSubmissionId);
    if (sub) {
      pendingSubmission = {
        submissionId: sub.id,
        submittedPrice: Money.fromKurus(sub.newPrice),
        submittedAt: new Date(sub.submittedAt ?? sub.decidedAt),
        confirmedAt: sub.confirmedAt !== null ? new Date(sub.confirmedAt) : null,
      };
    }
  }
  const optimumContext: OptimumContext | null =
    row.optimumCtxUnitCost !== null
      ? {
          unitCost: Money.fromKurus(row.optimumCtxUnitCost),
          commissionRate: row.optimumCtxCommissionRate ?? 0,
          vatRate: row.optimumCtxVatRate ?? 0,
          campaignRatio: row.optimumCtxCampaignRatio ?? 0,
          secondPrice: row.optimumCtxSecondPrice !== null ? Money.fromKurus(row.optimumCtxSecondPrice) : null,
          secondSellerId: row.optimumCtxSecondSellerRef,
        }
      : null;
  return {
    phase: row.phase,
    lastGoodPrice: row.lastGoodPrice !== null ? Money.fromKurus(row.lastGoodPrice) : null,
    lastBadPrice: row.lastBadPrice !== null ? Money.fromKurus(row.lastBadPrice) : null,
    optimumPrice: row.optimumPrice !== null ? Money.fromKurus(row.optimumPrice) : null,
    optimumContext,
    pendingSubmission,
    settleUntil: row.settleUntil !== null ? new Date(row.settleUntil) : null,
    consecutiveRejections: row.consecutiveRejections,
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as { fees?: unknown; policy?: unknown };
  const marketplaceCode = (body.fees as { marketplaceCode?: string } | undefined)?.marketplaceCode as
    MarketplaceCode | undefined;
  if (!marketplaceCode) {
    return NextResponse.json({ error: 'fees.marketplaceCode gerekli.' }, { status: 400 });
  }
  const appDb = getAppDb();
  const nowMs = Date.now();
  const now = new Date(nowMs);

  const feeRow = feesPayloadToRow(body.fees, marketplaceCode, nowMs);
  const fees = mapFeeSettings(feeRow);

  const policyPayload = body.policy as {
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
  };
  const policyRow = {
    marketplaceCode,
    coarseStepMode: policyPayload.coarseStepMode,
    coarseStepAbsolute:
      policyPayload.coarseStepMode === 'absolute' ? Money.fromMajorUnitsString('0').toKurus() : null,
    coarseStepPercent:
      policyPayload.coarseStepMode === 'percent' ? Number(policyPayload.coarseStepPercent) : null,
    refineTolerance: Money.fromMajorUnitsString(policyPayload.refineTolerance || '0').toKurus(),
    seekStrategy: policyPayload.seekStrategy,
    undercutBy: Money.fromMajorUnitsString(policyPayload.undercutBy || '0.10').toKurus(),
    seekStep: Money.fromMajorUnitsString(policyPayload.seekStep || '1.00').toKurus(),
    soleSellerMarginPct: Number(policyPayload.soleSellerMarginPct),
    lowStockGuardEnabled: policyPayload.lowStockGuardEnabled,
    lowStockThreshold: Number(policyPayload.lowStockThreshold),
    lowStockMarginPct: Number(policyPayload.lowStockMarginPct),
    stockMode: policyPayload.stockMode,
    minPhysicalStock: Number(policyPayload.minPhysicalStock),
    requirePriceConfirmation: false,
    settleDurationMs: Number(policyPayload.settleDurationMinutes) * 60_000,
    competitorPriceDelta: Money.fromMajorUnitsString(policyPayload.competitorPriceDelta || '0').toKurus(),
    useSellerIdentityTrigger: false,
    pollIntervalMs: Number(policyPayload.pollIntervalMinutes) * 60_000,
    concurrency: Number(policyPayload.concurrency),
    dailyUpdateAllowanceFormula: '',
    budgetReservePct: Number(policyPayload.budgetReservePct),
    enabled: true,
    updatedBy: 'preview',
    updatedAt: nowMs,
  };
  const policy = mapPolicy(policyRow);

  const candidates = await listingsRepo.listRepriceableListings(appDb, marketplaceCode);
  // No live budget consumption to preview against — an unlimited placeholder budget so the
  // preview reflects the pricing decision itself, not today's already-spent quota.
  const budget: UpdateBudget = { dailyAllowance: Number.MAX_SAFE_INTEGER, consumedToday: 0, reservePct: 0 };

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let totalDeltaKurus = 0n;
  const sample: {
    listingId: string;
    productName: string;
    oldPrice: string;
    newPrice: string;
    reason: string;
  }[] = [];

  for (const listing of candidates) {
    if (listing.baseStockCode === null || listing.commissionRate === null || listing.vatRate === null) {
      skipped += 1;
      continue;
    }
    const deps = await preloadCostDeps(appDb, listing.sellerStockCode, marketplaceCode);
    const cost = unitCost(listing.sellerStockCode, marketplaceCode, deps);
    const campaignRow = await listingsRepo.latestListingCampaign(appDb, listing.id);
    const campaignFinal = campaignRow
      ? { finalPrice: Money.fromKurus(campaignRow.finalPrice), storeSharePct: campaignRow.storeSharePct }
      : null;
    const observationRow = await competitionRepo.latestBuyboxObservation(appDb, listing.id);
    const observation = observationRow
      ? {
          rank: observationRow.rank,
          buyboxPrice:
            observationRow.buyboxPrice !== null ? Money.fromKurus(observationRow.buyboxPrice) : null,
          secondPrice:
            observationRow.secondPrice !== null ? Money.fromKurus(observationRow.secondPrice) : null,
          thirdPrice: observationRow.thirdPrice !== null ? Money.fromKurus(observationRow.thirdPrice) : null,
          hasMultipleSeller: observationRow.hasMultipleSeller,
          secondSellerId: null,
          competitorStock: null,
          observedAt: new Date(observationRow.observedAt),
        }
      : {
          rank: null,
          buyboxPrice: null,
          secondPrice: null,
          thirdPrice: null,
          hasMultipleSeller: false,
          secondSellerId: null,
          competitorStock: null,
          observedAt: new Date(0),
        };
    const state = await loadState(appDb, listing.id);

    const input: DecisionInput = {
      listing: {
        currentPrice: Money.fromKurus(listing.price),
        physicalStock: listing.offeredStock,
        commissionRate: effectiveCommissionRate(listing.commissionRate, fees),
        vatRate: listing.vatRate,
        locked: listing.isLocked,
        suspended: listing.isSuspended,
        salable: listing.isSalable,
        archived: listing.isArchived,
        campaign: campaignFinal,
        overrides: {
          minPrice: listing.minPrice !== null ? Money.fromKurus(listing.minPrice) : undefined,
          maxPrice: listing.maxPrice !== null ? Money.fromKurus(listing.maxPrice) : undefined,
          allowIncrease: listing.allowIncrease,
          allowDecrease: listing.allowDecrease,
          enabled: listing.repriceEnabled,
        },
      },
      observation,
      state,
      cost,
      fees,
      policy,
      budget,
      now,
    };

    const decision = decide(input);
    if (decision.action === 'submit' && decision.newPrice) {
      changed += 1;
      const delta = decision.newPrice.toKurus() - listing.price;
      totalDeltaKurus += delta;
      if (sample.length < 20) {
        sample.push({
          listingId: listing.id,
          productName: listing.productName,
          oldPrice: listing.price.toString(),
          newPrice: decision.newPrice.toKurus().toString(),
          reason: decision.reason,
        });
      }
    } else {
      unchanged += 1;
    }
  }

  // Only the 20 sampled rows are named on screen, so only those need a brand lookup.
  const sampleBrands = await catalogRepo.brandNamesByListingIds(
    appDb,
    sample.map((s) => s.listingId),
  );

  return NextResponse.json({
    totalListings: candidates.length,
    changed,
    unchanged,
    skipped,
    averageDeltaKurus: changed > 0 ? Number(totalDeltaKurus / BigInt(changed)) : 0,
    // `Marka - Ürün Adı` (customer feedback 2026-08-25) — see `withBrand`.
    sample: sample.map((s) => ({
      ...s,
      productName: withBrand(s.productName, sampleBrands.get(s.listingId)),
    })),
  });
}
