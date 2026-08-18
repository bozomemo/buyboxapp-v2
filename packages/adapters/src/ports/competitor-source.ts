/**
 * The **reporting** competitor port (doc 10 §5.1, doc 07 §7, api-references §1.6).
 *
 * Deliberately a separate port from `IMarketplaceAdapter`. The marketplace adapter is the
 * control path: its failure stops repricing and trips a circuit breaker. This port is the
 * reporting path: seller names, ratings, stock and the full seller list, none of which any
 * pricing decision may depend on. Keeping them apart at the type level is what makes doc 12
 * Phase 7's definition of done — "disabling the scraper entirely leaves repricing fully
 * functional" — structurally true rather than a convention someone has to remember.
 *
 * Hard rule inherited from doc 10 §3: no sentinel value ever escapes an implementation.
 * Missing data is `null` or a typed error, never `-1`, `"No Seller"` or `"< ? >"`.
 */
import type { MarketplaceCode } from '@buybox/core';
import type { Money } from '@buybox/shared';

/**
 * How a listing's public product page is addressed. Trendyol exposes `productUrl` on each
 * variant of the product filter (api-references §1.4) and a numeric `contentId` at product
 * level; either is enough to reach the page, so both are carried and the implementation
 * decides. `null` on both means this listing simply cannot be scraped — not an error.
 *
 * Hepsiburada uses the same two fields for the same two roles (api-references §2.11): its SKU
 * (`BS1372`) is the `contentId` and addresses the listings endpoint, and `url` is the product
 * page, needed there as the `Referer`. The field names stay marketplace-neutral deliberately —
 * an implementation may only read them, never widen the port for its own vocabulary.
 */
export interface ProductPageRef {
  readonly url: string | null;
  /**
   * Identifies the *product*, which is shared with competitors — never our own listing.
   * Trendyol `contentId`; Hepsiburada SKU.
   */
  readonly contentId: string | null;
}

export function hasProductPageRef(ref: ProductPageRef | null | undefined): ref is ProductPageRef {
  return ref !== null && ref !== undefined && (ref.url !== null || ref.contentId !== null);
}

/**
 * One seller's offer on a product page — the scraper-owned normalised shape (guide §30).
 * Downstream code speaks only this vocabulary, so a change to a marketplace's frontend
 * payload is contained inside one normaliser.
 *
 * `rank` is 1-based over the offers as the page orders them, winner first (guide §22).
 */
export interface CompetitorOffer {
  readonly rank: number;
  /** Marketplace merchant id, as a string. Never the seller name (guide §8). */
  readonly sellerRef: string | null;
  readonly sellerName: string | null;
  /** 0–10 on Trendyol (`sellerScore.value`, guide §9). `null` when absent — never `-1`. */
  readonly sellerRating: number | null;
  /** The seller's own commercial listing id, distinct from `sellerRef` (guide §10). */
  readonly listingRef: string | null;
  /** Shelf price for this offer. `null` when the payload carried no usable numeric value. */
  readonly price: Money | null;
  /** Price after basket/coupon discounts, when the page exposes one (guide §14). */
  readonly finalPrice: Money | null;
  readonly offeredStock: number | null;
  readonly dispatchTime: number | null;
  readonly hasPromotion: boolean;
  /**
   * Human-readable promotion text, retained for the operator's benefit only. Never parsed:
   * classification uses structured fields (guide §19, §26).
   */
  readonly promotionText: string | null;
  /** True for the offer holding the buybox — read from its position in the payload, not inferred from price (guide §22). */
  readonly isWinner: boolean;
}

/**
 * Counters proving what the parser actually found, so a silent frontend change shows up as a
 * metric rather than as quietly empty reports (guide §33, doc 09 §22).
 *
 * The vocabulary is Trendyol-shaped because Trendyol came first, but every field has a
 * meaning independent of it, and each implementation documents its own mapping:
 * `stateFound` = the payload was located, `productFound` = it carried a product body,
 * `merchantListingFound` = the seller collection was located, `winner*Found` = the buybox
 * holder was identified.
 */
export interface ScrapeDiagnostics {
  /** How the payload was obtained: embedded in an HTML page, or a public JSON endpoint. */
  readonly extractionMethod: 'embeddedJson' | 'publicJsonApi';
  readonly parserVersion: string;
  readonly stateFound: boolean;
  readonly productFound: boolean;
  readonly merchantListingFound: boolean;
  readonly winnerMerchantFound: boolean;
  readonly winnerVariantFound: boolean;
  readonly otherMerchantCount: number;
  /** Distinct sellers, winner included (guide §24) — not the same number as `offers.length`. */
  readonly merchantCount: number;
  readonly listingCount: number;
}

export interface CompetitorPageSnapshot {
  readonly marketplaceCode: MarketplaceCode;
  readonly productRef: ProductPageRef;
  /** The URL actually fetched, after redirects — the canonical product link. */
  readonly fetchedUrl: string;
  readonly observedAt: Date;
  readonly offers: readonly CompetitorOffer[];
  readonly diagnostics: ScrapeDiagnostics;
  /** True when this snapshot was served from the in-process cache rather than the network. */
  readonly fromCache: boolean;
}

/**
 * doc 05 §5 records `scrape_runs.status` as `ok | parseFailed | fetchFailed`; the port raises
 * the same distinction as a typed error so the job never has to inspect a message string.
 */
export type CompetitorSourceFailureKind = 'fetchFailed' | 'parseFailed';

export class CompetitorSourceError extends Error {
  constructor(
    message: string,
    readonly kind: CompetitorSourceFailureKind,
    override readonly cause?: unknown,
    /**
     * The response's HTTP status, when `kind` is `fetchFailed` and a response was received at
     * all (absent on a network-level failure, e.g. a timeout). Lets a caller decide which
     * statuses are worth retrying without parsing the message string.
     */
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'CompetitorSourceError';
  }
}

export interface ICompetitorSource {
  readonly code: MarketplaceCode;
  /**
   * Fetches and normalises one product page. Throws `CompetitorSourceError` — the caller
   * records the failure and moves on; it must never propagate into a pricing decision.
   */
  fetchProductOffers(ref: ProductPageRef): Promise<CompetitorPageSnapshot>;
  /**
   * Releases any resource the implementation owns (e.g. `TrendyolPublicPageSource`'s Playwright
   * browser, 2026-08-17). Optional: most implementations hold nothing to release. The worker
   * calls this on every registered source at shutdown.
   */
  close?(): Promise<void>;
}
