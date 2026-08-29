/**
 * `SweepBrandCatalogue` — enumerates every product a marketplace lists under each watched
 * brand, and writes them to `tracked_products` (api-references §1.7, doc 06).
 *
 * ```
 * for each active watched brand on this marketplace:
 *     for each of its two selectors (brand id, search term):
 *         page until a page comes back empty
 *     union the two results, flagging which selector(s) found each product
 *     upsert into tracked_products
 *     record the sweep on the watched brand
 * ```
 *
 * ⚠️ **Reporting only.** `Reprice` and `ObserveBuybox` read `listings`; nothing here writes
 * there. Turning this job off leaves repricing entirely unaffected, and it ships disabled for
 * the same reason `ScrapeCompetitors` does — scraping is an explicit business decision
 * (api-references §1.6).
 *
 * ## Why both selectors are always swept
 *
 * A watched brand carries a marketplace brand id *and* a search term, and this job runs both
 * even though they mostly return the same products. For Whiskas both returned 887, but the
 * search side included 8 rows in categories like *Halı* and *Ahşap Boya & Vernik* — products
 * carrying the brand's name that the marketplace does not attribute to the brand. That
 * difference is the brand-abuse signal the audit exists to surface, so neither selector is
 * allowed to be "the" one and the per-product `viaBrandRef` / `viaSearchTerm` flags record
 * which found what.
 *
 * ⚠️ **The comparison is only as good as the passes are complete.** A pass that misses a
 * product writes it as found by the *other* selector, which for `viaSearchTerm` alone is the
 * misuse finding itself. Trendyol's relevance ordering is recomputed per request and made deep
 * paging lose 18% of a large brand until `sst` was pinned (api-references §1.7, 2026-08-29);
 * every one of the 208 rows that flagged for Royal Canin was a paging artefact. Hence
 * `noteIncompleteSweep` below: a pass that ends short of the marketplace's own count is
 * recorded, because its flags are not evidence.
 *
 * ## Why paging stops on data, not on a count
 *
 * `totalProducts` is the marketplace's own claim and has been measured to disagree slightly
 * with the number of cards actually served. The loop therefore runs until a page comes back
 * empty — which is what the source returns for the 404 Trendyol answers past the last page
 * (page 38 of Whiskas' 37, page 210 of Royal Canin's 203, measured 2026-08-27/28). `maxPages`
 * is a runaway guard, not the expected exit.
 */
import type { BrandCatalogueProduct, BrandCatalogueQuery, IBrandCatalogueSource } from '@buybox/adapters';
import { BrandCatalogueError } from '@buybox/adapters';
import type { MarketplaceCode } from '@buybox/core';
import { eventsRepo, newId, trackedProductsRepo, watchedBrandsRepo } from '@buybox/db';
import { z } from 'zod';
import { getBrandCatalogueSource } from '../brand-catalogue-source-registry.js';
import type { JobContext, JobResult } from '../job.js';

export const SWEEP_BRAND_CATALOGUE_JOB = 'SweepBrandCatalogue';

/**
 * A ceiling on pages per selector, not a target.
 *
 * 400 is roughly twice Royal Canin's measured 203 pages — comfortably above the largest brand
 * seen, and still low enough that a frontend change which stopped returning empty pages costs
 * one job run rather than an unbounded crawl. Hitting it is recorded as a truncated sweep,
 * never silently accepted, because a silently truncated catalogue looks exactly like a brand
 * that shrank.
 */
export const SWEEP_MAX_PAGES_PER_SELECTOR = 400;

/**
 * How far under the marketplace's own `total` a selector may land before the sweep is called
 * incomplete.
 *
 * Not zero: `total` is Trendyol's claim and has been measured to drift by a handful of products
 * against the cards actually served, and a brand really does gain and lose listings during the
 * minutes a sweep takes. 2% is comfortably above that and far below the 18% a lossy pass
 * produced (api-references §1.7).
 */
