/**
 * `listings.extra` is doc 05 §5's "marketplace-specific fields preserved verbatim" column.
 * The public product-page reference lives there rather than in a dedicated column because it
 * is exactly that: a marketplace-specific pointer used by one reporting job (doc 07 §7), read
 * by nothing on the control path, and absent for marketplaces with no public product page.
 *
 * Writer (`ImportListings`) and reader (`ScrapeCompetitors`) both go through this module so
 * the key convention exists in one place and cannot drift.
 */
import type { ProductPageRef } from '@buybox/adapters';

interface ListingExtra {
  readonly productPage?: { readonly url?: string | null; readonly contentId?: string | null };
}

/** Returns the JSON to store in `listings.extra`, or `null` when there is nothing worth storing. */
export function encodeListingExtra(productPage: ProductPageRef | null | undefined): string | null {
  if (!productPage) return null;
  if (productPage.url === null && productPage.contentId === null) return null;
  return JSON.stringify({ productPage: { url: productPage.url, contentId: productPage.contentId } });
}

/**
 * Never throws: `extra` is opaque JSON written by an adapter, and a malformed or unexpected
 * value means "this listing has no page reference", not a job failure (doc 07 §7 — a scrape
 * problem must never escalate).
 */
export function decodeProductPageRef(extra: string | null): ProductPageRef | null {
  if (extra === null || extra.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(extra);
  } catch {
    return null;
  }
  const productPage = (parsed as ListingExtra | null)?.productPage;
  if (typeof productPage !== 'object' || productPage === null) return null;
  const url = typeof productPage.url === 'string' && productPage.url !== '' ? productPage.url : null;
  const contentId =
    typeof productPage.contentId === 'string' && productPage.contentId !== '' ? productPage.contentId : null;
  if (url === null && contentId === null) return null;
  return { url, contentId };
}
