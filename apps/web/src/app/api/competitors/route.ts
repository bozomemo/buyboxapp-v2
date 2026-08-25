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
import { catalogRepo, competitionRepo, competitorReportsRepo, repricingRepo } from '@buybox/db';
import { withBrand } from '@/lib/product-name';
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

  const filters = { sinceMs, untilMs, listingId, marketplaceCode, baseStockCode, sellerRef };

  const [observations, scrapeRuns, coverage] = await Promise.all([
    competitionRepo.competitorObservationsInRange(appDb, filters),
    competitionRepo.scrapeRunsInRange(appDb, { sinceMs, untilMs, listingId, marketplaceCode }),
    competitorReportsRepo.coverageInRange(appDb, { sinceMs, untilMs, marketplaceCode }),
  ]);
  // `baseStockCode` is a predicate in the repository, not a filter applied to the result here.
  // It used to be the latter, which was wrong in a way that only appears at scale: the 20,000
  // row cap is reached *before* the filter runs, so on a large catalogue this reported one
  // stock code's history from whatever slice of the archive happened to fit — a smaller,
  // confident, wrong answer. Narrowing in SQL means the cap applies to the rows actually asked
  // for.

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

  // Time-weighted buybox share, for a single listing only.
  //
  // The count-based figure above answers "in how many recorded seller sets was X the winner",
  // which over-weights busy periods: a product rescanned five times in an hour because its
  // prices kept moving contributes five times as much as a quiet day, though it represents an
  // hour either way. Weighting each observation by the interval until the next one measures
  // how long each seller actually held the buybox.
  //
  // Gaps are excluded rather than attributed. If the next scrape is a week later we do not know
  // who held the buybox in between, and stretching the last-seen winner across the gap would
  // invent exactly the confidence this report exists to avoid. The uncovered time is reported
  // separately so the denominator is visible.
  //
  // Bounded on purpose: one listing produces at most a batch an hour, so this stays in JS while
  // the seller-centric reports, which have no such bound, aggregate in SQL.
  let timeWeightedBuyboxShare: {
    sellerRef: string | null;
    sellerName: string;
    heldMs: number;
    sharePct: number;
  }[] = [];
  let uncoveredMs = 0;
  if (listingId) {
    const winnerByMoment = new Map<number, { sellerRef: string | null; sellerName: string }>();
    for (const o of observations) {
      if (o.rank === 1) winnerByMoment.set(o.observedAt, { sellerRef: o.sellerRef, sellerName: o.sellerName });
    }
    const moments = [...winnerByMoment.keys()].sort((a, b) => a - b);
    // A seller set stands until the next *successful* look, so the interval ends at the next
    // scrape moment, not the next changed batch.
    const okRuns = scrapeRuns
      .filter((r) => r.status === 'ok')
      .map((r) => r.observedAt)
      .sort((a, b) => a - b);
    const heldBySeller = new Map<string, { sellerRef: string | null; sellerName: string; heldMs: number }>();
    let coveredMs = 0;
    for (let i = 0; i < moments.length; i++) {
      const start = moments[i]!;
      const nextObserved = moments[i + 1] ?? untilMs;
      const nextLook = okRuns.find((t) => t > start);
      // The window closes at whichever comes first: the next batch, or the point after which we
      // simply stopped looking.
      const end = Math.min(nextObserved, nextLook !== undefined ? Math.max(nextLook, start) : untilMs, untilMs);
      const heldMs = Math.max(0, end - start);
      coveredMs += heldMs;
      const winner = winnerByMoment.get(start)!;
      const key = winner.sellerRef ?? winner.sellerName;
      const entry = heldBySeller.get(key) ?? { ...winner, heldMs: 0 };
      entry.heldMs += heldMs;
      heldBySeller.set(key, entry);
    }
    uncoveredMs = Math.max(0, untilMs - sinceMs - coveredMs);
    timeWeightedBuyboxShare = [...heldBySeller.values()]
      .map((s) => ({ ...s, sharePct: coveredMs > 0 ? (s.heldMs / coveredMs) * 100 : 0 }))
      .sort((a, b) => b.heldMs - a.heldMs);
  }

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

  const presenceBrands = await catalogRepo.brandNamesByListingIds(
    appDb,
    sellerPresence.map((p) => p.listingId),
  );

  return NextResponse.json({
    filters: { sinceMs, untilMs, listingId, marketplaceCode, baseStockCode, sellerRef },
    truncated: {
      observations: observations.length >= 20_000,
      scrapeRuns: scrapeRuns.length >= 20_000,
    },
    priceTimeline,
    // `Marka - Ürün Adı` (customer feedback 2026-08-25) — see `withBrand`.
    sellerPresence: sellerPresence.map((p) => ({
      ...p,
      productName: withBrand(p.productName, presenceBrands.get(p.listingId)),
    })),
    buyboxShare,
    timeWeightedBuyboxShare,
    uncoveredMs,
    coverage,
    sellerProfile,
    observationCoverage,
  });
}