export const SWEEP_COMPLETENESS_TOLERANCE = 0.02;

export const SweepBrandCataloguePayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  /** Restrict the run to one brand — what the "Şimdi tara" button on a brand sends. */
  watchedBrandId: z.string().optional(),
  maxPagesPerSelector: z.number().int().min(1).default(SWEEP_MAX_PAGES_PER_SELECTOR),
});

export type SweepBrandCataloguePayload = z.infer<typeof SweepBrandCataloguePayloadSchema>;

interface SelectorSweep {
  readonly products: readonly BrandCatalogueProduct[];
  readonly totalProducts: number | null;
  readonly pagesFetched: number;
  readonly truncated: boolean;
}

/**
 * Pages one selector to exhaustion.
 *
 * @throws {BrandCatalogueError} — the caller decides what a failed selector means for the
 * brand as a whole. It never escalates past that: a sweep failure must not fail the job.
 */
export async function sweepSelector(
  source: IBrandCatalogueSource,
  query: BrandCatalogueQuery,
  maxPages: number,
  onPage?: (pageIndex: number, running: number) => void,
): Promise<SelectorSweep> {
  const products: BrandCatalogueProduct[] = [];
  let totalProducts: number | null = null;
  let pagesFetched = 0;

  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
    const page = await source.fetchPage(query, pageIndex);
    pagesFetched += 1;
    if (totalProducts === null) totalProducts = page.totalProducts;
    if (page.products.length === 0) {
      return { products, totalProducts, pagesFetched, truncated: false };
    }
    products.push(...page.products);
    onPage?.(pageIndex, products.length);
  }
  return { products, totalProducts, pagesFetched, truncated: true };
}

/**
 * Merges the two selectors' results into one row per product, carrying which selector(s) found
 * it. The brand-id pass wins on field values where both saw the product — arbitrary, since the
 * payload is the same shape either way, but fixed so the result does not depend on ordering.
 */
export function mergeSelectorResults(
  fromBrandRef: readonly BrandCatalogueProduct[],
  fromSearchTerm: readonly BrandCatalogueProduct[],
): { readonly product: BrandCatalogueProduct; readonly viaBrandRef: boolean; readonly viaSearchTerm: boolean }[] {
  const merged = new Map<
    string,
    { product: BrandCatalogueProduct; viaBrandRef: boolean; viaSearchTerm: boolean }
  >();
  for (const product of fromSearchTerm) {
    merged.set(product.productRef, { product, viaBrandRef: false, viaSearchTerm: true });
  }
  for (const product of fromBrandRef) {
    const existing = merged.get(product.productRef);
    merged.set(product.productRef, {
      product,
      viaBrandRef: true,
      viaSearchTerm: existing?.viaSearchTerm ?? false,
    });
  }
  return [...merged.values()];
}

/**
 * Describes a selector pass that ended short of the marketplace's own product count.
 *
 * Returns `null` when the marketplace made no claim (`totalProducts` is `null`, which is what a
 * brand with no pages at all looks like) — an unmade claim cannot be missed.
 */
export function completenessShortfall(
  selector: string,
  sweep: SelectorSweep,
): { readonly selector: string; readonly seen: number; readonly claimed: number } | null {
  const claimed = sweep.totalProducts;
  if (claimed === null || claimed <= 0) return null;
  // Distinct, not `products.length`: a lossy pass serves the same product on several pages, so
  // the raw card count can reach `total` while the catalogue behind it has holes.
  const seen = new Set(sweep.products.map((product) => product.productRef)).size;
  if (seen >= claimed * (1 - SWEEP_COMPLETENESS_TOLERANCE)) return null;
  return { selector, seen, claimed };
}

