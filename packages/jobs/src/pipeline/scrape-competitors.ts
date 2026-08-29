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
 * - writes only `scrape_runs`, `competitor_observations` and `competitor_sellers`, never
 *   `repricing_state`, `price_submissions` or `buybox_observations`.
 *
 * Also runs the tracked-products half (doc 06 §12.2) at the end of each per-marketplace call —
 * see `scrape-tracked-products.ts` for why that is a separate function over a separate table
 * rather than folded into the loop above. That half is bounded and rotated by its own ceiling
 * (`SCRAPE_MAX_TRACKED_PER_RUN`) for the same reason this one is, and shares this run's progress
 * counter so the Jobs screen keeps moving while it works.
 */
import { createHash } from 'node:crypto';
import { CompetitorSourceError, type CompetitorOffer, type CompetitorPageSnapshot } from '@buybox/adapters';
import type { MarketplaceCode } from '@buybox/core';
import {
  alertsRepo,
  competitionRepo,
  competitorSellersRepo,
  configRepo,
  eventsRepo,
  listingsRepo,
  newId,
  repricingRepo,
} from '@buybox/db';
import { z } from 'zod';
import { getCompetitorSource } from '../competitor-source-registry.js';
import type { JobContext, JobResult } from '../job.js';
import {
  SCRAPE_COLD_EVERY_N_CYCLES,
  SCRAPE_CYCLE_MS,
  SCRAPE_FAILURE_RATE_ALERT_THRESHOLD,
  SCRAPE_FAILURE_RATE_MIN_SAMPLE,
  SCRAPE_MAX_LISTINGS_PER_RUN,
  SCRAPE_MAX_TRACKED_PER_RUN,
  SCRAPE_WARM_EVERY_N_CYCLES,
} from '../scrape-config.js';
import { evaluateAlertsForListing, toListingContext } from './evaluate-alerts.js';
import { decodeProductPageRef } from './listing-extra.js';
import { computeObservationTier, isDueForObservation, type ObservationTier } from './observe-buybox.js';
import { scrapeTrackedProducts } from './scrape-tracked-products.js';

export const SCRAPE_COMPETITORS_JOB = 'ScrapeCompetitors';

export const ScrapeCompetitorsPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  /** Length of one "cycle" in ms; the tier multipliers below are expressed in these. */
  cycleMs: z.number().int().min(1).default(SCRAPE_CYCLE_MS),
  warmEveryNCycles: z.number().int().min(1).default(SCRAPE_WARM_EVERY_N_CYCLES),
  coldEveryNCycles: z.number().int().min(1).default(SCRAPE_COLD_EVERY_N_CYCLES),
  maxListings: z.number().int().min(1).default(SCRAPE_MAX_LISTINGS_PER_RUN),
  /** The tracked-products half's own ceiling — a separate table with its own size. */
  maxTracked: z.number().int().min(1).default(SCRAPE_MAX_TRACKED_PER_RUN),
});

export type ScrapeCompetitorsPayload = z.infer<typeof ScrapeCompetitorsPayloadSchema>;

/**
 * doc 07 §4's *Scrape* column — a different cadence from the same tier that drives the buybox
 * poll: Hot every cycle, Warm daily, Cold weekly, Frozen never.
 *
 * Measured from the last **successful** scrape, for the same reason change detection is
 * (doc 07 §7): a failed run tells us nothing about the listing, and treating it as a look
 * would let a listing that fails every time drift out of the rotation entirely.
 *
 * `isDueForObservation` carries the full reasoning for why this is elapsed time rather than a
 * cycle counter.
 */
export function isDueForScrape(
  tier: ObservationTier,
  lastScrapedAtMs: number | null,
  nowMs: number,
  cycleMs: number,
  warmEveryN: number,
  coldEveryN: number,
): boolean {
  return isDueForObservation(tier, lastScrapedAtMs, nowMs, cycleMs, warmEveryN, coldEveryN);
}

