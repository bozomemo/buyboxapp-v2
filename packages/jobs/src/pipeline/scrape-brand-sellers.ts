/**
 * `ScrapeBrandSellers` — read **every** product of one watched brand, one page at a time, until
 * the brand is finished (doc 07 §7.3, operator request 2026-09-08).
 *
 * The gap it closes: `SweepBrandCatalogue` answers "what products exist under this brand?" and
 * writes them to `tracked_products`, but it collects no seller, price or buybox data at all —
 * that is `ScrapeCompetitors`' tracked half, which rotates the *whole* catalogue at
 * `SCRAPE_MAX_TRACKED_PER_RUN` (300) products a cycle. A newly watched brand therefore appeared
 * complete on the brand screens while every one of its products still read "hiç bakılmadı", and
 * stayed that way until the rotation reached them — most of a day on the live install, and the
 * operator had no way to ask for sooner than that other than ticking fifty rows at a time
 * (`RescanTrackedProducts`, §7.1). This job is the "read this brand now, however long it takes"
 * answer, and it is the one scrape path with no per-run product ceiling worth the name.
 *
 * ```
 * loop:
 *     page = products of this brand not looked at since this run started   (50 at a time)
 *     if page is empty: done
 *     scrapeTrackedProducts(onlyIds = page)      ← the same read the cadence does
 * ```
 *
 * ## Why it is a loop over `scrapeTrackedProducts` and not a second implementation
 *
 * The same rule §7.1 follows: change detection, seller registration, rating capture, the failure
 * rows and `last_scraped_at` must behave exactly as they do on the cadence path, or an
 * operator's button puts a differently-shaped row in the archive. Everything specific to this
 * job is in *which* products it feeds that function and when it stops.
 *
 * ## Why the cursor is a timestamp and not an offset
 *
 * `recordTrackedProductLook` advances `last_scraped_at` on every look, success or failure. So
 * "products of this brand with `last_scraped_at` older than this run's start" shrinks by exactly
 * the page just read, with no offset to keep and nothing to go stale when the sweep adds rows
 * mid-run. Two things fall out of that for free:
 *
 * - **it terminates** — a product that fails is still marked as looked at, so a brand whose
 *   pages all 404 ends the run rather than cycling on them;
 * - **it resumes** — the watermark lives in the payload, so a retry after a worker restart
 *   picks up the remainder instead of re-reading the brand from the top. That is why this job
 *   keeps the default three attempts rather than the single attempt a rescan takes.
 *
 * ⚠️ **Reporting only**, on the same terms as the rest of doc 07 §7. It reads `tracked_products`
 * and never `listings`; there is no path from anything it writes to a pricing decision, and a
 * failed page is recorded and the walk continues.
 *
 * **Not in `JOB_CATALOG`**: no cadence, and no runnable default payload — a whole-brand scrape
 * of no brand is not a run. It is enqueued from `/api/watched-brands/[id]/sweep` (as the second
 * half of "Şimdi tara") and by `SweepBrandCatalogue` itself when its payload asks for it, and it
 * is still *registered* with the scheduler or `claimNextJob` would leave its rows `ready` for
 * ever.
 */
import type { MarketplaceCode } from '@buybox/core';
import { eventsRepo, newId, trackedProductsRepo, watchedBrandsRepo } from '@buybox/db';
import { z } from 'zod';
import { getCompetitorSource } from '../competitor-source-registry.js';
import type { JobContext, JobResult } from '../job.js';
import { SCRAPE_BRAND_SELLERS_CHUNK, SCRAPE_BRAND_SELLERS_MAX_PRODUCTS } from '../scrape-config.js';
import { scrapeTrackedProducts } from './scrape-tracked-products.js';

export const SCRAPE_BRAND_SELLERS_JOB = 'ScrapeBrandSellers';

export const ScrapeBrandSellersPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  watchedBrandId: z.string().min(1),
  /**
   * The resume watermark: products already looked at at or after this instant are done.
   *
   * Set by whoever enqueues the job, not by the handler, and deliberately so — a handler that
   * stamped it at `nowMs` would restart the whole brand on every retry, which is the one thing
   * a run measured in hours must not do. Omitted (a direct enqueue by hand) means "read the
   * whole brand", which the handler expresses by stamping its own start.
   */
  notScrapedSinceMs: z.number().int().nonnegative().optional(),
  /** Runaway guard; see `SCRAPE_BRAND_SELLERS_MAX_PRODUCTS`. Overridable for tests. */
  maxProducts: z.number().int().min(1).default(SCRAPE_BRAND_SELLERS_MAX_PRODUCTS),
  /** Products per database page and per `scrapeTrackedProducts` call. */
  chunkSize: z.number().int().min(1).default(SCRAPE_BRAND_SELLERS_CHUNK),
});

export type ScrapeBrandSellersPayload = z.infer<typeof ScrapeBrandSellersPayloadSchema>;