async function sweepOneBrand(
  ctx: JobContext,
  source: IBrandCatalogueSource,
  brand: watchedBrandsRepo.WatchedBrandRow,
  maxPages: number,
  reportProgress: (currentItem: string) => void,
): Promise<{
  readonly productCount: number;
  readonly truncated: boolean;
  readonly incomplete: readonly { readonly selector: string; readonly seen: number; readonly claimed: number }[];
}> {
  const nowMs = ctx.clock.nowMs();

  const hasBrandRef = brand.brandRef !== null && brand.brandRef.trim() !== '';
  const hasSearchTerm = brand.searchTerm !== null && brand.searchTerm.trim() !== '';

  let byBrandRef: SelectorSweep = { products: [], totalProducts: null, pagesFetched: 0, truncated: false };
  let bySearchTerm: SelectorSweep = { products: [], totalProducts: null, pagesFetched: 0, truncated: false };

  if (hasBrandRef) {
    byBrandRef = await sweepSelector(
      source,
      { brandRef: brand.brandRef, searchTerm: null },
      maxPages,
      (_page, running) => reportProgress(`${brand.label} · marka id · ${running} ürün`),
    );
  }
  if (hasSearchTerm) {
    bySearchTerm = await sweepSelector(
      source,
      { brandRef: null, searchTerm: brand.searchTerm },
      maxPages,
      (_page, running) => reportProgress(`${brand.label} · arama · ${running} ürün`),
    );
  }

  const merged = mergeSelectorResults(byBrandRef.products, bySearchTerm.products);

  // Read the rating counts this sweep is about to overwrite. The rating history is
  // change-detected (`recordTrackedProductMetrics`), and `tracked_products.rating_count` is
  // where the previous value already lives — so the comparison costs one bounded read here
  // rather than a query against the history table per product.
  const before = await trackedProductsRepo.findTrackedProductsByRefs(
    ctx.appDb,
    brand.marketplaceCode,
    merged.map(({ product }) => product.productRef),
  );

  await trackedProductsRepo.upsertSweptProducts(
    ctx.appDb,
    merged.map(({ product, viaBrandRef, viaSearchTerm }) => ({
      id: newId(),
      marketplaceCode: brand.marketplaceCode,
      productRef: product.productRef,
      // The card's link is site-relative; the source's base URL is not this job's to know, so
      // it is stored exactly as the payload gave it and resolved where it is used.
      productUrl: product.url ?? '',
      // The sweep's starting label only — never overwritten on a later sweep, so an operator's
      // own rename survives (see `upsertSweptProducts`).
      label: product.name ?? product.productRef,
      watchedBrandId: brand.id,
      viaBrandRef,
      viaSearchTerm,
      brandName: product.brandName,
      brandRef: product.brandRef,
      categoryRef: product.categoryRef,
      categoryName: product.categoryName,
      ratingCount: product.ratingCount,
      ratingAverage: product.ratingAverage,
      sweptAt: nowMs,
    })),
  );

  // Read back to resolve ids: `upsertSweptProducts` generates one for a new row and keeps the
  // existing one for a row already present, and no dialect this project supports can return
  // that portably (MySQL has no RETURNING). The history needs the id, so it is looked up.
  const after = await trackedProductsRepo.findTrackedProductsByRefs(
    ctx.appDb,
    brand.marketplaceCode,
    merged.map(({ product }) => product.productRef),
  );

  await trackedProductsRepo.recordTrackedProductMetrics(
    ctx.appDb,
    merged.flatMap(({ product }) => {
      const row = after.get(product.productRef);
      if (row === undefined) return [];
      return [
        {
          id: newId(),
          trackedProductId: row.id,
          observedAt: nowMs,
          ratingCount: product.ratingCount,
          ratingAverage: product.ratingAverage,
          // `undefined` for a product this sweep saw for the first time, which is what makes
          // its first reading a written sample rather than a comparison against nothing.
          previousRatingCount: before.get(product.productRef)?.ratingCount,
        },
      ];
    }),
  );

  // Only after the products are safely written: the recorded count must describe data that is
  // actually in the table, or the list screen reports a catalogue that was never stored.
  await watchedBrandsRepo.recordSweepResult(ctx.appDb, brand.id, nowMs, merged.length);

  const incomplete = [
    hasBrandRef ? completenessShortfall('marka id', byBrandRef) : null,
    hasSearchTerm ? completenessShortfall('arama', bySearchTerm) : null,
  ].filter((entry) => entry !== null);

  return {
    productCount: merged.length,
    truncated: byBrandRef.truncated || bySearchTerm.truncated,
    incomplete,
  };
}

