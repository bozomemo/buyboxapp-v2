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
import { byRotationPriority } from './tracked-rotation.js';

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

/**
 * The cadence path's candidates: never-looked first, then **most overdue** first.
 *
 * Until 2026-09-03 the second half of that was simply "oldest look first" — every product equal,
 * which is right for the operator-curated list this job was written for and wasteful over a
 * brand catalogue, where a product nobody sells and nobody has ever rated took exactly as much
 * of the hourly budget as the brand's most contested line. `tracked-rotation.ts` scales each
 * product's interval by what the row already says about it; overdue-ness is then measured in
 * multiples of that interval, which is what stops a deprioritised product from starving.
 */
async function rotatedProducts(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  maxProducts: number,
): Promise<trackedProductsRepo.TrackedProductRow[]> {
  const products = await trackedProductsRepo.listTrackedProducts(ctx.appDb, { activeOnly: true });
  return byRotationPriority(
    products.filter((p) => p.marketplaceCode === marketplaceCode),
    ctx.clock.nowMs(),
  ).slice(0, maxProducts);
}

/**
 * The rescan path's candidates: the ids the operator ticked, in the order they were sent.
 *
 * Fetched one at a time rather than by filtering `listTrackedProducts`, because the selection is
 * a handful of rows and that call reads the whole table — 4,679 rows on the live install. Ids
 * that no longer exist, or that belong to another marketplace, are dropped silently: the row may
 * have been removed between the click and the run, and there is nothing to look at.
 */
async function selectedProducts(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  ids: readonly string[],
  maxProducts: number,
): Promise<trackedProductsRepo.TrackedProductRow[]> {
  const rows: trackedProductsRepo.TrackedProductRow[] = [];
  for (const id of ids.slice(0, maxProducts)) {
    const row = await trackedProductsRepo.getTrackedProduct(ctx.appDb, id);
    if (row && row.marketplaceCode === marketplaceCode) rows.push(row);
  }
  return rows;
}

export interface ScrapeTrackedProductsOptions {
  /**
   * How many items the caller has already reported progress for, so the two halves of one
   * `ScrapeCompetitors` run share a single counter instead of the tracked half silently
   * restarting it at zero — which, before this existed, left the Jobs screen frozen on the last
   * listing for the hours the tracked half was running.
   */
  readonly progressOffset?: number;
  /** Per-run ceiling; see `SCRAPE_MAX_TRACKED_PER_RUN`. Overridable from the job payload. */
  readonly maxProducts?: number;
  /**
   * Read **exactly these products**, in place of the due-rotation below.
   *
   * This is the operator asking for one row, or a handful of them, to be looked at now
   * (`RescanTrackedProducts`, doc 06 §12.2) — not the cadence working through a catalogue. Two
   * things follow from that, and both are deliberate:
   *
   * - the rotation ordering is dropped, because there is nothing to rotate: the whole selection
   *   is read, and it is small by construction (`RESCAN_MAX_PRODUCTS`);
   * - `is_active` is **not** consulted. Pausing a product means "the cadence should skip it",
   *   and an operator who has just ticked that row and pressed the button has said something
   *   more specific than the flag does.
   *
   * Everything else — change detection, seller registration, the failure rows, the consecutive
   * failure limit — is identical, so a rescan writes exactly what a cadence look writes.
   */
  readonly onlyIds?: readonly string[];
}

