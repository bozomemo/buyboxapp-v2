/**
 * `RescanTrackedProducts` — "bu ürünlere şimdi bak" (doc 06 §12.2).
 *
 * The tracked half of `ScrapeCompetitors` rotates through the catalogue on an hourly cadence at
 * 300 products a run, which on the live install is a full pass a little under every sixteen
 * hours (`SCRAPE_MAX_TRACKED_PER_RUN`). That is the right cost for a report nobody is watching.
 * It is the wrong answer to an operator who has just noticed one row and wants to know whether
 * the figure in front of them is still true — that person would otherwise wait most of a day,
 * or press the whole-marketplace scrape and wait for a two-hour pass over 4,679 rows to reach
 * their product.
 *
 * So this job exists, and it is deliberately the *same read* rather than a second one: it calls
 * `scrapeTrackedProducts` with an explicit id list, so change detection, seller registration,
 * the failure rows and `last_scraped_at` all behave exactly as they do on the cadence path. A
 * rescan is indistinguishable from a cadence look in the archive, which is the point — an
 * operator's curiosity must not put a differently-shaped row in the history.
 *
 * **Still reporting only** (CLAUDE.md, api-references §1.6/§1.7). It reads `tracked_products`,
 * never `listings`, so like the half it borrows there is no path from here to a pricing
 * decision. It is bounded by `RESCAN_MAX_PRODUCTS` for the same reason every other scrape path
 * is bounded: a button an operator can press must not be able to start a crawl.
 *
 * Not in `JOB_CATALOG`, on the same grounds as `ResolveSellerIdentity`: it has no cadence and no
 * runnable default payload — a rescan of nothing is not a run — so it is enqueued only from
 * `/api/tracked-products/rescan`, with the selection in its payload.
 */
import type { MarketplaceCode } from '@buybox/core';
import { z } from 'zod';
import { getCompetitorSource } from '../competitor-source-registry.js';
import type { JobContext, JobResult } from '../job.js';
import { scrapeTrackedProducts } from './scrape-tracked-products.js';

export const RESCAN_TRACKED_PRODUCTS_JOB = 'RescanTrackedProducts';

/**
 * Ceiling on one rescan.
 *
 * Fifty products at the conservative default scrape rate is a couple of minutes — long enough to
 * be worth watching on the Jobs screen, short enough that an operator gets an answer while they
 * still care. It is a *selection* cap, not a rotation cap like `SCRAPE_MAX_TRACKED_PER_RUN`:
 * nothing here comes back for the remainder on a later cycle, so the API refuses a larger
 * selection outright rather than silently reading part of it. Someone who wants a whole brand
 * re-read wants the cadence, or a sweep, not this button.
 */
export const RESCAN_MAX_PRODUCTS = 50;

export const RescanTrackedProductsPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  /**
   * One marketplace's worth of ids. A selection spanning both marketplaces is split into one job
   * per marketplace by the route that enqueues it, because the competitor source is per
   * marketplace and a run has exactly one.
   */
  trackedProductIds: z.array(z.string().min(1)).min(1).max(RESCAN_MAX_PRODUCTS),
});

export type RescanTrackedProductsPayload = z.infer<typeof RescanTrackedProductsPayloadSchema>;

export async function rescanTrackedProducts(ctx: JobContext): Promise<JobResult> {
  const payload = RescanTrackedProductsPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode: MarketplaceCode = payload.marketplaceCode;

  const source = getCompetitorSource(ctx.competitorSources, marketplaceCode);
  if (!source) {
    // Same posture as `scrapeCompetitors`: no configured source is a supported deployment, so
    // this is a no-op run carrying the reason, not a failure to retry.
    return {
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: `no competitor source registered for ${marketplaceCode} — nothing to re-read`,
    };
  }

  const result = await scrapeTrackedProducts(ctx, marketplaceCode, source, {
    onlyIds: payload.trackedProductIds,
    maxProducts: RESCAN_MAX_PRODUCTS,
  });

  // No `error`: individual page failures are counted and never fail the run, exactly as they do
  // on the cadence path (doc 07 §7, "per-failure silence").
  return {
    itemsTotal: result.itemsTotal,
    itemsOk: result.itemsOk,
    itemsFailed: result.itemsFailed,
  };
}
