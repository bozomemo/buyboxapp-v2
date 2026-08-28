/**
 * The tracked-product half of `ScrapeCompetitors` (doc 06 §12.2, customer feedback
 * 2026-08-25) — watching a marketplace product we do **not** sell, added by pasting its link.
 *
 * Deliberately a separate function reading a separate table (`tracked_products`), never
 * `listings`. `Reprice` and `ObserveBuybox` (doc 07 §2.1/§2.2) only ever query `listings`, so
 * nothing here can structurally reach a pricing decision — there is no flag to check because
 * there is no listing row for that code to see. Called from `scrapeCompetitors` under its own
 * `try`/`catch` so a failure here can never fail the listings half of the same run.
 *
 * Change-detected since Faz 4 (2026-08-28): a look's offer rows are stored only when the offer
 * set differs from the previous one, by the same `hashOffers` `ScrapeCompetitors` uses. That
 * was an acceptable simplification to skip while the tracked set was operator-curated and a few
 * dozen products; a brand sweep makes it a catalogue of thousands, and at that size storing
 * every look would spend millions of rows a year recording that nothing moved. There is still
 * no `scrape_runs` row — `tracked_products.last_scraped_at` carries the proof of the look.
 *
 * Identified sellers are registered in `competitor_sellers` as they are seen, so a seller is
 * **one record** whether we met them competing on a listing we sell or selling a brand we own.
 * That is what lets an operator's cross-marketplace link, group and note (doc 05 §5) mean the
 * same company on the brand-audit screens as on the competitor ones — and, from Faz 5, what
 * lets one seller policy apply to both.
 */
import type { MarketplaceCode } from '@buybox/core';
import { competitorSellersRepo, eventsRepo, newId, trackedProductsRepo } from '@buybox/db';
import { CompetitorSourceError, type ICompetitorSource } from '@buybox/adapters';
import type { JobContext } from '../job.js';
import { SCRAPE_MAX_TRACKED_PER_RUN, SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT } from '../scrape-config.js';
import { hashOffers } from './scrape-competitors.js';

export interface ScrapeTrackedProductsResult {
  readonly itemsOk: number;
  readonly itemsFailed: number;
  /**
   * Of the successful looks, how many actually stored anything. Reported separately from
   * `itemsOk` because with change detection the two answer different questions — "did the job
   * work" and "did the market move" — and a run where they are equal every day is a sign the
   * hash is not doing its job rather than a sign of a busy market.
   */
  readonly itemsChanged: number;
  /**
   * How many products this run actually intended to read — the ceiling, not the size of the
   * tracked set. The caller reports it as part of the run's totals, so a run that read 300 of
   * 4,679 rows says so rather than claiming the catalogue is 300 rows long.
   */
  readonly itemsTotal: number;
}