export async function scrapeTrackedProducts(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  source: ICompetitorSource,
  options: ScrapeTrackedProductsOptions = {},
): Promise<ScrapeTrackedProductsResult> {
  const progressOffset = options.progressOffset ?? 0;
  const maxProducts = options.maxProducts ?? SCRAPE_MAX_TRACKED_PER_RUN;
  const nowMs = ctx.clock.nowMs();

  const due = options.onlyIds
    ? await selectedProducts(ctx, marketplaceCode, options.onlyIds, maxProducts)
    : await rotatedProducts(ctx, marketplaceCode, maxProducts);

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
      const snapshot = await source.fetchProductOffers({
        url: product.productUrl,
        contentId: product.productRef,
      });
      const { changed } = await trackedProductsRepo.recordTrackedProductLook(ctx.appDb, {
        trackedProductId: product.id,
        observedAt: nowMs,
        offersHash: hashOffers(snapshot.offers),
        /**
         * A page with nobody on it stores **one `noOffers` row** rather than nothing at all
         * (2026-09-03).
         *
         * Before this, an empty seller list wrote no rows, so the newest observation stayed the
         * last look that *had* sellers — a product no marketplace seller carries any more kept
         * reporting its final seller set indefinitely, and lost shelf was the one thing the
         * brand archive could not express. `noOffers` is a success, not a failure: `status` is
         * filtered to `'ok'` in every price aggregate, so the row lands in the history without
         * touching a single price figure.
         *
         * Change detection still applies unchanged — `hashOffers([])` is a stable hash, so a
         * product that stays empty writes this row once rather than once an hour.
         */
        rows:
          snapshot.offers.length === 0
            ? [
                {
                  id: newId(),
                  trackedProductId: product.id,
                  observedAt: nowMs,
                  status: 'noOffers' as const,
                  rank: null,
                  sellerName: null,
                  sellerRef: null,
                  price: null,
                  finalPrice: null,
                  offeredStock: null,
                  sellerRating: null,
                  dispatchTime: null,
                  hasPromotion: null,
                  promotionText: null,
                  listingRef: null,
                },
              ]
            : snapshot.offers.map((offer) => ({
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
                // The rest of what the page already told us (2026-09-03). These were being dropped
                // while `competitor_observations` stored the same fields for the listings half — see
                // the doc comment on `trackedProductObservations`. No extra request; the offer is
                // already in hand.
                sellerRating: offer.sellerRating,
                dispatchTime: offer.dispatchTime,
                hasPromotion: offer.hasPromotion,
                promotionText: offer.promotionText,
                listingRef: offer.listingRef,
              })),
      });
      itemsOk += 1;
      consecutiveFailures = 0;
      if (changed) itemsChanged += 1;

      /**
       * The product's own rating, refreshed from the page we just read (2026-09-03).
       *
       * `tracked_product_metrics` is the sales-velocity proxy the brand audit leans on — a brand
       * owner cannot see anyone's unit sales, and the rate a product accumulates ratings is the
       * closest public signal — and it was fed only by the once-a-day catalogue sweep while this
       * job read the same number off the same page and threw it away. Feeding it here costs
       * nothing: the page is already in hand.
       *
       * Change-detected by `recordTrackedProductMetrics`, which writes only when the count
       * actually moved and never writes a `null`. Both writes are skipped entirely when the
       * source reports no product block at all — a source that does not state a rating (an
       * offers-only endpoint) must not be read as one stating zero.
       */
      const rating = snapshot.product;
      if (rating && rating.ratingCount !== null) {
        await trackedProductsRepo.recordTrackedProductMetrics(ctx.appDb, [
          {
            id: newId(),
            trackedProductId: product.id,
            observedAt: nowMs,
            ratingCount: rating.ratingCount,
            ratingAverage: rating.ratingAverage,
            // What is on the row *before* this write — the same comparison the sweep makes.
            previousRatingCount: product.ratingCount,
          },
        ]);
        await trackedProductsRepo.setTrackedProductRating(
          ctx.appDb,
          product.id,
          rating.ratingCount,
          rating.ratingAverage,
        );
      }

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
        error instanceof CompetitorSourceError && error.kind === 'parseFailed'
          ? 'parseFailed'
          : 'fetchFailed';
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
            // `hasPromotion: null`, not `false`: this row records that the page could not be
            // read, and `false` would state that it carried no promotion.
            sellerRating: null,
            dispatchTime: null,
            hasPromotion: null,
            promotionText: null,
            listingRef: null,
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
