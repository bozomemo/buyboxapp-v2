/**
 * `ScrapeCompetitors` (doc 07 §7, doc 12 Phase 7) — the **reporting-only** competitor read.
 *
 * ```
 * for each listing in the scrape tier:
 *     fetch public product data
 *     always insert scrape_runs { observed_at, seller_count, payload_hash, status }
 *     if payload_hash != last hash for this listing:
 *         insert competitor_observations rows
 *         scrape_runs.changed = 1
 * ```
 *
 * Isolation is the requirement, not a nicety (doc 12 Phase 7 definition of done: "disabling
 * the scraper entirely leaves repricing fully functional"). Concretely, this job:
 *
 * - reads a **separate** registry (`ctx.competitorSources`), so it cannot touch the
 *   marketplace adapter the control path uses;
 * - never trips the marketplace circuit breaker — a scrape outage must not stop price
 *   submissions, which is exactly what sharing a breaker would cause;
 * - never returns `JobResult.error` for individual page failures, so the queue does not retry
 *   a whole catalogue because one page 404'd; failures are counted and the **rate** alerts
 *   (doc 07 §7: "per-failure silence");
 * - writes only `scrape_runs` and `competitor_observations`, never `repricing_state`,
 *   `price_submissions` or `buybox_observations`.
 */
import { createHash } from 'node:crypto';
import { CompetitorSourceError, type CompetitorOffer, type CompetitorPageSnapshot } from '@buybox/adapters';
import type { MarketplaceCode } from '@buybox/core';
import { competitionRepo, eventsRepo, listingsRepo, newId, repricingRepo } from '@buybox/db';
import { z } from 'zod';
import { getCompetitorSource } from '../competitor-source-registry.js';
import type { JobContext, JobResult } from '../job.js';
import {
  SCRAPE_COLD_EVERY_N_CYCLES,
  SCRAPE_FAILURE_RATE_ALERT_THRESHOLD,
  SCRAPE_FAILURE_RATE_MIN_SAMPLE,
  SCRAPE_MAX_LISTINGS_PER_RUN,
  SCRAPE_WARM_EVERY_N_CYCLES,
} from '../scrape-config.js';
import { decodeProductPageRef } from './listing-extra.js';
import { computeObservationTier, type ObservationTier } from './observe-buybox.js';

export const SCRAPE_COMPETITORS_JOB = 'ScrapeCompetitors';

export const ScrapeCompetitorsPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  /** Monotonically increasing cycle counter, as `ObserveBuybox` uses (doc 07 §4). */
  cycleNumber: z.number().int().min(0),
  warmEveryNCycles: z.number().int().min(1).default(SCRAPE_WARM_EVERY_N_CYCLES),
  coldEveryNCycles: z.number().int().min(1).default(SCRAPE_COLD_EVERY_N_CYCLES),
  maxListings: z.number().int().min(1).default(SCRAPE_MAX_LISTINGS_PER_RUN),
});

export type ScrapeCompetitorsPayload = z.infer<typeof ScrapeCompetitorsPayloadSchema>;

/**
 * doc 07 §4's *Scrape* column — a different cadence from the same tier that drives the buybox
 * poll: Hot every cycle, Warm daily, Cold weekly, Frozen never.
 */
