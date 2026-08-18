/**
 * One competitor across our catalogue (doc 06 §6, doc 12 Phase 10B).
 *
 * When the seller belongs to an operator-defined group, the breakdown covers **every member of
 * that group**, across marketplaces — that is the entire purpose of grouping. Ids live in
 * per-marketplace namespaces, so only the operator's assertion can make Trendyol's `12345` and
 * Hepsiburada's `12345` one company (doc 05 §5).
 */
import { NextResponse } from 'next/server';
import { competitorReportsRepo, competitorSellersRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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

  const [listings, coverage] = await Promise.all([
    competitorReportsRepo.sellerListingBreakdown(appDb, { sinceMs, untilMs, marketplaceCode }, refs),
    competitorReportsRepo.coverageInRange(appDb, { sinceMs, untilMs, marketplaceCode }),
  ]);

  return NextResponse.json({
    filters: { sinceMs, untilMs },
    seller: {
      marketplaceCode: marketplace,
      sellerRef: ref,
      // Falls back to the name on the offers themselves. `competitor_sellers` is only filled
      // by scrapes from Phase 10A onward, so an archive predating it knows the name perfectly
      // well while having no durable record to read it from — showing a bare merchant id there
      // would be losing information we hold.
      sellerName: identity?.sellerName ?? listings[0]?.observedName ?? null,
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
      productName: l.productName,
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
    coverage,
  });
}