/**
 * The change-detection key for doc 07 §7's "insert only when the seller set differs".
 *
 * Hashes the **normalised** offers, never the raw HTML: a Trendyol page carries session ids,
 * A/B flags and recommendation blocks that change on every load, so hashing the response body
 * would mark every scrape as changed and defeat the whole point of the two-tier design
 * (doc 10 §5). Money is hashed as exact kuruş, never as a formatted string.
 *
 * **Only four fields are keyed on: `rank`, `sellerRef`, `price`, `finalPrice`.** The offer rows
 * themselves still carry every field — narrowing this key changes *when* a batch is written,
 * never *what* is written, so `observationsAsOf`'s whole-batch reconstruction is unaffected.
 *
 * The excluded fields were measured against the live archive (1,799 observations over 64
 * listings, 124 batch transitions, 2026-08-18):
 *
 * - `offeredStock` alone drove 53 of 124 rewrites. A single unit selling changes one seller's
 *   stock and rewrites the whole 20-seller batch, with no price or ranking movement at all.
 *   `sellerRating`, `promotionText`, `sellerName`, `listingRef` and `dispatchTime` are the same
 *   kind of churn at a lower rate.
 * - `rank` is **not** churn and stays in the key, though it was initially assumed to be: all 55
 *   rank-only transitions in the sample turned out to be genuine buybox hand-overs between
 *   equally-priced sellers, which the buybox-share report (doc 06 §6) exists to count. Dropping
 *   it would have saved a further ~30% of writes by discarding exactly the signal being stored.
 * - `isWinner` is redundant once `rank` is keyed on — it is `rank === 1`.
 *
 * Net effect on the sample: 1,799 rows → 1,300 (−28%).
 */