export function isDueForScrape(
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

/**
 * The change-detection key for doc 07 §7's "insert only when the seller set differs".
 *
 * Hashes the **normalised** offers, never the raw HTML: a Trendyol page carries session ids,
 * A/B flags and recommendation blocks that change on every load, so hashing the response body
 * would mark every scrape as changed and defeat the whole point of the two-tier design
 * (doc 10 §5). Money is hashed as exact kuruş, never as a formatted string.
 */
export function hashOffers(offers: readonly CompetitorOffer[]): string {
  const canonical = offers.map((offer) => [
    offer.rank,
    offer.sellerRef,
    offer.sellerName,
    offer.sellerRating,
    offer.listingRef,
    offer.price?.toKurus().toString() ?? null,
    offer.finalPrice?.toKurus().toString() ?? null,
    offer.offeredStock,
    offer.dispatchTime,
    offer.hasPromotion,
    offer.promotionText,
    offer.isWinner,
  ]);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function toObservationRows(
  listingId: string,
  scrapeRunId: string,
  observedAt: number,
  snapshot: CompetitorPageSnapshot,
): competitionRepo.CompetitorObservationRow[] {
  return snapshot.offers.map((offer) => ({
    id: newId(),
    listingId,
    scrapeRunId,
    observedAt,
    rank: offer.rank,
    // doc 05 §5 types `seller_name` as non-null; an unnamed seller is stored as an empty
    // string rather than a sentinel like the legacy `"No Seller"` (doc 08, doc 10 §3).
    sellerName: offer.sellerName ?? '',
    sellerRef: offer.sellerRef,
    price: offer.price?.toKurus() ?? null,
    finalPrice: offer.finalPrice?.toKurus() ?? null,
    rating: offer.sellerRating,
    dispatchTime: offer.dispatchTime,
    offeredStock: offer.offeredStock,
    hasPromotion: offer.hasPromotion,
    promotionText: offer.promotionText,
  }));
}

export async function scrapeCompetitors(ctx: JobContext): Promise<JobResult> {
  const payload = ScrapeCompetitorsPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode: MarketplaceCode = payload.marketplaceCode;
  const nowMs = ctx.clock.nowMs();

  const source = getCompetitorSource(ctx.competitorSources, marketplaceCode);
  if (!source) {
    // Not an error: no competitor source configured is a supported deployment (doc 12 Phase 7).
    // Reported as a no-op run so the operator can see why the reports are empty.
    return {
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: `no competitor source registered for ${marketplaceCode} — competitor history not collected`,
    };
  }

  const candidates = await listingsRepo.listRepriceableListings(ctx.appDb, marketplaceCode);

  const due: { readonly listingId: string; readonly extra: string | null }[] = [];
  for (const listing of candidates) {
    const state = await repricingRepo.getRepricingState(ctx.appDb, listing.id);
    const latestObservation = await competitionRepo.latestBuyboxObservation(ctx.appDb, listing.id);
    const tier = computeObservationTier({
      phase: state?.phase ?? null,
      locked: listing.isLocked,
      offeredStock: listing.offeredStock,
      recentlyLostBuybox: latestObservation !== undefined && latestObservation.rank !== 1,
    });
    if (!isDueForScrape(tier, payload.cycleNumber, payload.warmEveryNCycles, payload.coldEveryNCycles)) {
      continue;
    }
    due.push({ listingId: listing.id, extra: listing.extra });
    if (due.length >= payload.maxListings) break;
  }

  let itemsOk = 0;
  let itemsFailed = 0;
  let attempted = 0;
  let skippedNoPageRef = 0;

  for (const item of due) {
    const ref = decodeProductPageRef(item.extra);
    if (!ref) {
      // Nothing to fetch: this listing was imported before product-page capture, or its
      // marketplace exposes no public page. A reporting gap, not a failure.
      skippedNoPageRef += 1;
      continue;
    }

    attempted += 1;
    const scrapeRunId = newId();
    try {
      const snapshot = await source.fetchProductOffers(ref);
      const payloadHash = hashOffers(snapshot.offers);
      await competitionRepo.recordScrapeRun(
        ctx.appDb,
        {
          id: scrapeRunId,
          listingId: item.listingId,
          observedAt: nowMs,
          source: 'publicPage',
          sellerCount: snapshot.diagnostics.merchantCount,
          payloadHash,
          status: 'ok',
          changed: false, // recomputed inside recordScrapeRun against the last successful run
        },
        toObservationRows(item.listingId, scrapeRunId, nowMs, snapshot),
      );
      itemsOk += 1;
    } catch (error) {
      itemsFailed += 1;
      const status: 'parseFailed' | 'fetchFailed' =
        error instanceof CompetitorSourceError && error.kind === 'parseFailed'
          ? 'parseFailed'
          : 'fetchFailed';
      // doc 05 §5: the proof-of-look row is written whether or not the look succeeded.
      await competitionRepo.recordScrapeRun(
        ctx.appDb,
        {
          id: scrapeRunId,
          listingId: item.listingId,
          observedAt: nowMs,
          source: 'publicPage',
          sellerCount: 0,
          payloadHash: '',
          status,
          changed: false,
        },
        [],
      );
      // doc 07 §7: per-failure silence. Recorded at debug so a diagnosis is still possible,
      // but it is the rate below that alerts.
      await eventsRepo.logEvent(ctx.appDb, {
        id: newId(),
        at: nowMs,
        level: 'debug',
        marketplaceCode,
        listingId: item.listingId,
        jobRunId: ctx.correlationId,
        code: 'ScrapeFailed',
        message: `Scrape ${status} for listing ${item.listingId}: ${error instanceof Error ? error.message : String(error)}`,
        context: JSON.stringify({ status }),
      });
    }
  }

  if (attempted >= SCRAPE_FAILURE_RATE_MIN_SAMPLE) {
    const failureRate = itemsFailed / attempted;
    if (failureRate >= SCRAPE_FAILURE_RATE_ALERT_THRESHOLD) {
      await eventsRepo.logEvent(ctx.appDb, {
        id: newId(),
        at: nowMs,
        level: 'error',
        marketplaceCode,
        listingId: null,
        jobRunId: ctx.correlationId,
        code: 'ScrapeFailureRateHigh',
        message: `Scrape failure rate ${(failureRate * 100).toFixed(1)}% (${itemsFailed}/${attempted}) for ${marketplaceCode} — competitor reporting is degraded; repricing is unaffected`,
        context: JSON.stringify({
          attempted,
          failed: itemsFailed,
          threshold: SCRAPE_FAILURE_RATE_ALERT_THRESHOLD,
        }),
      });
    }
  }

  if (skippedNoPageRef > 0) {
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: nowMs,
      level: 'info',
      marketplaceCode,
      listingId: null,
      jobRunId: ctx.correlationId,
      code: 'ScrapeSkippedNoProductPage',
      message: `${skippedNoPageRef} listing(s) due for scraping carry no public product-page reference — run ImportListings to capture one`,
      context: null,
    });
  }

  // Deliberately no `error`: individual page failures never fail the run (see the header).
  return { itemsTotal: due.length, itemsOk, itemsFailed };
}
