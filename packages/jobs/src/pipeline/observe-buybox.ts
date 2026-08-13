/**
 * `ObserveBuybox` (doc 07 §1, §4) — the control-path read: official buybox API →
 * `buybox_observations`. Tiered polling frequency so a converged catalogue doesn't burn
 * quota re-observing listings sitting quietly at their optimum (doc 07 §4).
 */
import { getAdapter } from '../adapter-registry.js';
import type { MarketplaceCode } from '@buybox/core';
import { competitionRepo, listingsRepo, newId, repricingRepo } from '@buybox/db';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';

export const OBSERVE_BUYBOX_JOB = 'ObserveBuybox';

export const ObserveBuyboxPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  /** Monotonically increasing cycle counter the caller advances each time this job runs. */
  cycleNumber: z.number().int().min(0),
  warmEveryNCycles: z.number().int().min(1).default(5),
  coldEveryNCycles: z.number().int().min(1).default(20),
});

export type ObserveBuyboxPayload = z.infer<typeof ObserveBuyboxPayloadSchema>;

export type ObservationTier = 'hot' | 'warm' | 'cold' | 'frozen';

export interface TieringInput {
  readonly phase: 'SEEKING' | 'CLIMBING' | 'REFINING' | 'OPTIMUM' | 'BLOCKED' | null;
  readonly locked: boolean;
  readonly offeredStock: number;
  readonly recentlyLostBuybox: boolean;
}

/**
 * doc 07 §4's table, as a pure function of the state this job actually has available.
 * The Warm/Cold split within `OPTIMUM` is specified as "high turnover or high value" vs
 * "low value" — sales-history data this system doesn't have yet (doc 10 §12: orders are
 * MAY-ADD-LATER). Until then every converged `OPTIMUM` listing is Warm; `BLOCKED` is Cold.
 * A listing with no state yet (never repriced) is Hot — it needs data before anything else.
 */
export function computeObservationTier(input: TieringInput): ObservationTier {
  if (input.locked || input.offeredStock <= 0) return 'frozen';
  if (
    input.phase === null ||
    input.phase === 'SEEKING' ||
    input.phase === 'CLIMBING' ||
    input.phase === 'REFINING'
  ) {
    return 'hot';
  }
  if (input.recentlyLostBuybox) return 'hot';
  if (input.phase === 'BLOCKED') return 'cold';
  return 'warm'; // OPTIMUM
}

function isDueThisCycle(
  tier: ObservationTier,
  cycleNumber: number,
  warmEveryN: number,
  coldEveryN: number,
): boolean {
  if (tier === 'frozen') return false;
  if (tier === 'hot') return true;
  if (tier === 'warm') return cycleNumber % warmEveryN === 0;
  return cycleNumber % coldEveryN === 0;
}

export async function observeBuybox(ctx: JobContext): Promise<JobResult> {
  const payload = ObserveBuyboxPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode: MarketplaceCode = payload.marketplaceCode;
  const adapter = getAdapter(ctx.adapters, marketplaceCode);
  const nowMs = ctx.clock.nowMs();

  const candidates = await listingsRepo.listRepriceableListings(ctx.appDb, marketplaceCode);

  const dueListingIds: string[] = [];
  const listingByMarketplaceId = new Map<string, string>();
  for (const listing of candidates) {
    const state = await repricingRepo.getRepricingState(ctx.appDb, listing.id);
    const latestObservation = await competitionRepo.latestBuyboxObservation(ctx.appDb, listing.id);
    const recentlyLostBuybox = latestObservation !== undefined && latestObservation.rank !== 1;
    const tier = computeObservationTier({
      phase: state?.phase ?? null,
      locked: listing.isLocked,
      offeredStock: listing.offeredStock,
      recentlyLostBuybox,
    });
    if (isDueThisCycle(tier, payload.cycleNumber, payload.warmEveryNCycles, payload.coldEveryNCycles)) {
      dueListingIds.push(listing.marketplaceListingId);
      listingByMarketplaceId.set(listing.marketplaceListingId, listing.id);
    }
  }

  if (dueListingIds.length === 0) {
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }

  const observations = await adapter.fetchBuyboxObservations(dueListingIds);

  let itemsOk = 0;
  let itemsFailed = 0;
  for (const observation of observations) {
    const listingId = listingByMarketplaceId.get(observation.marketplaceListingId);
    if (!listingId) {
      itemsFailed += 1;
      continue;
    }
    await competitionRepo.insertBuyboxObservation(ctx.appDb, {
      id: newId(),
      listingId,
      observedAt: nowMs,
      rank: observation.rank,
      buyboxPrice: observation.buyboxPrice?.toKurus() ?? null,
      secondPrice: observation.secondPrice?.toKurus() ?? null,
      thirdPrice: observation.thirdPrice?.toKurus() ?? null,
      hasMultipleSeller: observation.hasMultipleSeller,
      source: 'api',
    });
    itemsOk += 1;
  }

  return { itemsTotal: dueListingIds.length, itemsOk, itemsFailed };
}