export function hashOffers(offers: readonly CompetitorOffer[]): string {
  const canonical = offers.map((offer) => [
    offer.rank,
    offer.sellerRef,
    offer.price?.toKurus().toString() ?? null,
    offer.finalPrice?.toKurus().toString() ?? null,
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

  const unorderedCandidates = await listingsRepo.listObservableListings(ctx.appDb, marketplaceCode);

  // doc 07 §4.1 gap G-2: the `maxListings` ceiling below is only a *rotation* if the candidates
  // are ordered by how long it has been since we last looked. Unordered, the engine returns the
  // same first rows every run and everything past the ceiling is never scraped at all — while
  // the run still reports `completed`, so nothing surfaces it. Oldest first, never-scraped
  // first: not having looked is staler than any timestamp.
  const lastScrapedAt = await competitionRepo.lastSuccessfulScrapeAtByListing(ctx.appDb, marketplaceCode);
  const candidates = [...unorderedCandidates].sort((a, b) => {
    const aAt = lastScrapedAt.get(a.id) ?? -1;
    const bAt = lastScrapedAt.get(b.id) ?? -1;
    if (aAt !== bAt) return aAt - bAt;
    // Stable tie-break so two runs in the same millisecond can't interleave differently and
    // re-select the same subset. Ids are UUID v7, so this is creation order.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const due: {
    readonly listingId: string;
    readonly extra: string | null;
    /** Display label for the Jobs screen's live progress panel only — never used as data. */
    readonly label: string;
    readonly baseStockCode: string | null;
    readonly price: bigint;
    readonly minPrice: bigint | null;
  }[] = [];
  for (const listing of candidates) {
    const state = await repricingRepo.getRepricingState(ctx.appDb, listing.id);
    const latestObservation = await competitionRepo.latestBuyboxObservation(ctx.appDb, listing.id);
    const tier = computeObservationTier({
      phase: state?.phase ?? null,
      locked: listing.isLocked,
      offeredStock: listing.offeredStock,
      recentlyLostBuybox: latestObservation !== undefined && latestObservation.rank !== 1,
    });
    if (
      !isDueForScrape(
        tier,
        lastScrapedAt.get(listing.id) ?? null,
        nowMs,
        payload.cycleMs,
        payload.warmEveryNCycles,
        payload.coldEveryNCycles,
      )
    ) {
      continue;
    }
    due.push({
      listingId: listing.id,
      extra: listing.extra,
      label: `${listing.sellerStockCode} · ${listing.productName}`,
      baseStockCode: listing.baseStockCode,
      price: listing.price,
      minPrice: listing.minPrice,
    });
    if (due.length >= payload.maxListings) break;
  }

  let itemsOk = 0;
  let itemsFailed = 0;
  let attempted = 0;
  let skippedNoPageRef = 0;

  let processed = 0;
  const seenSellers: competitorSellersRepo.SeenSeller[] = [];

  // Our own store's merchant id on this marketplace. We are one of the offers on our own
  // listings, so without this an "any seller below X" rule would open an alert against
  // ourselves the moment we priced below our own threshold — the rule would look like it was
  // working while reporting our own price back to us. `null` when unconfigured, in which case
  // nothing is removed; the same reading `loadSecondSellerId` takes (doc 03 §6.5).
  const ourSellerRef =
    (await configRepo.getMarketplace(ctx.appDb, marketplaceCode))?.merchantRef ?? null;

  // Loaded once per run, not per listing: the rule set is small and identical for every page,
  // and re-reading it 200 times would add nothing but load. Failing to load them is not fatal —
  // alerting degrades to "off" for this run while the scrape itself proceeds untouched.
  let alertRules: alertsRepo.AlertRuleRow[] = [];
  const sellerGroupOf = new Map<string, string>();
  try {
    alertRules = await alertsRepo.listAlertRules(ctx.appDb, true);
    if (alertRules.length > 0) {
      for (const seller of await competitorSellersRepo.listCompetitorSellers(ctx.appDb, {
        marketplaceCode,
      })) {
        if (seller.groupId !== null) sellerGroupOf.set(seller.sellerRef, seller.groupId);
      }
    }
  } catch (error) {
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: nowMs,
      level: 'warn',
      marketplaceCode,
      listingId: null,
      jobRunId: ctx.correlationId,
      code: 'AlertRulesLoadFailed',
      message: `Could not load alert rules: ${error instanceof Error ? error.message : String(error)} — competitor history is unaffected`,
      context: null,
    });
  }
  let alertsOpened = 0;
  let alertsResolved = 0;

  for (const item of due) {
    // Reported *before* the fetch, so the panel names the page currently being waited on
    // rather than the last one that finished — on a rate-limited scrape (api-references §1.6)
    // that wait is most of the elapsed time, and it is what the operator is watching.
    ctx.reportProgress({ done: processed, total: due.length, currentItem: item.label });
    processed += 1;

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
      // Identity bookkeeping is accumulated and written once after the loop — see the note at
      // the write site. Sellers the payload did not identify are skipped: a null ref has no
      // durable identity, and matching one by display name is the mistake `competitor_sellers`
      // exists to avoid.
      for (const offer of snapshot.offers) {
        if (offer.sellerRef === null) continue;
        seenSellers.push({
          id: newId(),
          marketplaceCode,
          sellerRef: offer.sellerRef,
          sellerName: offer.sellerName ?? '',
          seenAt: nowMs,
        });
      }
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

      // Isolated on purpose, and evaluated on the snapshot rather than on what was just
      // written: `recordScrapeRun` only stores observations when the seller set changed, so a
      // rule created today would never fire on a product that has been stable for days.
      // A failure here logs and moves on — the competitor history above is already durable, and
      // nothing in the pricing path reads any of this (doc 07 §1.1).
      if (alertRules.length > 0) {
        try {
          const result = await evaluateAlertsForListing(
            ctx.appDb,
            alertRules,
            sellerGroupOf,
            {
              listing: toListingContext({
                id: item.listingId,
                marketplaceCode,
                baseStockCode: item.baseStockCode,
                price: item.price,
                minPrice: item.minPrice,
              }),
              // Competitors only. The archive keeps the whole offer list — our rank is only
              // meaningful among the offers it ranks against — but an alert is about someone
              // else's behaviour.
              offers:
                ourSellerRef === null
                  ? snapshot.offers
                  : snapshot.offers.filter((offer) => offer.sellerRef !== ourSellerRef),
              payloadHash,
            },
            nowMs,
          );
          alertsOpened += result.opened;
          alertsResolved += result.resolved;
        } catch (error) {
          await eventsRepo.logEvent(ctx.appDb, {
            id: newId(),
            at: nowMs,
            level: 'warn',
            marketplaceCode,
            listingId: item.listingId,
            jobRunId: ctx.correlationId,
            code: 'AlertEvaluationFailed',
            message: `Alert evaluation failed for listing ${item.listingId}: ${error instanceof Error ? error.message : String(error)} — competitor history and repricing are unaffected`,
            context: null,
          });
        }
      }
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

  // Written once for the whole run rather than per listing: the same handful of merchants
  // appears across most of a catalogue (129 distinct sellers across 64 listings in the live
  // archive), so `recordSeenSellers`'s dedup turns ~4,000 offer rows into ~130 upserts.
  //
  // Isolated by its own catch on purpose. This table is a convenience for reporting and, later,
  // for alert rules; the scrape's actual output is already durably written by this point.
  // Failing a page's scrape — or the run — because a bookkeeping upsert failed would be exactly
  // the coupling the rest of this job is built to avoid.
  if (seenSellers.length > 0) {
    try {
      await competitorSellersRepo.recordSeenSellers(ctx.appDb, seenSellers);
    } catch (error) {
      await eventsRepo.logEvent(ctx.appDb, {
        id: newId(),
        at: nowMs,
        level: 'warn',
        marketplaceCode,
        listingId: null,
        jobRunId: ctx.correlationId,
        code: 'CompetitorSellerUpsertFailed',
        message: `Could not record competitor seller identities: ${error instanceof Error ? error.message : String(error)} — competitor history is unaffected`,
        context: null,
      });
    }
  }

  if (alertsOpened > 0 || alertsResolved > 0) {
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: nowMs,
      level: 'info',
      marketplaceCode,
      listingId: null,
      jobRunId: ctx.correlationId,
      code: 'AlertsChanged',
      message: `${alertsOpened} rakip alarmı açıldı, ${alertsResolved} alarm kapandı`,
      context: JSON.stringify({ opened: alertsOpened, resolved: alertsResolved }),
    });
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

  // Tracked products (doc 06 §12.2) — a wholly separate table and candidate source, run last
  // and isolated by its own `try`/`catch` so a failure there can never turn a clean listings
  // scrape into a failed run, matching this job's own "never fail the run on one bad page"
  // posture (see the module header) applied one level up.
  let trackedOk = 0;
  let trackedFailed = 0;
  let trackedChanged = 0;
  let trackedTotal = 0;
  try {
    // `processed` — not `due.length` — is the offset: it is what was actually reported, so the
    // shared counter continues from the last listing rather than jumping over the ones the
    // rotation skipped.
    const trackedResult = await scrapeTrackedProducts(ctx, marketplaceCode, source, {
      progressOffset: processed,
      maxProducts: payload.maxTracked,
    });
    trackedOk = trackedResult.itemsOk;
    trackedFailed = trackedResult.itemsFailed;
    trackedChanged = trackedResult.itemsChanged;
    trackedTotal = trackedResult.itemsTotal;
  } catch (error) {
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: nowMs,
      level: 'warn',
      marketplaceCode,
      listingId: null,
      jobRunId: ctx.correlationId,
      code: 'TrackedProductsScrapeAborted',
      message: `Tracked-product scrape for ${marketplaceCode} aborted: ${error instanceof Error ? error.message : String(error)} — the listings scrape above is unaffected`,
      context: null,
    });
  }

  // Outside the `try`, on purpose: this is a summary of work that is already durable, and a
  // logging failure must not be caught by the handler above and reported as an aborted scrape.
  //
  // Debug level, and only the ratio — it is how an operator sees whether change detection is
  // earning its keep. A run that stores every look it takes means the hash is matching nothing,
  // which is a bug in the offer set we hash rather than a very busy market.
  if (trackedOk > 0) {
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: nowMs,
      level: 'debug',
      marketplaceCode,
      listingId: null,
      jobRunId: ctx.correlationId,
      code: 'TrackedProductsScrapeSummary',
      message: `${trackedOk} tracked product(s) read, ${trackedChanged} with a changed offer set`,
      context: JSON.stringify({ itemsOk: trackedOk, itemsChanged: trackedChanged }),
    });
  }

  // Deliberately no `error`: individual page failures never fail the run (see the header).
  return {
    itemsTotal: due.length + trackedTotal,
    itemsOk: itemsOk + trackedOk,
    itemsFailed: itemsFailed + trackedFailed,
  };
}
