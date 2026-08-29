/**
 * One competitor, in **both** the reports that know about them (doc 06 §6 and §12.4).
 *
 * Two archives record a seller and they answer different questions:
 *
 * - `competitor_observations` ⋈ `listings` — "what does this seller do on the products **we
 *   sell**". That is the `listings` half below, and it is the whole of what this route returned
 *   until 2026-08-29.
 * - `tracked_product_observations` ⋈ `tracked_products` — "what does this seller do on the
 *   products of the **brands we watch**". That is the `trackedProducts` half.
 *
 * Returning only the first made this page answer a question nobody had asked. The brand-audit
 * findings screen links a seller here — "Periko Petshop held the buybox on 5 products" — and on
 * a brand-owner install that seller very often sells none of *our* items, so the page came up
 * empty and read as lost data. It was not: the five products were in the other archive the whole
 * time. Both halves ship now, each labelled with what it covers, and each with an empty state
 * that says what its own emptiness means rather than leaving a bare table.
 *
 * When the seller belongs to an operator-defined group, **both** breakdowns cover every member
 * of that group, across marketplaces — that is the entire purpose of grouping, and applying it
 * to one half only would show the same company as whole in one table and split in the other. Ids
 * live in per-marketplace namespaces, so only the operator's assertion can make Trendyol's
 * `12345` and Hepsiburada's `12345` one company (doc 05 §5).
 */
import { NextResponse } from 'next/server';
import {
  brandReportsRepo,
  catalogRepo,
  competitorReportsRepo,
  competitorSellersRepo,
  watchedBrandsRepo,
} from '@buybox/db';
import { withBrand } from '@/lib/product-name';
import { getAppDb } from '@/lib/server/db';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Row cap on the tracked-product half.
 *
 * The listings half needs none — it is bounded by how many listings we sell — but a seller on
 * the brand side can appear on a whole swept catalogue (4,863 products for Royal Canin), and
 * this feeds a table the browser renders in one go. Rows come back newest-seen first, so the cut
 * falls on the stalest end, and the response says whether it fell at all so the screen can admit
 * it rather than imply the list is complete.
 */
