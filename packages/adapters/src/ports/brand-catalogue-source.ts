/**
 * The **brand catalogue** port — enumerating every product a marketplace lists under a brand,
 * for the brand-owner audit module (api-references §1.7).
 *
 * Deliberately a third port, next to `IMarketplaceAdapter` (control) and `ICompetitorSource`
 * (per-product reporting), because it answers a different question with a different cost
 * profile. `ICompetitorSource` asks "who sells *this* product, and at what price?" — one page
 * per product, the expensive tier. This asks "what products exist under this brand?" — one page
 * per 24 products, measured at 887 products in 62 seconds for Whiskas and 4,863 in ~5.5 minutes
 * for Royal Canin (2026-08-27/28). Folding the two into one port would hide a thirty-fold cost
 * difference behind one method name.
 *
 * ⚠️ **Reporting only, like every other scraper in this package.** Nothing here may gate a
 * pricing decision: `Reprice` and `ObserveBuybox` read `listings`, and nothing this port
 * produces is ever written there. Disabling the sweep job must change nothing about repricing.
 *
 * Hard rule inherited from doc 10 §3: no sentinel ever escapes an implementation. Missing data
 * is `null` or a typed error — never `-1`, never `0` standing in for "unknown".
 */
import type { MarketplaceCode } from '@buybox/core';
import type { Money } from '@buybox/shared';

/**
 * How a brand is addressed on a marketplace.
 *
 * Both fields are carried, and both are used, because they answer different questions and the
 * **difference between their results is itself a finding** (product owner's decision,
 * 2026-08-28). `brandRef` is the marketplace's own brand id and returns the catalogue the
 * marketplace itself attributes to the brand. `searchTerm` is the free-text query and also
 * catches listings that merely carry the brand's name — which is how a product ends up
 * advertised as "Whiskas" under *Halı* or *Ahşap Boya & Vernik* (8 such rows in the 2026-08-27
 * Whiskas sweep). A brand owner wants to see exactly those.
 *
 * At least one must be non-null; an implementation raises `BrandCatalogueError` otherwise.
 */
export interface BrandCatalogueQuery {
  /** Trendyol `webBrands[].id` (e.g. `104703` for Whiskas). */
  readonly brandRef: string | null;
  /** Free-text query, e.g. `whiskas`. */
  readonly searchTerm: string | null;
}

export function hasBrandCatalogueQuery(query: BrandCatalogueQuery): boolean {
  return (
    (query.brandRef !== null && query.brandRef.trim() !== '') ||
    (query.searchTerm !== null && query.searchTerm.trim() !== '')
  );
}

/**
 * One product as the catalogue listing page describes it — the scraper-owned normalised shape.
 *
 * This is deliberately **not** a `CompetitorOffer`. A listing card carries exactly one seller
 * (whoever holds the buybox at that moment) and no seller list at all, so presenting it in the
 * offer vocabulary would invite a caller to read it as "the competition", which it is not.
 * `buyboxSellerRef` is the one seller fact here, and it is named for what it is.
 */
export interface BrandCatalogueProduct {
  /** Trendyol `contentId` — the same identity `ProductPageRef.contentId` carries. */
  readonly productRef: string;
  /** Site-relative or absolute product link, as the payload gave it. */
  readonly url: string | null;
  readonly name: string | null;
  readonly brandName: string | null;
  /** The marketplace's brand id for this product — may differ from the query's `brandRef`. */
  readonly brandRef: string | null;
  readonly categoryRef: string | null;
  readonly categoryName: string | null;
  /**
   * Number of ratings the product has. The single best proxy available for sales velocity, and
   * the basis of the "these have never been rated — drop them?" suggestion: 65% of the Whiskas
   * catalogue had none, against 5% of Royal Canin's, so the saving is per-brand and must be
   * computed, never assumed.
   */
  readonly ratingCount: number | null;
  readonly ratingAverage: number | null;
  /** The buybox price at the moment of the sweep. `null` when the card carried no numeric value. */
  readonly price: Money | null;
  /** Marketplace merchant id of the buybox holder. Never the seller name. */
  readonly buyboxSellerRef: string | null;
}

/**
 * Counters proving what the parser found, so a frontend change surfaces as a metric rather than
 * as a quietly shrinking catalogue (guide §33). Mirrors `ScrapeDiagnostics`' intent for a
 * different payload.
 */
export interface BrandCatalogueDiagnostics {
  readonly parserVersion: string;
  readonly stateFound: boolean;
  readonly dataFound: boolean;
  /** Cards present in the payload, before any were dropped for lacking an identity. */
  readonly rawCardCount: number;
  /** Cards dropped because they carried no `productRef` — an unusable row, counted not hidden. */
  readonly droppedCount: number;
}

export interface BrandCataloguePage {
  readonly marketplaceCode: MarketplaceCode;
  readonly query: BrandCatalogueQuery;
  /** 1-based, as the marketplace numbers its pages. */
  readonly pageIndex: number;
  /**
   * Total products the marketplace claims for this query, across all pages. `null` when the
   * payload did not state one. Treat as an estimate for progress reporting — it has been
   * observed to disagree slightly with the number of cards actually served.
   */
  readonly totalProducts: number | null;
  readonly products: readonly BrandCatalogueProduct[];
  readonly fetchedUrl: string;
  readonly observedAt: Date;
  readonly diagnostics: BrandCatalogueDiagnostics;
  readonly fromCache: boolean;
}

export type BrandCatalogueFailureKind = 'fetchFailed' | 'parseFailed';

export class BrandCatalogueError extends Error {
  constructor(
    message: string,
    readonly kind: BrandCatalogueFailureKind,
    override readonly cause?: unknown,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'BrandCatalogueError';
  }
}

export interface IBrandCatalogueSource {
  readonly code: MarketplaceCode;
  /**
   * Fetches one page of the brand's catalogue. Throws `BrandCatalogueError` — the caller
   * records the failure and moves on.
   *
   * **The end of the catalogue is a page with no products, not an error.** Trendyol answers
   * 404 past the last page (page 38 of 37 for Whiskas, page 210 of 203 for Royal Canin,
   * measured 2026-08-27/28), and an implementation must translate that into an empty page so
   * that a caller's paging loop terminates on data rather than on an exception. A genuine
   * fetch failure still throws.
   */
  fetchPage(query: BrandCatalogueQuery, pageIndex: number): Promise<BrandCataloguePage>;
  /** Releases any resource the implementation owns (e.g. a Playwright browser). */
  close?(): Promise<void>;
}
