/**
 * Which module each screen and API route belongs to (doc 17 §1.2–§1.3). One table, read by the
 * proxy (which refuses a disabled module's routes) and by the navigation (which hides them), so
 * the two can never disagree about what "the seller module" covers.
 *
 * A path matches a prefix segment by segment — it **is** the prefix or continues it with `/`,
 * never a bare `startsWith`, which would file `/brands` (the seller's brand browser) under
 * `/brand` (the brand module's own screens). A `*` segment matches any one non-empty segment.
 * The most specific prefix wins: the one with more segments, then the longer one.
 */
import type { AppModule } from '@buybox/shared';

/** `null` marks a path that stays open to both modules even though a longer or shorter prefix does not. */
const ROUTE_MODULES: readonly (readonly [string, AppModule | null])[] = [
  // Seller module — our own listings, costs and repricing.
  ['/stock', 'seller'],
  ['/listings', 'seller'],
  ['/brands', 'seller'],
  ['/competitors', 'seller'],
  ['/alerts', 'seller'],
  ['/settings/fees', 'seller'],
  ['/settings/policy', 'seller'],
  ['/settings/product-sources', 'seller'],
  ['/api/stock', 'seller'],
  ['/api/listings', 'seller'],
  ['/api/brands', 'seller'],
  ['/api/competitors', 'seller'],
  ['/api/alerts', 'seller'],
  ['/api/kill-switch', 'seller'],
  ['/api/product-source', 'seller'],
  ['/api/settings/fees', 'seller'],
  ['/api/settings/policy', 'seller'],
  ['/api/settings/preview-impact', 'seller'],
  // Resolving the firm behind a storefront (doc 06 §12.4, Faz 7) is asked from the brand
  // module's seller screens as well as the seller's competitor screens.
  ['/api/competitors/sellers/identity', null],
  // One seller's own page answers for both modules: its `listings` half is the seller's, its
  // `trackedProducts` half the brand's, and every row of _Marka Satıcıları_ and every seller
  // finding links to it. Grouping a storefront into a firm is asked from it in both too. The
  // seller *list* (`/competitors/sellers`) stays with the seller module.
  ['/competitors/sellers/*/*', null],
  ['/api/competitors/sellers/*/*', null],
  ['/api/competitors/sellers/group', null],

  // Brand module — a brand's product manager watching the market.
  ['/brand', 'brand'],
  ['/watched-brands', 'brand'],
  ['/tracked-products', 'brand'],
  ['/api/brand', 'brand'],
  // `/api/brand` does not cover it: prefixes match segment by segment, so 'brand' and
  // 'brand-products' are different segments — which is the same care `/brand` and `/brands` need.
  ['/api/brand-products', 'brand'],
  ['/api/watched-brands', 'brand'],
  ['/api/tracked-products', 'brand'],
  ['/api/brand-reports', 'brand'],
  ['/api/seller-policies', 'brand'],
];

function matches(pathSegments: readonly string[], prefix: readonly string[]): boolean {
  if (pathSegments.length < prefix.length) return false;
  return prefix.every((segment, i) =>
    segment === '*' ? pathSegments[i] !== '' : segment === pathSegments[i],
  );
}

function moreSpecific(a: readonly string[], aText: string, b: readonly string[], bText: string): boolean {
  return a.length !== b.length ? a.length > b.length : aText.length > bText.length;
}

const ROUTE_SEGMENTS = ROUTE_MODULES.map(([prefix, module]) => ({
  prefix,
  segments: prefix.split('/'),
  module,
}));

/** The module a path belongs to, or `null` for a path both modules use (dashboard, jobs, settings…). */
export function moduleForPath(pathname: string): AppModule | null {
  const pathSegments = pathname.split('/');
  let best: (typeof ROUTE_SEGMENTS)[number] | undefined;
  for (const entry of ROUTE_SEGMENTS) {
    if (!matches(pathSegments, entry.segments)) continue;
    if (!best || moreSpecific(entry.segments, entry.prefix, best.segments, best.prefix)) best = entry;
  }
  return best ? best.module : null;
}
