/**
 * `Reprice` (doc 07 §1, §2) — wires `packages/core`'s pure `decide()` to the repositories:
 * loads cost/fees/state/budget for each eligible listing, persists the resulting state, and
 * enqueues a `price_submissions` row when the decision is `submit`. **No job writes a price
 * directly** — everything goes through the outbox (doc 07 §2).
 *
 * Supports `mode: 'shadow'` (doc 07 §10): decisions are computed and persisted exactly as in
 * live mode, but the submission row is written `state: 'cancelled'` with a `shadow` marker
 * (reusing `failureCode`/`failureMessage` — doc 05 has no dedicated shadow column) instead of
 * `queued`, so `SubmitPriceChanges` never drains it.
 */
import {
  decide,
  effectiveCommissionRate,
  floorPrice,
  unitCost,
  type CampaignRatio,
  type DecisionInput,
  type MarketplaceCode,
  type OptimumContext,
  type PendingSubmission,
  type RepricingState,
  type UpdateBudget,
} from '@buybox/core';
import {
  competitionRepo,
  configRepo,
  eventsRepo,
  listingsRepo,
  newId,
  repricingRepo,
  stockRepo,
} from '@buybox/db';
import { Money, err } from '@buybox/shared';
import { z } from 'zod';
import { getAdapter } from '../adapter-registry.js';
import type { JobContext, JobResult } from '../job.js';
import { preloadCostDeps } from './cost-deps.js';
import { mapFeeSettings, mapPolicy } from './mapping.js';

export const REPRICE_JOB = 'Reprice';

export const RepricePayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  mode: z.enum(['live', 'shadow']).default('live'),
});

export type RepricePayload = z.infer<typeof RepricePayloadSchema>;

function usageDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