export async function scrapeTrackedProducts(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  source: ICompetitorSource,
  /**
   * How many items the caller has already reported progress for, so the two halves of one
   * `ScrapeCompetitors` run share a single counter instead of the tracked half silently
   * restarting it at zero — which, before this existed, left the Jobs screen frozen on the last
   * listing for the hours the tracked half was running.
   */
  progressOffset = 0,
  /** Per-run ceiling; see `SCRAPE_MAX_TRACKED_PER_RUN`. Overridable from the job payload. */
  maxProducts = SCRAPE_MAX_TRACKED_PER_RUN,
): Promise<ScrapeTrackedProductsResult> {
  const nowMs = ctx.clock.nowMs();
  const products = await trackedProductsRepo.listTrackedProducts(ctx.appDb, { activeOnly: true });

  // Never-looked first, then oldest look first — the same ordering, for the same reason, as
  // `scrapeCompetitors`' candidate sort: it is what turns the ceiling below into a rotation
  // through the catalogue rather than a permanent cut-off after the first N rows.
  const due = products
    .filter((p) => p.marketplaceCode === marketplaceCode)
    .sort((a, b) => {
      const aAt = a.lastScrapedAt ?? -1;
      const bAt = b.lastScrapedAt ?? -1;
      if (aAt !== bAt) return aAt - bAt;
      // Stable tie-break so a catalogue that has never been looked at (every row -1) can't
      // re-select a different arbitrary subset each run and starve the rest. Ids are UUID v7.
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, maxProducts);

  let itemsOk = 0;
  let itemsFailed = 0;
  let itemsChanged = 0;
  let consecutiveFailures = 0;
  let processed = 0;

  for (const product of due) {
    // Before the fetch, like the listings half: on a rate-limited scrape the wait *is* most of
    // the elapsed time, and the operator is watching to see which page it is waiting on.
    ctx.reportProgress({
      done: progressOffset + processed,
      total: progressOffset + due.length,
      currentItem: product.label,
    });
    processed += 1;

    try {
      const snapshot = await source.fetchProductOffers({ url: product.productUrl, contentId: product.productRef });
      const { changed } = await trackedProductsRepo.recordTrackedProductLook(ctx.appDb, {
        trackedProductId: product.id,
        observedAt: nowMs,
        offersHash: hashOffers(snapshot.offers),
        rows: snapshot.offers.map((offer) => ({
          id: newId(),
          trackedProductId: product.id,
          observedAt: nowMs,
          status: 'ok' as const,
          rank: offer.rank,
          sellerName: offer.sellerName ?? '',
          sellerRef: offer.sellerRef,
          price: offer.price?.toKurus() ?? null,
          finalPrice: offer.finalPrice?.toKurus() ?? null,
          offeredStock: offer.offeredStock,
        })),
      });
      itemsOk += 1;
      consecutiveFailures = 0;
      if (changed) itemsChanged += 1;

      // Registered on every look, not only on a changed one: a seller who has held the same
      // price all month is still here, and `last_seen_at` is the field that says so. Only
      // sellers the payload identified — one with no merchant id has no durable identity, and
      // matching it by display name is the mistake doc 05 §5 refuses to make.
      await competitorSellersRepo.recordSeenSellers(
        ctx.appDb,
        snapshot.offers.flatMap((offer) =>
          offer.sellerRef === null
            ? []
            : [
                {
                  id: newId(),
                  marketplaceCode,
                  sellerRef: offer.sellerRef,
                  sellerName: offer.sellerName ?? '',
                  seenAt: nowMs,
                },
              ],
        ),
      );
    } catch (error) {
      itemsFailed += 1;
      consecutiveFailures += 1;
      const status =
        error instanceof CompetitorSourceError && error.kind === 'parseFailed' ? 'parseFailed' : 'fetchFailed';
      // `offersHash: null` — the failure row is always stored, and the stored hash is left
      // alone. Clearing it would make the next successful look read as a change and store a
      // duplicate offer set, turning every transient network error into a fake price event.
      await trackedProductsRepo.recordTrackedProductLook(ctx.appDb, {
        trackedProductId: product.id,
        observedAt: nowMs,
        offersHash: null,
        rows: [
          {
            id: newId(),
            trackedProductId: product.id,
            observedAt: nowMs,
            status,
            rank: null,
            sellerName: null,
            sellerRef: null,
            price: null,
            finalPrice: null,
            offeredStock: null,
          },
        ],
      });
      // Same "per-failure silence, rate alerts" posture as ScrapeCompetitors (doc 07 §7) — a
      // handful of tracked products is not worth a dedicated failure-rate alert of its own.
      await eventsRepo.logEvent(ctx.appDb, {
        id: newId(),
        at: nowMs,
        level: 'debug',
        marketplaceCode,
        listingId: null,
        jobRunId: ctx.correlationId,
        code: 'TrackedProductScrapeFailed',
        message: `Scrape ${status} for tracked product ${product.id} (${product.label}): ${error instanceof Error ? error.message : String(error)}`,
        context: JSON.stringify({ status }),
      });

      // The source is gone, not the page — see the constant's doc comment. Logged at `warn`
      // rather than `debug` on purpose: this is the one scraping condition an operator has to
      // act on, and it is otherwise invisible behind the per-failure silence above.
      if (consecutiveFailures >= SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT) {
        await eventsRepo.logEvent(ctx.appDb, {
          id: newId(),
          at: nowMs,
          level: 'warn',
          marketplaceCode,
          listingId: null,
          jobRunId: ctx.correlationId,
          code: 'TrackedProductsScrapeHalted',
          message: `Tracked-product scrape for ${marketplaceCode} stopped after ${consecutiveFailures} consecutive failures at ${processed}/${due.length} — the source looks unavailable; the products not reached are first in the next run`,
          context: JSON.stringify({ consecutiveFailures, processed, due: due.length }),
        });
        break;
      }
    }
  }

  return { itemsOk, itemsFailed, itemsChanged, itemsTotal: due.length };
}
