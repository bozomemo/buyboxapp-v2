/**
 * Reading tracked products (doc 06 §12.2, customer feedback 2026-08-25) — marketplace products
 * we do **not** sell, watched for price and rank only.
 *
 * This is the shared read, not a job: `SweepTrackedProducts` (doc 07 §7.4), `ScrapeBrandSellers`
 * (§7.3) and `RescanTrackedProducts` (§7.1) all call it with a list of ids they chose themselves.
 * Scheduling differs between them; what a look *writes* must not, or the same product would land
 * in the archive differently depending on who asked for it.
 *
 * Deliberately reading a separate table (`tracked_products`), never `listings`. `Reprice` and
 * `ObserveBuybox` (doc 07 §2.1/§2.2) only ever query `listings`, so nothing here can structurally
 * reach a pricing decision — there is no flag to check because there is no listing row for that
 * code to see.
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
import { SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT } from '../scrape-config.js';

/**
 * The statuses that mean **the product is gone**, not that the look failed.
 *
 * 404 is "no such product page"; 410 is the marketplace going out of its way to say it existed
 * and has been withdrawn. Either way every future look will say the same thing, and until now
 * that is exactly what happened: the production event log carries one 410 product
 * (`…kedi-mamasi-5-4-kg-p-793542803`) failing once an hour for two days, and two 404s beside it,
 * each spending a rate-limit token and writing a failure row to be told again.
 *
 * Deliberately these two and nothing else. A 503 is the server saying "not now" (retried in the
 * source), a timeout is our own machine, a `parseFailed` is a page we *did* reach — none of them
 * is evidence about whether the product exists, and acting on them would quietly retire products
 * over a bad afternoon on the operator's link.
 */
const GONE_HTTP_STATUSES: ReadonlySet<number> = new Set([404, 410]);

function isGone(error: unknown): boolean {
  return (
    error instanceof CompetitorSourceError &&
    error.httpStatus !== undefined &&
    GONE_HTTP_STATUSES.has(error.httpStatus)
  );
}
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
   * How many products this call actually intended to read — the ids it was given that still
   * exist on this marketplace. A caller walking a catalogue in chunks reports the *pass's* total
   * instead (`progressTotal`), so the screens say "1.240 / 4.679" rather than claiming the
   * catalogue is one chunk long.
   */
  readonly itemsTotal: number;
  /**
   * How many of those products the operator deleted while the run was reading them.
   *
   * Reported rather than folded into either other count, because it is the one figure that
   * explains an arithmetic the caller would otherwise have to call a bug: from 2026-09-12
   * `itemsOk + itemsFailed` can be **less** than `itemsTotal`, and a removed product is a row
   * that stopped existing, not a look that succeeded and not a look that failed.
   */
  readonly itemsRemoved: number;
}

/**
 * The candidates: the ids the caller named, in the order they were given.
 *
 * **Every caller names its own ids** — the operator's rescan selection, a brand walk's page, a
 * sweep pass's chunk — and that is deliberate: choosing what to read next is a scheduling
 * decision, and each of those three schedules differently (a ticked selection, a brand cursor, a
 * rotation-ordered pass). This function's job is to read what it is handed, identically in all
 * three cases, so a look is indistinguishable in the archive whoever asked for it.
 *
 * Fetched one at a time rather than by filtering `listTrackedProducts`, because a chunk is a
 * hundred rows at most and that call reads the whole table — 4,679 rows on the live install. Ids
 * that no longer exist, or that belong to another marketplace, are dropped silently: the row may
 * have been removed between the decision and the run, and there is nothing to look at.
 */
async function selectedProducts(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  ids: readonly string[],
): Promise<trackedProductsRepo.TrackedProductRow[]> {
  const rows: trackedProductsRepo.TrackedProductRow[] = [];
  for (const id of ids) {
    const row = await trackedProductsRepo.getTrackedProduct(ctx.appDb, id);
    if (row && row.marketplaceCode === marketplaceCode) rows.push(row);
  }
  return rows;
}

