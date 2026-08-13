/**
 * Competitor history reporting (doc 06 §6, doc 12 6.8) — the reporting surface over the
 * indefinitely-retained scrape archive: price timeline, seller presence, buybox share,
 * seller profile, observation coverage. All five reports are computed here, in JS, from one
 * bounded/filtered fetch (`competitorObservationsInRange`/`scrapeRunsInRange`, capped at
 * 20,000 rows each) rather than as five separate dialect-specific `GROUP BY` queries — a
 * date range is required precisely because this is a reporting query over history, not a
 * paged catalogue browse (see the repository doc-comment for the full rationale).
 */
import { NextResponse } from 'next/server';
import { competitionRepo, repricingRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const appDb = getAppDb();
  const nowMs = Date.now();

  const untilMs = params.get('untilMs') ? Number(params.get('untilMs')) : nowMs;
  const sinceMs = params.get('sinceMs') ? Number(params.get('sinceMs')) : untilMs - DEFAULT_WINDOW_MS;
  const listingId = params.get('listingId') ?? undefined;
  const marketplaceCode = params.get('marketplaceCode') ?? undefined;
  const baseStockCode = params.get('baseStockCode') ?? undefined;
  const sellerRef = params.get('sellerRef') ?? undefined;

  const filters = { sinceMs, untilMs, listingId, marketplaceCode, sellerRef };

  const [observationsRaw, scrapeRuns] = await Promise.all([
    competitionRepo.competitorObservationsInRange(appDb, filters),
    competitionRepo.scrapeRunsInRange(appDb, { sinceMs, untilMs, listingId, marketplaceCode }),
  ]);
  // baseStockCode isn't indexed on scrape_runs' report row, so it's applied here rather than
  // adding a fourth dialect-branched predicate for a single, rarely-combined filter.
  const observations = baseStockCode
    ? observationsRaw.filter((o) => o.baseStockCode === baseStockCode)
    : observationsRaw;

  // Price timeline (single listing only — doc 06 §6 "per listing"): buybox price history
  // plus our own confirmed price-change events marked on the same timeline.
  let priceTimeline: {
    buybox: {
      observedAt: number;
      buyboxPrice: string | null;
      secondPrice: string | null;
      rank: number | null;
    }[];
    ourChanges: { at: number; oldPrice: string; newPrice: string }[];
  } | null = null;
  if (listingId) {
    const [buyboxHistory, submissions] = await Promise.all([
      competitionRepo.buyboxObservationHistory(appDb, listingId, sinceMs),
      repricingRepo.listPriceSubmissionsForListing(appDb, listingId),
    ]);
    priceTimeline = {
      buybox: buyboxHistory
        .filter((h) => h.observedAt <= untilMs)
        .map((h) => ({
          observedAt: h.observedAt,
          buyboxPrice: h.buyboxPrice?.toString() ?? null,
          secondPrice: h.secondPrice?.toString() ?? null,
          rank: h.rank,
        })),
      ourChanges: submissions
        .filter(
          (s) =>
            s.state === 'confirmed' &&
            s.confirmedAt !== null &&
            s.confirmedAt >= sinceMs &&
            s.confirmedAt <= untilMs,
        )
        .map((s) => ({
          at: s.confirmedAt as number,
          oldPrice: s.oldPrice.toString(),
          newPrice: s.newPrice.toString(),
        })),
    };
  }

  // Seller presence: first/last appearance per (listing, seller) in the filtered window.
  const presenceMap = new Map<
    string,
    {
      listingId: string;
      productName: string;
      marketplaceListingId: string;
      sellerRef: string | null;
      sellerName: string;
      firstSeen: number;
      lastSeen: number;
      observationCount: number;
    }
  >();
  for (const o of observations) {
    const key = `${o.listingId}::${o.sellerRef ?? o.sellerName}`;
    const existing = presenceMap.get(key);
    if (existing) {
      existing.firstSeen = Math.min(existing.firstSeen, o.observedAt);
      existing.lastSeen = Math.max(existing.lastSeen, o.observedAt);
      existing.observationCount += 1;
    } else {
      presenceMap.set(key, {
        listingId: o.listingId,
        productName: o.productName,
        marketplaceListingId: o.marketplaceListingId,
        sellerRef: o.sellerRef,
        sellerName: o.sellerName,
        firstSeen: o.observedAt,
        lastSeen: o.observedAt,
        observationCount: 1,
      });
    }
  }
  const sellerPresence = [...presenceMap.values()].sort((a, b) => b.lastSeen - a.lastSeen);

  // Buybox share: for each distinct (listing, observedAt) scrape moment, whichever seller
  // was rank 1 "held the buybox" at that moment; tallied across the filtered window.
  const rank1BySeller = new Map<string, { sellerRef: string | null; sellerName: string; count: number }>();
  let totalRank1Moments = 0;
  for (const o of observations) {
    if (o.rank !== 1) continue;
    totalRank1Moments += 1;
    const key = o.sellerRef ?? o.sellerName;
    const existing = rank1BySeller.get(key);
    if (existing) existing.count += 1;
    else rank1BySeller.set(key, { sellerRef: o.sellerRef, sellerName: o.sellerName, count: 1 });
  }
  const buyboxShare = [...rank1BySeller.values()]
    .map((s) => ({ ...s, sharePct: totalRank1Moments > 0 ? (s.count / totalRank1Moments) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);

  // Seller profile: only computed when a specific seller is selected — across every product
  // that seller appeared on in the filtered window.
  let sellerProfile: {
    sellerRef: string | null;
    sellerName: string;
    listingCount: number;
    observationCount: number;
    avgRank: number | null;
    promotionCount: number;
    firstSeen: number;
    lastSeen: number;
  } | null = null;
  if (sellerRef && observations.length > 0) {
    const listingIds = new Set(observations.map((o) => o.listingId));
    const ranks = observations.map((o) => o.rank);
    sellerProfile = {
      sellerRef,
      sellerName: observations[0]!.sellerName,
      listingCount: listingIds.size,
      observationCount: observations.length,
      avgRank: ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null,
      promotionCount: observations.filter((o) => o.hasPromotion).length,
      firstSeen: Math.min(...observations.map((o) => o.observedAt)),
      lastSeen: Math.max(...observations.map((o) => o.observedAt)),
    };
  }

  // Observation coverage: scrape_runs density per day (doc 06 §6 "so the operator can see
  // where data is thin"), split by outcome.
  const coverageByDay = new Map<
    string,
    { date: string; ok: number; parseFailed: number; fetchFailed: number }
  >();
  for (const run of scrapeRuns) {
    const date = new Date(run.observedAt).toISOString().slice(0, 10);
    const entry = coverageByDay.get(date) ?? { date, ok: 0, parseFailed: 0, fetchFailed: 0 };
    entry[run.status] += 1;
    coverageByDay.set(date, entry);
  }
  const observationCoverage = [...coverageByDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    filters: { sinceMs, untilMs, listingId, marketplaceCode, baseStockCode, sellerRef },
    truncated: {
      observations: observationsRaw.length >= 20_000,
      scrapeRuns: scrapeRuns.length >= 20_000,
    },
    priceTimeline,
    sellerPresence,
    buyboxShare,
    sellerProfile,
    observationCoverage,
  });
}
