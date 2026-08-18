/**
 * The seller-centric axis of competitor history (doc 06 §6, doc 12 Phase 10B).
 *
 * `/api/competitors` answers "who is on this product". This answers the other direction:
 * "which of our products is this seller on, since when, and how do they price against us".
 *
 * Every figure here is aggregated **in SQL** (`competitorReportsRepo`) rather than fetched and
 * totalled in JS. A seller-centric question spans every listing the seller appears on and has
 * no natural bound — at the 2,000-listing target one seller's 30-day profile is ~29,000 offer
 * rows against a 20,000-row fetch cap, so counting in the route would quietly answer from a
 * fraction of the window.
 */
import { NextResponse } from 'next/server';
import { competitorReportsRepo, competitorSellersRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { resolveOwnSellers } from '@/lib/server/own-sellers';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const appDb = getAppDb();
  const nowMs = Date.now();

  const untilMs = params.get('untilMs') ? Number(params.get('untilMs')) : nowMs;
  const sinceMs = params.get('sinceMs') ? Number(params.get('sinceMs')) : untilMs - DEFAULT_WINDOW_MS;
  const marketplaceCode = params.get('marketplaceCode') ?? undefined;
  // Our own stores, resolved before the aggregation so they can be taken out of it. This screen
  // is titled "competitors"; we are not one, and left in we top every column on it by
  // construction (we are on 100% of our own listings).
  const own = await resolveOwnSellers(appDb, { sinceMs, untilMs });
  const window = { sinceMs, untilMs, marketplaceCode, excludeSellers: own.keys };

  const [aggregates, unidentifiedCount, coverage, knownSellers, groups] = await Promise.all([
    competitorReportsRepo.sellerAggregatesInRange(appDb, window),
    competitorReportsRepo.countUnidentifiedObservations(appDb, window),
    competitorReportsRepo.coverageInRange(appDb, window),
    competitorSellersRepo.listCompetitorSellers(appDb, marketplaceCode ? { marketplaceCode } : {}),
    competitorSellersRepo.listSellerGroups(appDb),
  ]);

  const known = new Map(knownSellers.map((s) => [`${s.marketplaceCode}::${s.sellerRef}`, s]));
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  const sellers = aggregates.map((a) => {
    const identity = known.get(`${a.marketplaceCode}::${a.sellerRef}`);
    const group = identity?.groupId ? groupsById.get(identity.groupId) : undefined;
    return {
      marketplaceCode: a.marketplaceCode,
      sellerRef: a.sellerRef,
      // The durable name when we have one, else the name carried by the observations in this
      // window. `competitor_sellers` is only populated by scrapes from Phase 10A onward, so an
      // archive predating it would otherwise show ids with no names at all.
      sellerName: identity?.sellerName ?? a.observedName,
      groupId: identity?.groupId ?? null,
      groupName: group?.displayName ?? null,
      operatorNote: identity?.operatorNote ?? null,
      listingCount: a.listingCount,
      observationCount: a.observationCount,
      buyboxCount: a.buyboxCount,
      // "When present, how often do they hold the buybox" — a rate over the seller's own
      // appearances, which is answerable from counts. It is deliberately not called a share of
      // *time*: that needs the gaps between scrapes and is computed per listing, where the
      // number of batches is small enough to reason about honestly.
      buyboxRate: a.observationCount > 0 ? a.buyboxCount / a.observationCount : 0,
      avgRank: a.avgRank,
      minPrice: a.minPrice?.toString() ?? null,
      maxPrice: a.maxPrice?.toString() ?? null,
      firstSeenAt: a.firstSeenAt,
      lastSeenAt: a.lastSeenAt,
    };
  });

  return NextResponse.json({
    filters: { sinceMs, untilMs, marketplaceCode: marketplaceCode ?? null },
    sellers,
    // Our own stores, reported beside the competitor list rather than hidden from it. Removing
    // us from "who are we up against" is right; removing "how are we doing" from the screen
    // entirely would just lose the figure.
    ownStores: own.diagnosis
      .filter((d) => d.seenInArchive)
      .map((d) => ({
        marketplaceCode: d.marketplaceCode,
        displayName: d.displayName,
        sellerRef: d.configuredRef,
        listingCount: d.listingCount,
        observationCount: d.observationCount,
        buyboxCount: d.buyboxCount,
        buyboxRate: d.observationCount > 0 ? d.buyboxCount / d.observationCount : 0,
      })),
    // Marketplaces where we could not tell which offer is ours. Surfaced because the symptom —
    // our own store sitting at the top of the competitor list — otherwise just looks like the
    // report is wrong, with nothing pointing at the setting that causes it.
    ownSellerUnresolved: own.unresolved.map((d) => ({
      marketplaceCode: d.marketplaceCode,
      displayName: d.displayName,
      configuredRef: d.configuredRef,
    })),
    groups: groups.map((g) => ({ id: g.id, displayName: g.displayName, note: g.note })),
    // Stated rather than implied: offers with no merchant id belong to no seller here, and a
    // list that silently omitted them would read as exhaustive when it is not.
    unidentifiedObservations: unidentifiedCount,
    coverage,
  });
}