export async function scrapeBrandSellers(ctx: JobContext): Promise<JobResult> {
  const payload = ScrapeBrandSellersPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode = payload.marketplaceCode as MarketplaceCode;

  const source = getCompetitorSource(ctx.competitorSources, marketplaceCode);
  if (!source) {
    // A marketplace with no competitor source is a supported deployment, not a failure — the
    // same posture `scrapeCompetitors` and `rescanTrackedProducts` take.
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }

  const brand = await watchedBrandsRepo.getWatchedBrand(ctx.appDb, payload.watchedBrandId);
  if (!brand || brand.marketplaceCode !== marketplaceCode) {
    // The brand was removed between the enqueue and the claim. Nothing to read, and nothing
    // worth retrying — an absent brand will not come back on the next attempt.
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }

  const notScrapedSinceMs = payload.notScrapedSinceMs ?? ctx.clock.nowMs();
  const cursor = {
    marketplaceCode,
    watchedBrandId: brand.id,
    notScrapedSinceMs,
  };

  // Read once, before the walk. See `countBrandProductsToScrape`: a total re-read per page
  // would shrink as the run consumed it and drive the progress bar backwards.
  const remaining = await trackedProductsRepo.countBrandProductsToScrape(ctx.appDb, cursor);
  const itemsTotal = Math.min(remaining, payload.maxProducts);

  let itemsOk = 0;
  let itemsFailed = 0;
  let itemsChanged = 0;
  let processed = 0;
  let truncated = false;

  while (processed < payload.maxProducts) {
    const page = await trackedProductsRepo.listBrandProductsToScrape(ctx.appDb, {
      ...cursor,
      limit: Math.min(payload.chunkSize, payload.maxProducts - processed),
    });
    if (page.length === 0) break;

    const result = await scrapeTrackedProducts(ctx, marketplaceCode, source, {
      onlyIds: page.map((product) => product.id),
      maxProducts: page.length,
      // One counter across every chunk, for the reason the two halves of `ScrapeCompetitors`
      // share one: a per-chunk counter restarting at zero leaves the Jobs screen's bar jumping
      // back to the start every fifty products for the hours this run takes.
      progressOffset: processed,
    });

    itemsOk += result.itemsOk;
    itemsFailed += result.itemsFailed;
    itemsChanged += result.itemsChanged;
    processed += result.itemsTotal;

    /**
     * A whole chunk with nothing to show for it means the source is gone, not the page.
     *
     * `scrapeTrackedProducts` already breaks its own chunk at
     * `SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT` and logs `TrackedProductsScrapeHalted`; that
     * guard protects a 300-product cadence run, and would otherwise be re-entered fifty
     * products at a time here, for the whole remaining catalogue — the exact failure the
     * constant was written for (a headless browser that died mid-run), just paced differently.
     * Stopping costs nothing: the products not reached keep their old `last_scraped_at`, so
     * they are first in the cadence rotation and first in a re-press of this button.
     */
    if (result.itemsOk === 0 && result.itemsFailed > 0) {
      await noteBrandSellersEvent(
        ctx,
        marketplaceCode,
        'BrandSellerScrapeHalted',
        `${brand.label} · whole-brand seller scrape stopped at ${processed}/${itemsTotal} — a full chunk of ${result.itemsTotal} products failed, the source looks unavailable; the rest keep their place in the rotation`,
      );
      return { itemsTotal, itemsOk, itemsFailed };
    }

    if (result.itemsTotal === 0) {
      /**
       * A page came back but nothing in it was read — only reachable if a row vanished between
       * the two queries, or if `last_scraped_at` stopped advancing. Either way the loop would
       * not make progress, so it stops rather than spinning on the same page.
       */
      truncated = true;
      break;
    }
  }

  if (processed >= payload.maxProducts) truncated = true;

  if (truncated) {
    // Recorded, never swallowed, on the same grounds as `BrandSweepTruncated`: a brand read to
    // its ceiling and a brand read to its end are indistinguishable in the resulting data.
    await noteBrandSellersEvent(
      ctx,
      marketplaceCode,
      'BrandSellerScrapeTruncated',
      `${brand.label} · whole-brand seller scrape stopped at the ${payload.maxProducts}-product ceiling — some products were not read`,
    );
  }

  await noteBrandSellersEvent(
    ctx,
    marketplaceCode,
    'BrandSellerScrapeFinished',
    `${brand.label} · ${processed} products read (${itemsOk} ok, ${itemsFailed} failed, ${itemsChanged} changed)`,
    'info',
  );

  return { itemsTotal, itemsOk, itemsFailed };
}

/**
 * Records an event and swallows any failure to do so — the same rule, for the same reason, as
 * `noteSweepEvent` in `sweep-brand-catalogue.ts`: `app_events.job_run_id` is a foreign key to
 * `job_runs`, and losing hours of completed scraping to a failed log line would invert the
 * priority between the work and the note about it.
 */
async function noteBrandSellersEvent(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  code: string,
  message: string,
  level: 'info' | 'warn' = 'warn',
): Promise<void> {
  try {
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: ctx.clock.nowMs(),
      level,
      marketplaceCode,
      listingId: null,
      jobRunId: ctx.correlationId,
      code,
      message,
      context: null,
    });
  } catch {
    // Deliberately silent: see the doc comment.
  }
}
