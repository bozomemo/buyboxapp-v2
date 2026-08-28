/**
 * The **product detail** port — what a marketplace's own product page says a product *is*
 * (api-references §2.14).
 *
 * A fifth port, next to `IMarketplaceAdapter` (control), `ICompetitorSource` (who sells this),
 * `IBrandCatalogueSource` (what exists under a brand) and `ISellerIdentitySource` (who a seller
 * is). It answers a fifth question — *what is this product?* — and it exists because one field
 * on that page has no substitute anywhere else: the **barcode**.
 *
 * The barcode is what makes a Hepsiburada product and a Trendyol product the same product. Every
 * other candidate key is a guess: names differ by punctuation and pack size, brands are spelled
 * differently, and marketplace ids are private to each marketplace. Matching a brand's shelf
 * across two marketplaces on anything softer than a barcode produces a report whose rows are
 * confidently wrong, which is worse than a report with gaps.
 *
 * ## No price, no seller, no rank — by construction
 *
 * ⚠️ Hepsiburada's product page carries a `listings` array, and it is **truncated**: 2 entries
 * beside `hasMoreListings: true` for a product with 6 sellers (measured 2026-08-28). Reading it
 * would report a third of the competition as all of it, silently, and the shape of the payload
 * gives no hint — it looks exactly like a complete list.
 *
 * So no type in this file has a seller, price, rank or stock field. There is nowhere to put one.
 * The full seller set is `ICompetitorSource`'s job through the listings endpoint (§2.11), which
 * returns all of them, and the separation is enforced by the types rather than by a convention
 * somebody has to remember. This is the same device `ISellerIdentitySource` uses for rank.
 *
 * Reporting only, like every other source in this package: nothing here may gate a pricing
 * decision, and a failure is recorded while the run continues.
 */
import type { MarketplaceCode } from '@buybox/core';

/** One product, as the marketplace's own page describes it. */
export interface ProductDetail {
  readonly marketplaceCode: MarketplaceCode;
  /** The sellable identity — Hepsiburada's `sku` (`HBCV…`), what the caller asked about. */
  readonly productRef: string;
  /** The parent product the variant hangs off (`HBC…`), when the page names one. */
  readonly parentProductRef: string | null;
  /**
   * The manufacturer's barcode — the cross-marketplace matching key, and the only reason this
   * port exists. `null` when the page did not state one; never derived from a name or a slug.
   */
  readonly barcode: string | null;
  readonly name: string | null;
  readonly brandName: string | null;
  /** The marketplace's brand identity. A slug on Hepsiburada (`whiskas`), not a number. */
  readonly brandRef: string | null;
  /** The deepest category the page assigns, which is the one that describes the product. */
  readonly categoryRef: string | null;
  readonly categoryName: string | null;
  readonly ratingCount: number | null;
  readonly ratingAverage: number | null;
  /**
   * Whether the marketplace still shows this product at all. A brand owner reading a report
   * needs to tell "nobody sells it" from "it is gone", and those are different rows.
   */
  readonly isLive: boolean | null;
}

export interface ProductDetailDiagnostics {
  readonly parserVersion: string;
  readonly stateFound: boolean;
  /**
   * Whether the page carried a truncated seller list. Recorded as a counter and **never** as
   * data: it exists so that the day the page starts carrying the full list is visible, rather
   * than being discovered by someone deciding to read it.
   */
  readonly sellerListWasTruncated: boolean;
}

export interface ProductDetailSnapshot {
  readonly detail: ProductDetail;
  readonly fetchedUrl: string;
  readonly observedAt: Date;
  readonly diagnostics: ProductDetailDiagnostics;
  readonly fromCache: boolean;
}

export type ProductDetailFailureKind = 'fetchFailed' | 'parseFailed' | 'identityMismatch';

export class ProductDetailError extends Error {
  constructor(
    message: string,
    readonly kind: ProductDetailFailureKind,
    override readonly cause?: unknown,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'ProductDetailError';
  }
}

export interface IProductDetailSource {
  readonly code: MarketplaceCode;
  /**
   * Reads one product's page.
   *
   * `identityMismatch` when the page describes a different product than the one asked for —
   * a marketplace that redirects a dead SKU to a replacement would otherwise write the
   * replacement's barcode onto the dead product's row, and every later match would be wrong.
   *
   * @throws {ProductDetailError}
   */
  fetchProductDetail(productRef: string, url?: string | null): Promise<ProductDetailSnapshot>;
  close?(): Promise<void>;
}