/**
 * Records a sweep event, and swallows any failure to do so.
 *
 * `app_events.job_run_id` is a foreign key to `job_runs`, so a correlation id that does not
 * correspond to a run row — a direct invocation, a run whose row was pruned mid-flight — makes
 * the insert fail. That is a logging problem, and losing an entire completed sweep to one would
 * invert the priority: the catalogue is the work, the event is the note about it. This is the
 * same rule the rest of the reporting path follows — a failure here never escalates (doc 07 §7).
 */
async function noteSweepEvent(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  code: string,
  message: string,
): Promise<void> {
  try {
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: ctx.clock.nowMs(),
      level: 'warn',
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

export async function sweepBrandCatalogue(ctx: JobContext): Promise<JobResult> {
  const payload = SweepBrandCataloguePayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode = payload.marketplaceCode as MarketplaceCode;

  const source = getBrandCatalogueSource(ctx.brandCatalogueSources, marketplaceCode);
  if (!source) {
    // A marketplace with no catalogue source is a supported configuration, not a failure —
    // the same rule `ScrapeCompetitors` follows for a missing competitor source.
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }

  const all = await watchedBrandsRepo.listWatchedBrands(ctx.appDb, { activeOnly: true });
  const due = all.filter(
    (brand) =>
      brand.marketplaceCode === marketplaceCode &&
      (payload.watchedBrandId === undefined || brand.id === payload.watchedBrandId),
  );

  let itemsOk = 0;
  let itemsFailed = 0;
  let done = 0;

  for (const brand of due) {
    try {
      const { productCount, truncated, incomplete } = await sweepOneBrand(
        ctx,
        source,
        brand,
        payload.maxPagesPerSelector,
        (currentItem) => ctx.reportProgress({ done, total: due.length, currentItem }),
      );
      itemsOk += 1;
      if (truncated) {
        // Recorded, never swallowed: a truncated sweep and a shrinking brand look identical in
        // the resulting data, and only this event distinguishes them.
        await noteSweepEvent(
          ctx,
          marketplaceCode,
          'BrandSweepTruncated',
          `${brand.label} sweep hit the ${payload.maxPagesPerSelector}-page ceiling — the catalogue may be incomplete`,
        );
      }
      for (const { selector, seen, claimed } of incomplete) {
        // Recorded rather than failed: an incomplete catalogue is still worth having, but its
        // `via_*` flags are not a brand-misuse finding and an operator has to be able to tell.
        await noteSweepEvent(
          ctx,
          marketplaceCode,
          'BrandSweepIncomplete',
          `${brand.label} · ${selector} returned ${seen} of the ${claimed} products the marketplace claims — treat this sweep's selector flags as unreliable`,
        );
      }
      void productCount;
    } catch (error) {
      // Per-brand failures are counted, never thrown: one brand's bad page must not fail the
      // run and make the queue retry every other brand's sweep with it (doc 07 §7).
      itemsFailed += 1;
      const reason =
        error instanceof BrandCatalogueError
          ? `${error.kind}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      await noteSweepEvent(
        ctx,
        marketplaceCode,
        'BrandSweepFailed',
        `${brand.label} sweep failed: ${reason} — repricing is unaffected`,
      );
    }
    done += 1;
    ctx.reportProgress({ done, total: due.length, currentItem: null });
  }

  return { itemsTotal: due.length, itemsOk, itemsFailed };
}
