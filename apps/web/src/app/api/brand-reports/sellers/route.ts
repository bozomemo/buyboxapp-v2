/**
 * Who sells the brands we own, and how (doc 06 §12.4, Faz 4).
 *
 * The brand-side counterpart of `/api/competitors/sellers`, and deliberately a separate route.
 * That one asks "who competes with us on the listings we sell" and therefore aggregates through
 * `listings`; a brand owner auditing Whiskas may have no listing on the marketplace at all, so
 * the question has to be asked of `tracked_products` instead.
 *
 * One thing is shared, and it is the important one: **seller identity**. Both routes read
 * `competitor_sellers` for the durable name, the operator's cross-marketplace group and their
 * note, so a company an operator named once is that company on both screens (doc 05 §5).
 *
 * Every figure is aggregated **in SQL** (`brandReportsRepo`). A brand sweep puts thousands of
 * products behind this question — 887 for Whiskas, 4,863 for Royal Canin — and a route that
 * fetched rows and totalled them in JS would not fail, it would quietly answer from whatever
 * slice it managed to fetch.
 */
import { NextResponse } from 'next/server';
import { resolveSellerPolicy, type SellerPolicyRule } from '@buybox/core';
import {
  brandReportsRepo,
  competitorSellersRepo,
  sellerPoliciesRepo,
  watchedBrandsRepo,
} from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const appDb = getAppDb();
  const nowMs = Date.now();

  const untilMs = params.get('untilMs') ? Number(params.get('untilMs')) : nowMs;
  const sinceMs = params.get('sinceMs') ? Number(params.get('sinceMs')) : untilMs - DEFAULT_WINDOW_MS;
  const marketplaceCode = params.get('marketplaceCode') ?? undefined;
  const watchedBrandId = params.get('watchedBrandId') ?? undefined;
  const groupId = params.get('groupId') ?? undefined;

  const groups = await watchedBrandsRepo.listWatchedBrandGroups(appDb);
  const brands = await watchedBrandsRepo.listWatchedBrands(appDb);

  /**
   * The brand scope, resolved here rather than in the query.
   *
   * A group is expanded to its brands' ids — one flat `IN` instead of a third join — and the
   * empty result of that expansion is passed through as an empty list, which the repository
   * reads as "no brand matches". A group with no brands in it must report nothing; falling back
   * to "no restriction" would silently widen a newly created group's report to every brand the
   * install watches, which is the one wrong answer that still looks plausible.
   */
  const watchedBrandIds =
    watchedBrandId !== undefined
      ? [watchedBrandId]
      : groupId !== undefined
        ? brands.filter((b) => b.groupId === groupId).map((b) => b.id)
        : undefined;

  const window = { sinceMs, untilMs, marketplaceCode, watchedBrandIds };

  /**
   * The policy verdict is only asked when the report is scoped to **one brand**, because a
   * verdict is only meaningful for one brand: the same firm is routinely Whiskas' authorised
   * distributor and unknown for Royal Canin, and a single chip over a group-wide report would
   * have to pick one of those to show. Scoped wider, the column reads "marka seçin" rather than
   * a number that averages two different answers.
   */
  const scopedBrand = watchedBrandId ? brands.find((b) => b.id === watchedBrandId) : undefined;

  const [aggregates, unidentifiedCount, knownSellers, sellerGroups, policyRows] = await Promise.all([
    brandReportsRepo.brandSellerAggregatesInRange(appDb, window),
    brandReportsRepo.countUnidentifiedTrackedObservations(appDb, window),
    competitorSellersRepo.listCompetitorSellers(appDb, marketplaceCode ? { marketplaceCode } : {}),
    competitorSellersRepo.listSellerGroups(appDb),
    scopedBrand
      ? sellerPoliciesRepo.listSellerPolicies(appDb, {
          watchedBrandGroupId: scopedBrand.groupId,
          watchedBrandIds: [scopedBrand.id],
        })
      : Promise.resolve([]),
  ]);

  /** Stored rows shaped for the pure resolver; a hand-edited row with no identity is dropped. */
  const rules: SellerPolicyRule[] = policyRows.flatMap((row) => {
    const identity =
      row.sellerRef !== null && row.marketplaceCode !== null
        ? ({ kind: 'sellerRef', marketplaceCode: row.marketplaceCode, sellerRef: row.sellerRef } as const)
        : row.taxNumber !== null
          ? ({ kind: 'taxNumber', taxNumber: row.taxNumber } as const)
          : null;
    return identity === null
      ? []
      : [
          {
            id: row.id,
            watchedBrandGroupId: row.watchedBrandGroupId,
            watchedBrandId: row.watchedBrandId,
            identity,
            status: row.status,
            note: row.note,
          },
        ];
  });

  const known = new Map(knownSellers.map((s) => [`${s.marketplaceCode}::${s.sellerRef}`, s]));
  const sellerGroupsById = new Map(sellerGroups.map((g) => [g.id, g]));

  const sellers = aggregates.map((a) => {
    const identity = known.get(`${a.marketplaceCode}::${a.sellerRef}`);
    const group = identity?.groupId ? sellerGroupsById.get(identity.groupId) : undefined;
    const policy = scopedBrand
      ? resolveSellerPolicy(
          rules,
          {
            marketplaceCode: a.marketplaceCode,
            sellerRef: a.sellerRef,
            taxNumber: identity?.taxNumber ?? null,
          },
          { watchedBrandId: scopedBrand.id, watchedBrandGroupId: scopedBrand.groupId },
        )
      : null;
    return {
      marketplaceCode: a.marketplaceCode,
      sellerRef: a.sellerRef,
      // The durable name when we have one, else the name the observations carried in this
      // window — an archive written before the seller was first registered would otherwise show
      // ids with no names at all.
      sellerName: identity?.sellerName ?? a.observedName,
      groupId: identity?.groupId ?? null,
      groupName: group?.displayName ?? null,
      operatorNote: identity?.operatorNote ?? null,
      productCount: a.productCount,
      observationCount: a.observationCount,
      buyboxCount: a.buyboxCount,
      cheapestCount: a.cheapestCount,
      // Rates over the seller's own appearances — answerable from counts, and deliberately not
      // called a share of *time*, which would need the gaps between looks.
      //
      // The two are reported side by side because their **difference** is the finding. A seller
      // cheapest far more often than they hold the buybox is being beaten on delivery or seller
      // score; one holding the buybox without being cheapest is winning on something other than
      // price. Collapsing them into a single "performance" number would hide both.
      buyboxRate: a.observationCount > 0 ? a.buyboxCount / a.observationCount : 0,
      cheapestRate: a.observationCount > 0 ? a.cheapestCount / a.observationCount : 0,
      avgDeviationPct: a.avgDeviationPct,
      /** `null` when the report is not scoped to one brand — see `scopedBrand` above. */
      verdict: policy?.verdict ?? null,
      minPrice: a.minPrice?.toString() ?? null,
      maxPrice: a.maxPrice?.toString() ?? null,
      firstSeenAt: a.firstSeenAt,
      lastSeenAt: a.lastSeenAt,
    };
  });

  return NextResponse.json({
    filters: {
      sinceMs,
      untilMs,
      marketplaceCode: marketplaceCode ?? null,
      watchedBrandId: watchedBrandId ?? null,
      groupId: groupId ?? null,
    },
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    brands: brands.map((b) => ({
      id: b.id,
      groupId: b.groupId,
      label: b.label,
      marketplaceCode: b.marketplaceCode,
    })),
    sellers,
    /**
     * Offers in the window that carried no merchant id and so are in nobody's row. Reported so
     * the screen can state its own blind spot: a list that silently dropped them would read as
     * exhaustive when it is not.
     */
    unidentifiedCount,
  });
}