export interface ScrapeTrackedProductsOptions {
  /**
   * Read **exactly these products**, in the order given.
   *
   * There is no other candidate path: `is_active`, freshness and priority are decided by the
   * caller that built this list (doc 07 §7.4's pass, §7.3's brand walk, §7.1's rescan), and
   * `is_active` in particular is deliberately **not** re-checked here. Pausing a product means
   * "the sweep should skip it", which the sweep's own query honours; an operator who ticked that
   * row and pressed the button has said something more specific than the flag does.
   *
   * Everything else — change detection, seller registration, the failure rows, the consecutive
   * failure limit — is identical whoever asked, so a rescan writes exactly what a pass look writes.
   */
  readonly ids: readonly string[];
  /**
   * How many items the caller has already reported progress for, so a walk made of many chunks
   * reports one continuous counter instead of restarting it at zero every chunk — which, before
   * this existed, left the Jobs screen's bar jumping back to the start every fifty products for
   * the hours a whole-brand run takes.
   */
  readonly progressOffset?: number;
  /**
   * The denominator to report, when the caller's unit of work is larger than this call's.
   *
   * A sweep pass reads a hundred products at a time but is *about* the whole catalogue, and the
   * operator watching the Jobs screen is asking how far through the catalogue the system is —
   * "1.240 / 4.679", not "40 / 100" forty-seven times. Defaults to the caller's offset plus this
   * chunk, which is what a single-chunk caller means.
   */
  readonly progressTotal?: number;
  /**
   * How many products to read at once. Defaults to 1 — serial, as every caller was before
   * 2026-09-12.
   *
   * Only the sweep raises it (`SCRAPE_TRACKED_CONCURRENCY`), and only because the request rate it
   * is allowed has always exceeded the rate one Chromium page can deliver. It changes no
   * per-product behaviour: the rate limiter inside the source is shared and still the ceiling,
   * and each product's writes happen when that product finishes.
   */
  readonly concurrency?: number;
}

