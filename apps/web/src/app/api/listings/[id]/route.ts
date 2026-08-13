/**
 * Listing detail (doc 06 §5, doc 12 6.7): the four panels — Now, Competition, Engine,
 * History — in one payload. "Any current price is explainable without reading logs" (doc 12
 * 6.7 DoD) is why this returns the full cost waterfall and the engine's own explanation
 * alongside the raw numbers, not just the numbers.
 */
import { NextResponse } from 'next/server';
import {
  FractionOps,
  effectiveCommissionRate,
  floorPrice,
  normalisedCargo,
  normalisedExpenditure,
} from '@buybox/core';
import { competitionRepo, configRepo, listingsRepo, repricingRepo, stockRepo } from '@buybox/db';
import { mapFeeSettings } from '@buybox/jobs';
import { Money } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';

const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — the price chart's default span

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appDb = getAppDb();
  const nowMs = Date.now();

  const listing = await listingsRepo.getListing(appDb, id);
  if (!listing) return NextResponse.json({ error: 'İlan bulunamadı.' }, { status: 404 });

  const [stockItem, feeRow, repricingState, buybox, buyboxHistory, competitors, submissions] =
    await Promise.all([
      listing.baseStockCode ? stockRepo.getStockItem(appDb, listing.baseStockCode) : undefined,
      configRepo.getEffectiveFeeSettings(appDb, listing.marketplaceCode, nowMs),
      repricingRepo.getRepricingState(appDb, id),
      competitionRepo.latestBuyboxObservation(appDb, id),
      competitionRepo.buyboxObservationHistory(appDb, id, nowMs - HISTORY_WINDOW_MS),
      competitionRepo.observationsAsOf(appDb, id, nowMs),
      repricingRepo.listPriceSubmissionsForListing(appDb, id),
    ]);

  // Cost waterfall (doc 06 §5 "Now" panel): unit cost → cargo → commission → VAT → floor,
  // each step evaluated at the floor price itself (the bands and commission base are all
  // price-dependent), so what's shown is the exact decomposition that produced that floor —
  // not an approximation from the current selling price.
  let waterfall: {
    unitCost: string;
    cargo: string;
    commission: string;
    vatRate: number;
    floorPrice: string;
  } | null = null;
  if (stockItem && feeRow) {
    const fees = mapFeeSettings(feeRow);
    const vatRate = listing.vatRate ?? 20;
    const commissionRate = effectiveCommissionRate(
      listing.commissionRate ?? feeRow.defaultCommissionRate,
      fees,
    );
    const result = floorPrice({
      unitCost: Money.fromKurus(stockItem.unitCost),
      vatRate,
      effectiveCommissionRate: commissionRate,
      campaign: null,
      fees,
    });
    if (result.ok) {
      const floor = result.value;
      // Mirrors `netProceeds`'s own commission-base logic (doc 02 §5.1) exactly, via the same
      // `Fraction` arithmetic, rounding to `Money` only at the end (doc 02 §1) — so this
      // waterfall can never disagree with the floor price it is decomposing.
      const floorF = FractionOps.fromMoney(floor);
      const vatFactor = FractionOps.add(FractionOps.one, FractionOps.fromPercent(vatRate));
      const commissionBaseF = fees.commissionBase === 'gross' ? floorF : FractionOps.div(floorF, vatFactor);
      const commissionF = FractionOps.mul(commissionBaseF, FractionOps.fromPercent(commissionRate));
      const cargo = FractionOps.toMoneyRoundHalfUp(normalisedCargo(floor, fees));
      const expenditure = FractionOps.toMoneyRoundHalfUp(normalisedExpenditure(floor, fees));
      const commission = FractionOps.toMoneyRoundHalfUp(commissionF);
      waterfall = {
        unitCost: stockItem.unitCost.toString(),
        cargo: (cargo.toKurus() + expenditure.toKurus()).toString(),
        commission: commission.toKurus().toString(),
        vatRate,
        floorPrice: floor.toKurus().toString(),
      };
    }
  }

  // "Why the last decision was what it was, in words" (doc 06 §5 Engine panel) — the most
  // recent price_submission already carries this explanation (doc 03's engine writes it at
  // decision time); reusing it here rather than re-deriving avoids the two ever disagreeing.
  const lastDecision = submissions[0] ?? null;

  return NextResponse.json({
    listing: {
      id: listing.id,
      marketplaceCode: listing.marketplaceCode,
      marketplaceListingId: listing.marketplaceListingId,
      sellerStockCode: listing.sellerStockCode,
      baseStockCode: listing.baseStockCode,
      productName: listing.productName,
      price: listing.price.toString(),
      listPrice: listing.listPrice?.toString() ?? null,
      customerPrice: listing.customerPrice?.toString() ?? null,
      offeredStock: listing.offeredStock,
      commissionRate: listing.commissionRate,
      vatRate: listing.vatRate,
      dispatchTime: listing.dispatchTime,
      isSalable: listing.isSalable,
      isLocked: listing.isLocked,
      isSuspended: listing.isSuspended,
      isFrozen: listing.isFrozen,
      isBlacklisted: listing.isBlacklisted,
      lockReasons: listing.lockReasons,
      deactivationReasons: listing.deactivationReasons,
      minPrice: listing.minPrice?.toString() ?? null,
      maxPrice: listing.maxPrice?.toString() ?? null,
      allowIncrease: listing.allowIncrease,
      allowDecrease: listing.allowDecrease,
      repriceEnabled: listing.repriceEnabled,
      firstSeenAt: listing.firstSeenAt,
      lastSeenAt: listing.lastSeenAt,
    },
    waterfall,
    competition: {
      buybox: buybox
        ? {
            observedAt: buybox.observedAt,
            rank: buybox.rank,
            buyboxPrice: buybox.buyboxPrice?.toString() ?? null,
            secondPrice: buybox.secondPrice?.toString() ?? null,
            thirdPrice: buybox.thirdPrice?.toString() ?? null,
            hasMultipleSeller: buybox.hasMultipleSeller,
          }
        : null,
      offers: competitors.map((c) => ({
        sellerName: c.sellerName,
        sellerRef: c.sellerRef,
        rank: c.rank,
        price: c.price?.toString() ?? null,
        finalPrice: c.finalPrice?.toString() ?? null,
        rating: c.rating,
        dispatchTime: c.dispatchTime,
        offeredStock: c.offeredStock,
        hasPromotion: c.hasPromotion,
      })),
      priceHistory: buyboxHistory.map((h) => ({
        observedAt: h.observedAt,
        buyboxPrice: h.buyboxPrice?.toString() ?? null,
        secondPrice: h.secondPrice?.toString() ?? null,
        rank: h.rank,
      })),
    },
    engine: repricingState
      ? {
          phase: repricingState.phase,
          lastGoodPrice: repricingState.lastGoodPrice?.toString() ?? null,
          lastBadPrice: repricingState.lastBadPrice?.toString() ?? null,
          optimumPrice: repricingState.optimumPrice?.toString() ?? null,
          optimumCtx: {
            unitCost: repricingState.optimumCtxUnitCost?.toString() ?? null,
            commissionRate: repricingState.optimumCtxCommissionRate,
            vatRate: repricingState.optimumCtxVatRate,
            campaignRatio: repricingState.optimumCtxCampaignRatio,
            secondPrice: repricingState.optimumCtxSecondPrice?.toString() ?? null,
            secondSellerRef: repricingState.optimumCtxSecondSellerRef,
          },
          settleUntil: repricingState.settleUntil,
          consecutiveRejections: repricingState.consecutiveRejections,
          updatedAt: repricingState.updatedAt,
        }
      : null,
    lastDecisionExplanation: lastDecision
      ? {
          reason: lastDecision.reason,
          explanation: lastDecision.explanation,
          decidedAt: lastDecision.decidedAt,
        }
      : null,
    history: submissions.map((s) => ({
      id: s.id,
      decidedAt: s.decidedAt,
      oldPrice: s.oldPrice.toString(),
      newPrice: s.newPrice.toString(),
      reason: s.reason,
      explanation: s.explanation,
      state: s.state,
      failureCode: s.failureCode,
      failureMessage: s.failureMessage,
      unitCost: s.unitCost?.toString() ?? null,
      floorPrice: s.floorPrice?.toString() ?? null,
      buyboxPrice: s.buyboxPrice?.toString() ?? null,
      secondPrice: s.secondPrice?.toString() ?? null,
      rank: s.rank,
      commissionRate: s.commissionRate,
      vatRate: s.vatRate,
    })),
  });
}