const TRACKED_ROW_LIMIT = 500;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ marketplace: string; ref: string }> },
) {
  const { marketplace, ref } = await params;
  const search = new URL(request.url).searchParams;
  const appDb = getAppDb();
  const nowMs = Date.now();

  const untilMs = search.get('untilMs') ? Number(search.get('untilMs')) : nowMs;
  const sinceMs = search.get('sinceMs') ? Number(search.get('sinceMs')) : untilMs - DEFAULT_WINDOW_MS;

  const identity = await competitorSellersRepo.getCompetitorSeller(appDb, marketplace, ref);
  const members = await competitorSellersRepo.expandSellerGroup(appDb, marketplace, ref);
  const groups = await competitorSellersRepo.listSellerGroups(appDb);
  const group = identity?.groupId ? groups.find((g) => g.id === identity.groupId) : undefined;

  // A group spans marketplaces, so the breakdown must not be pinned to one. A single ungrouped
  // seller expands to itself, and `expandSellerGroup` guarantees that, so there is no branch.
  const refs = [...new Set(members.map((m) => m.sellerRef))];
  const marketplaceCode = group ? undefined : marketplace;

  /**
   * `?watchedBrandId=` narrows the tracked half to one watched brand — what the findings screen
   * passes, so an operator arriving from "5 üründe hep buybox" lands on that brand's rows rather
   * than on the seller's whole footprint. Absent means **every watched brand**, which is the
   * default the screen opens with: "what is this firm doing across everything we watch" is the
   * question the audit is actually for, and narrowing is the operator's to ask for.
   */
  const watchedBrandId = search.get('watchedBrandId')?.trim() || undefined;

  const [listings, coverage, trackedProducts, watchedBrands] = await Promise.all([
    competitorReportsRepo.sellerListingBreakdown(appDb, { sinceMs, untilMs, marketplaceCode }, refs),
    competitorReportsRepo.coverageInRange(appDb, { sinceMs, untilMs, marketplaceCode }),
    brandReportsRepo.sellerTrackedProductBreakdown(
      appDb,
      {
        sinceMs,
        untilMs,
        marketplaceCode,
        watchedBrandIds: watchedBrandId ? [watchedBrandId] : undefined,
      },
      // The group's whole membership, keyed per marketplace — the same `members` the listings
      // half is given, not a re-derivation that could drift from it.
      members,
      TRACKED_ROW_LIMIT,
    ),
    // Every watched brand, not only the ones this seller appears on: the filter has to be able
    // to express "show me Whiskas" and get an honest empty answer, which a dropdown built from
    // the seller's own rows could never do.
    watchedBrandsRepo.listWatchedBrands(appDb),
  ]);

  const brandNames = await catalogRepo.brandNamesByListingIds(
    appDb,
    listings.map((l) => l.listingId),
  );

  return NextResponse.json({
    filters: { sinceMs, untilMs, watchedBrandId: watchedBrandId ?? null },
    seller: {
      marketplaceCode: marketplace,
      sellerRef: ref,
      // Falls back to the name on the offers themselves. `competitor_sellers` is only filled
      // by scrapes from Phase 10A onward, so an archive predating it knows the name perfectly
      // well while having no durable record to read it from — showing a bare merchant id there
      // would be losing information we hold. The tracked half is a fallback in its own right:
      // a brand-only seller has no listings row to take a name from at all.
      sellerName:
        identity?.sellerName ?? listings[0]?.observedName ?? trackedProducts[0]?.observedName ?? null,
      operatorNote: identity?.operatorNote ?? null,
      firstSeenAt: identity?.firstSeenAt ?? null,
      lastSeenAt: identity?.lastSeenAt ?? null,
      // Absent when the archive predates Phase 10A: figures below still work (they come from
      // the observations), but there is no durable record to attach a note or a group to yet.
      isKnown: identity !== undefined,
    },
    group: group ? { id: group.id, displayName: group.displayName, note: group.note } : null,
    groupMembers: members,
    listings: listings.map((l) => ({
      listingId: l.listingId,
      marketplaceListingId: l.marketplaceListingId,
      productName: withBrand(l.productName, brandNames.get(l.listingId)),
      baseStockCode: l.baseStockCode,
      ourPrice: l.ourPrice.toString(),
      observationCount: l.observationCount,
      buyboxCount: l.buyboxCount,
      avgRank: l.avgRank,
      minPrice: l.minPrice?.toString() ?? null,
      maxPrice: l.maxPrice?.toString() ?? null,
      firstSeenAt: l.firstSeenAt,
      lastSeenAt: l.lastSeenAt,
    })),
    /** The brand-audit half — products of the brands we watch, whether or not we sell them. */
    trackedProducts: trackedProducts.map((t) => ({
      trackedProductId: t.trackedProductId,
      marketplaceCode: t.marketplaceCode,
      // `Marka - Ürün Adı`, exactly as `/tracked-products` renders it (R-UI-14), so the same
      // product reads the same on both screens.
      productLabel: withBrand(t.productLabel, t.brandName),
      watchedBrandId: t.watchedBrandId,
      observationCount: t.observationCount,
      buyboxCount: t.buyboxCount,
      cheapestCount: t.cheapestCount,
      avgDeviationPct: t.avgDeviationPct,
      comparedCount: t.comparedCount,
      minPrice: t.minPrice?.toString() ?? null,
      maxPrice: t.maxPrice?.toString() ?? null,
      firstSeenAt: t.firstSeenAt,
      lastSeenAt: t.lastSeenAt,
    })),
    // Said plainly rather than left for the operator to infer from a suspiciously round count.
    trackedTruncated: trackedProducts.length === TRACKED_ROW_LIMIT,
    watchedBrands: watchedBrands.map((b) => ({
      id: b.id,
      label: b.label,
      marketplaceCode: b.marketplaceCode,
    })),
    coverage,
  });
}