async function loadState(
  appDb: Parameters<typeof repricingRepo.getRepricingState>[0],
  listingId: string,
): Promise<RepricingState> {
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

function campaignRatioAt(
  currentPrice: Money,
  campaign: { finalPrice: Money; storeSharePct: number } | null,
): CampaignRatio | null {
  if (!campaign || currentPrice.isZero()) return null;
  const ratio = Number(campaign.finalPrice.toKurus()) / Number(currentPrice.toKurus());
  return { ratio, storeSharePct: campaign.storeSharePct };
}

export async function reprice(ctx: JobContext): Promise<JobResult> {
  const payload = RepricePayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode: MarketplaceCode = payload.marketplaceCode;
  const nowMs = ctx.clock.nowMs();
  const now = new Date(nowMs);

  const feeRow = await configRepo.getEffectiveFeeSettings(ctx.appDb, marketplaceCode, nowMs);
  const policyRow = await configRepo.getRepricingPolicy(ctx.appDb, marketplaceCode);
  if (!feeRow || !policyRow) {
    return {
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: `no fee settings or repricing policy configured for ${marketplaceCode}`,
    };
  }
  const fees = mapFeeSettings(feeRow);
  const policy = mapPolicy(policyRow);

  const candidates = await listingsRepo.listRepriceableListings(ctx.appDb, marketplaceCode);
  const adapter = getAdapter(ctx.adapters, marketplaceCode);
  const dailyAllowance = adapter.capabilities.dailyUpdateAllowance(candidates.length);
  const usage = await repricingRepo.getBudgetUsage(ctx.appDb, marketplaceCode, usageDateKey(nowMs));

  let itemsOk = 0;
  let itemsFailed = 0;

  for (const listing of candidates) {
    try {
      if (listing.baseStockCode === null) {
        // doc 07 §2.1: unparseable seller SKU — excluded and reported, not silently skipped.
        await eventsRepo.logEvent(ctx.appDb, {
          id: newId(),
          at: nowMs,
          level: 'warn',
          marketplaceCode,
          listingId: listing.id,
          jobRunId: ctx.correlationId,
          code: 'RepriceSkippedUnparseableSku',
          message: `Listing ${listing.marketplaceListingId}: no baseStockCode, excluded from repricing`,
          context: null,
        });
        continue;
      }
      if (listing.commissionRate === null || listing.vatRate === null) {
        // Guessing a rate here risks an unsafely low floor price (CLAUDE.md: never below
        // floor) — skip rather than default to 0, and surface it as CostUnknown would be.
        await eventsRepo.logEvent(ctx.appDb, {
          id: newId(),
          at: nowMs,
          level: 'warn',
          marketplaceCode,
          listingId: listing.id,
          jobRunId: ctx.correlationId,
          code: 'RepriceSkippedMissingRates',
          message: `Listing ${listing.marketplaceListingId}: commissionRate or vatRate missing from the feed`,
          context: null,
        });
        continue;
      }

      const prefs = await stockRepo.getStockMarketplacePrefs(
        ctx.appDb,
        listing.baseStockCode,
        marketplaceCode,
      );
      const deps = await preloadCostDeps(ctx.appDb, listing.sellerStockCode, marketplaceCode);
      const cost = unitCost(listing.sellerStockCode, marketplaceCode, deps);

      const campaignRow = await listingsRepo.latestListingCampaign(ctx.appDb, listing.id);
      const campaignFinal = campaignRow
        ? { finalPrice: Money.fromKurus(campaignRow.finalPrice), storeSharePct: campaignRow.storeSharePct }
        : null;

      const observationRow = await competitionRepo.latestBuyboxObservation(ctx.appDb, listing.id);
      const observation = observationRow
        ? {
            rank: observationRow.rank,
            buyboxPrice:
              observationRow.buyboxPrice !== null ? Money.fromKurus(observationRow.buyboxPrice) : null,
            secondPrice:
              observationRow.secondPrice !== null ? Money.fromKurus(observationRow.secondPrice) : null,
            thirdPrice:
              observationRow.thirdPrice !== null ? Money.fromKurus(observationRow.thirdPrice) : null,
            hasMultipleSeller: observationRow.hasMultipleSeller,
            secondSellerId: null, // not on the control path (doc 10 §5.1) — identity is scrape-only
            competitorStock: null, // same — Trendyol only via scrape, Hepsiburada TBC
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
            observedAt: new Date(0), // deliberately ancient — decide()'s G9 staleness guard treats it as stale
          };

      const state = await loadState(ctx.appDb, listing.id);
      // `decide()` only reads `dailyAllowance`/`consumedToday`/`reservePct` to gate a single
      // decision's priority against a coarse "is the budget already exhausted" check — the
      // cross-listing admit-by-priority filtering (doc 03 §8) happens once, batch-wide, in
      // `SubmitPriceChanges` at drain time, using `admitByPriority` (doc 12 Phase 5.6).
      const budget: UpdateBudget = {
        dailyAllowance,
        consumedToday: usage?.consumed ?? 0,
        reservePct: policyRow.budgetReservePct,
      };

      const input: DecisionInput = {
        listing: {
          currentPrice: Money.fromKurus(listing.price),
          // Simplification (doc 01 doesn't define bundle physical-stock aggregation yet):
          // offered stock is used as a proxy for physical stock.
          physicalStock: listing.offeredStock,
          commissionRate: listing.commissionRate,
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
            enabled: listing.repriceEnabled && (prefs?.autoRepriceEnabled ?? true),
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

      await repricingRepo.upsertRepricingState(ctx.appDb, {
        listingId: listing.id,
        phase: decision.nextState.phase,
        lastGoodPrice: decision.nextState.lastGoodPrice?.toKurus() ?? null,
        lastBadPrice: decision.nextState.lastBadPrice?.toKurus() ?? null,
        optimumPrice: decision.nextState.optimumPrice?.toKurus() ?? null,
        optimumCtxUnitCost: decision.nextState.optimumContext?.unitCost.toKurus() ?? null,
        optimumCtxCommissionRate: decision.nextState.optimumContext?.commissionRate ?? null,
        optimumCtxVatRate: decision.nextState.optimumContext?.vatRate ?? null,
        optimumCtxCampaignRatio: decision.nextState.optimumContext?.campaignRatio ?? null,
        optimumCtxSecondPrice: decision.nextState.optimumContext?.secondPrice?.toKurus() ?? null,
        optimumCtxSecondSellerRef: decision.nextState.optimumContext?.secondSellerId ?? null,
        pendingSubmissionId: decision.nextState.pendingSubmission?.submissionId ?? null,
        settleUntil: decision.nextState.settleUntil?.getTime() ?? null,
        consecutiveRejections: decision.nextState.consecutiveRejections,
        updatedAt: nowMs,
      });

      if (decision.action === 'submit' && decision.newPrice) {
        const submissionId = newId();
        const floorResult = cost.ok
          ? floorPrice({
              unitCost: cost.value,
              vatRate: listing.vatRate,
              effectiveCommissionRate: effectiveCommissionRate(listing.commissionRate, fees),
              campaign: campaignRatioAt(Money.fromKurus(listing.price), campaignFinal),
              fees,
            })
          : err({ type: 'FloorNotComputed' as const });
        const isShadow = payload.mode === 'shadow';

        await repricingRepo.insertPriceSubmission(ctx.appDb, {
          id: submissionId,
          listingId: listing.id,
          marketplaceCode,
          oldPrice: listing.price,
          newPrice: decision.newPrice.toKurus(),
          reason: decision.reason,
          explanation: decision.explanation,
          priority: decision.priority,
          decidedAt: nowMs,
          state: isShadow ? 'cancelled' : 'queued',
          submittedAt: null,
          confirmedAt: null,
          marketplaceHandle: null,
          failureCode: isShadow ? 'shadow' : null,
          failureMessage: isShadow ? 'shadow mode — not submitted' : null,
          attempts: 0,
          unitCost: cost.ok ? cost.value.toKurus() : null,
          floorPrice: floorResult.ok ? floorResult.value.toKurus() : null,
          buyboxPrice: observation.buyboxPrice?.toKurus() ?? null,
          secondPrice: observation.secondPrice?.toKurus() ?? null,
          rank: observation.rank,
          commissionRate: listing.commissionRate,
          vatRate: listing.vatRate,
        });
        // The state row written above already carries `pendingSubmissionId` from
        // `decision.nextState` (the engine sets it itself on `action: 'submit'`) — nothing
        // further to reconcile here, shadow or live.
      }
      itemsOk += 1;
    } catch (error) {
      itemsFailed += 1;
      await eventsRepo.logEvent(ctx.appDb, {
        id: newId(),
        at: nowMs,
        level: 'error',
        marketplaceCode,
        listingId: listing.id,
        jobRunId: ctx.correlationId,
        code: 'RepriceListingFailed',
        message: `Reprice failed for listing ${listing.id}: ${error instanceof Error ? error.message : String(error)}`,
        context: null,
      });
    }
  }

  return { itemsTotal: candidates.length, itemsOk, itemsFailed };
}