export async function scrapeTrackedProducts(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  source: ICompetitorSource,
  options: ScrapeTrackedProductsOptions,
): Promise<ScrapeTrackedProductsResult> {
  const progressOffset = options.progressOffset ?? 0;
  const progressTotal = options.progressTotal;

  const due = await selectedProducts(ctx, marketplaceCode, options.ids);

  let itemsOk = 0;
  let itemsFailed = 0;
  let itemsChanged = 0;
  let consecutiveFailures = 0;
  let itemsRemoved = 0;
  let processed = 0;
  /** Set once the consecutive-failure guard fires: no further product is started. */
  let halted = false;

  /**
   * Reads one product. Extracted from the loop so several can be in flight at once — see
   * `runConcurrently` below — and deliberately doing all of its own bookkeeping: every counter
   * it touches is incremented when *that* product finishes, not when it was scheduled.
   */
  async function readOne(product: trackedProductsRepo.TrackedProductRow): Promise<void> {
    /**
     * Stamped per product, not once per run (fixed 2026-09-12).
     *
     * `observed_at` is the time we looked, and a pass now walks a whole catalogue for hours. One
     * timestamp taken at the top of the run would file the four-thousandth product's offers under
     * the moment the first one was read — a price series whose points are all wrong by up to the
     * length of a pass, in the one table the brand reports date their findings from.
     */
    const nowMs = ctx.clock.nowMs();

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
      /**
       * The operator deleted this row while the run was working (2026-09-12).
       *
       * Skipped outright: there is no row to write a look against, nothing to count — a product
       * that no longer exists is neither a success nor a failure — and above all nothing worth
       * abandoning the rest of the run for. A whole-brand run takes hours, so an operator
       * tidying dead products out of the list screen while it walks past them is ordinary use;
       * before this it killed the job (`TrackedProductRemovedError`'s doc comment records the
       * production incident).
       *
       * Deliberately not counted towards `consecutiveFailures` either, for the same reason a
       * `gone` product is not: that counter asks whether the *source* has stopped answering, and
       * a row the operator removed says nothing at all about Trendyol.
       */
      if (error instanceof trackedProductsRepo.TrackedProductRemovedError) {
        itemsRemoved += 1;
        return;
      }

      const gone = isGone(error);
      const status =
        error instanceof CompetitorSourceError && error.kind === 'parseFailed'
          ? 'parseFailed'
          : 'fetchFailed';
      /**
       * `offersHash: null` — the failure row is always stored, and the stored hash is left
       * alone. Clearing it would make the next successful look read as a change and store a
       * duplicate offer set, turning every transient network error into a fake price event.
       *
       * Guarded by its own `try` because **this** write can hit the removal race too, and did:
       * the failure row is written from inside a `catch`, so before 2026-09-12 a product the
       * operator deleted between the failed read and the note about it threw out of the handler
       * and took the job with it — the one place where a second failure was fatal rather than
       * recorded. Nothing to write the row against now, so the product is skipped exactly as
       * above, and the failure is not counted either: what the run learned about it is gone with
       * the row.
       */
      try {
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
      } catch (writeError) {
        if (!(writeError instanceof trackedProductsRepo.TrackedProductRemovedError)) throw writeError;
        itemsRemoved += 1;
        return;
      }

      // A `gone` product is an answer, not a failed read: the marketplace said the page no longer
      // exists, and the product is deactivated below. Counted as failed until 2026-09-25, a pass
      // over a catalogue with withdrawn products showed "14 okunamadı" of 60 on the Jobs screen
      // and fed the failure-rate alert with pages that had been read perfectly well.
      if (gone) itemsOk += 1;
      else itemsFailed += 1;
      // A `gone` product does **not** count towards the halt below either. That counter asks "has the
      // source stopped answering", and a marketplace that answered 404 has answered — halting a
      // run over a handful of withdrawn products would strand every product behind them.
      consecutiveFailures = gone ? 0 : consecutiveFailures + 1;
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

      /**
       * The page is gone, not the source (2026-09-11).
       *
       * Deactivated rather than deleted, exactly as the dead-product suggestion does
       * (`setTrackedProductsActive`): the row and its whole observation history stay, and a
       * brand report that covers last month still has the seller and price series for a product
       * that has since left the marketplace. What stops is the cadence — `rotatedProducts` reads
       * `activeOnly`, so the hourly rotation lets it go and spends the budget on products that
       * can still answer.
       *
       * Reversible in two ways, both of which matter because a marketplace can un-withdraw a
       * page: the operator can reactivate the row from the list screen, and a rescan
       * (`onlyIds`) deliberately ignores `is_active` — an operator who ticks the row and presses
       * the button has said something more specific than the flag does, so the product is looked
       * at again and, if it answers, simply stops failing.
       *
       * `warn`, not `debug`: unlike the per-failure silence above this is the system changing
       * what it watches on its own, and the operator has to be able to find out why a product
       * stopped updating.
       */
      if (gone) {
        await trackedProductsRepo.setTrackedProductsActive(ctx.appDb, [product.id], false);
        await eventsRepo.logEvent(ctx.appDb, {
          id: newId(),
          at: nowMs,
          level: 'warn',
          marketplaceCode,
          listingId: null,
          jobRunId: ctx.correlationId,
          code: 'TrackedProductGone',
          message: `Tracked product ${product.id} (${product.label}) was deactivated: the marketplace answered ${error instanceof CompetitorSourceError ? error.httpStatus : '?'} — the product page no longer exists. History is kept; reactivate the row or rescan it if it comes back.`,
          context: JSON.stringify({
            httpStatus: error instanceof CompetitorSourceError ? error.httpStatus : null,
            productRef: product.productRef,
          }),
        });
      }

      // The source is gone, not the page — see the constant's doc comment. Logged at `warn`
      // rather than `debug` on purpose: this is the one scraping condition an operator has to
      // act on, and it is otherwise invisible behind the per-failure silence above.
      if (consecutiveFailures >= SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT && !halted) {
        halted = true;
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
      }
    }
  }

  /**
   * Runs `readOne` over the candidates `concurrency` at a time.
   *
   * A shared index rather than fixed slices: page load times differ by an order of magnitude
   * between products, and slicing would leave two workers idle while the third finished the slow
   * half of the catalogue. Each worker takes the next product the moment it is free.
   *
   * `readOne` never rejects — every failure path inside it is recorded and swallowed, exactly as
   * the serial loop's was — so one product cannot take the others down with it, and there is no
   * `Promise.all` rejection to race.
   */
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, due.length));
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        if (halted) return;
        const index = next;
        next += 1;
        const product = due[index];
        if (!product) return;
        // Before the fetch, like the listings half: on a rate-limited scrape the wait *is* most
        // of the elapsed time, and the operator is watching to see which page it is waiting on.
        // `processed` counts products *started*, so with several in flight the figure leads the
        // completed count by at most `concurrency` — the alternative, reporting on completion,
        // would leave the current item naming a page already finished.
        ctx.reportProgress({
          done: progressOffset + processed,
          total: progressTotal ?? progressOffset + due.length,
          currentItem: product.label,
        });
        processed += 1;
        await readOne(product);
      }
    }),
  );

  return { itemsOk, itemsFailed, itemsChanged, itemsRemoved, itemsTotal: due.length };
}
