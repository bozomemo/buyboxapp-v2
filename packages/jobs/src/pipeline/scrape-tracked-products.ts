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
 * Unlike `competitor_observations`, every successful look is written — no change-detection
 * hash, no separate `scrape_runs` proof-of-look row (see the doc comment on
 * `trackedProductObservations` in `schema/sqlite.ts` for why that is an acceptable
 * simplification here and not for the full catalogue).
 */
import type { MarketplaceCode } from '@buybox/core';
import { eventsRepo, newId, trackedProductsRepo } from '@buybox/db';
import { CompetitorSourceError, type ICompetitorSource } from '@buybox/adapters';
import type { JobContext } from '../job.js';

export interface ScrapeTrackedProductsResult {
  readonly itemsOk: number;
  readonly itemsFailed: number;
}

export async function scrapeTrackedProducts(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  source: ICompetitorSource,
): Promise<ScrapeTrackedProductsResult> {
  const nowMs = ctx.clock.nowMs();
  const products = await trackedProductsRepo.listTrackedProducts(ctx.appDb, { activeOnly: true });
  const due = products.filter((p) => p.marketplaceCode === marketplaceCode);

  let itemsOk = 0;
  let itemsFailed = 0;

  for (const product of due) {
    try {
      const snapshot = await source.fetchProductOffers({ url: product.productUrl, contentId: product.productRef });
      await trackedProductsRepo.insertTrackedProductObservations(
        ctx.appDb,
        snapshot.offers.map((offer) => ({
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
      );
      itemsOk += 1;
    } catch (error) {
      itemsFailed += 1;
      const status =
        error instanceof CompetitorSourceError && error.kind === 'parseFailed' ? 'parseFailed' : 'fetchFailed';
      await trackedProductsRepo.insertTrackedProductObservations(ctx.appDb, [
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
      ]);
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
    }
  }

  return { itemsOk, itemsFailed };
}
