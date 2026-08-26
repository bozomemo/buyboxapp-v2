/**
 * `ObserveBuybox` (doc 07 §1, §4) — the control-path read: official buybox API →
 * `buybox_observations`. Tiered polling frequency so a converged catalogue doesn't burn
 * quota re-observing listings sitting quietly at their optimum (doc 07 §4).
 */
import { getAdapter } from '../adapter-registry.js';
import type { MarketplaceCode } from '@buybox/core';
import { circuitBreakerRepo, competitionRepo, listingsRepo, newId, repricingRepo } from '@buybox/db';
import { z } from 'zod';
import {
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  CIRCUIT_BREAKER_OPEN_DURATION_MS,
} from '../circuit-breaker-config.js';
import type { JobContext, JobResult } from '../job.js';

export const OBSERVE_BUYBOX_JOB = 'ObserveBuybox';

export const ObserveBuyboxPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  /**
   * Length of one "cycle" in milliseconds — this job's own tick cadence, supplied by the
   * caller that owns it (`apps/worker`). The tier multipliers below are expressed in these.
   */
  cycleMs: z.number().int().min(1).default(60_000),
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

/**
 * doc 07 §4's tier cadences, decided from **how long it has been since we last looked at this
 * listing** rather than from a counter of how many times the job has fired.
 *
 * The counter is what doc 07 §4.1 gap G-1 proposed, and it was the obvious reading of the §4
 * table's "every N cycles". It was rejected on implementation (2026-08-26) for three reasons,
 * all of which the elapsed-time form gets right for free:
 *
 * - **A counter has to survive restarts to mean anything.** Persisting it makes a per-tick
 *   `app_settings` write whose audit trail is noise, and putting it in the job payload breaks
 *   `countActiveJobsForTarget`'s "one run at a time" guard (doc 07 §8) — the payload would
 *   differ on every tick, so the guard would never match and a slow run would queue duplicates.
 * - **A counter measures firings, not time.** After the worker is down for three days a counter
 *   says one cycle has passed; a Cold listing is then not re-scraped for another week, having
 *   already gone ten days unobserved.
 * - **`% N === 0` is not "every N cycles" per listing, it is "on cycles divisible by N" for the
 *   whole catalogue.** Every Warm listing becomes due in the same tick and none in the other 23,
 *   which is exactly the burst the tiering exists to avoid.
 *
 * A listing that has never been observed is always due — never having looked is staler than any
 * timestamp, and it is the state every listing starts in.
 */
export function isDueForObservation(
  tier: ObservationTier,
  lastObservedAtMs: number | null,
  nowMs: number,
  cycleMs: number,
  warmEveryN: number,
  coldEveryN: number,
): boolean {
  if (tier === 'frozen') return false;
  if (tier === 'hot') return true;
  if (lastObservedAtMs === null) return true;
  const everyN = tier === 'warm' ? warmEveryN : coldEveryN;
  return nowMs - lastObservedAtMs >= everyN * cycleMs;
}

export async function observeBuybox(ctx: JobContext): Promise<JobResult> {
  const payload = ObserveBuyboxPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode: MarketplaceCode = payload.marketplaceCode;
  const adapter = getAdapter(ctx.adapters, marketplaceCode);
  const nowMs = ctx.clock.nowMs();

  const candidates = await listingsRepo.listObservableListings(ctx.appDb, marketplaceCode);

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
    if (
      isDueForObservation(
        tier,
        latestObservation?.observedAt ?? null,
        nowMs,
        payload.cycleMs,
        payload.warmEveryNCycles,
        payload.coldEveryNCycles,
      )
    ) {
      dueListingIds.push(listing.marketplaceListingId);
      listingByMarketplaceId.set(listing.marketplaceListingId, listing.id);
    }
  }

  if (dueListingIds.length === 0) {
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }

  // doc 07 §3: stop outbound calls while the circuit is open. Nothing has been read from the
  // adapter yet, so skipping here has no partial-state to unwind.
  if (
    !(await circuitBreakerRepo.canProceed(
      ctx.appDb,
      marketplaceCode,
      nowMs,
      CIRCUIT_BREAKER_OPEN_DURATION_MS,
    ))
  ) {
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0, error: `circuit open for ${marketplaceCode}` };
  }

  let observations;
  try {
    observations = await adapter.fetchBuyboxObservations(dueListingIds);
    await circuitBreakerRepo.recordSuccess(ctx.appDb, marketplaceCode, nowMs);
  } catch (error) {
    await circuitBreakerRepo.recordFailure(
      ctx.appDb,
      marketplaceCode,
      nowMs,
      error instanceof Error ? error.message : String(error),
      CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    );
    throw error; // preserve existing retry-at-the-job-level behaviour (JobRunner)
  }

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
