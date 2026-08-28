/**
 * Audit findings for one brand (doc 06 §12.4, Faz 6).
 *
 * Gathers facts and hands them to `deriveAuditFindings`, which decides. Nothing here judges
 * anything: the split is deliberate and is what lets every rule be table-tested without a
 * database (`packages/core/src/brand/audit-findings.ts`).
 *
 * ## One brand at a time, on purpose
 *
 * Two of the eight signals are policy signals, and a policy verdict is only meaningful for one
 * brand — the same firm is routinely Whiskas' authorised distributor and unknown for Royal
 * Canin. A group-wide findings list would have to pick one of those answers per seller and would
 * be wrong about the other. The screen therefore asks for a brand, and this route says so
 * rather than guessing, except in the one case where there is nothing to guess: an install that
 * watches exactly one brand.
 *
 * ## Every query is bounded by a threshold, not by the catalogue
 *
 * A brand sweep puts thousands of products behind this question (887 for Whiskas, 4,863 for
 * Royal Canin), so nothing here fetches "all products" and filters in JS:
 *
 * - the deep-discount pairs come back already filtered by `deepDiscountPct` in SQL;
 * - the brand-attribution disagreements are a repository filter (`searchTermOnly`);
 * - the category candidates are only the products sitting in categories small enough to be
 *   candidates at all.
 *
 * The last two narrowings are deliberately **weaker** than the test in the core module: this
 * route may hand over a product that turns out not to be a finding, but it can never withhold
 * one that is. A route that applied the same predicate would be a second copy of the rule,
 * free to drift from the one that is tested.
 */
import { NextResponse } from 'next/server';
import {
  deriveAuditFindings,
  resolveSellerPolicy,
  type AuditProductFacts,
  type AuditSellerFacts,
  type AuditWorstProduct,
  type SellerPolicyRule,
} from '@buybox/core';
import {
  brandReportsRepo,
  competitorSellersRepo,
  sellerPoliciesRepo,
  trackedProductsRepo,
  watchedBrandsRepo,
} from '@buybox/db';
import { readAuditThresholds } from '@/lib/server/audit-thresholds';
import { getAppDb } from '@/lib/server/db';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How many deep-discount pairs to consider. Far above what the threshold yields on real data,
 * and there so a misconfigured threshold (`deepDiscountPct: 0`) degrades into a long list
 * rather than into fetching the whole archive.
 */
const DEVIATION_LIMIT = 2000;

/** Product candidates fetched per signal. Both feed a screen a person reads, not an export. */
const PRODUCT_CANDIDATE_LIMIT = 500;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const appDb = getAppDb();
  const nowMs = Date.now();

  const untilMs = params.get('untilMs') ? Number(params.get('untilMs')) : nowMs;
  const sinceMs = params.get('sinceMs') ? Number(params.get('sinceMs')) : untilMs - DEFAULT_WINDOW_MS;

  const [groups, brands, { thresholds, isDefault }] = await Promise.all([
    watchedBrandsRepo.listWatchedBrandGroups(appDb),
    watchedBrandsRepo.listWatchedBrands(appDb),
    readAuditThresholds(),
  ]);

  const requestedBrandId = params.get('watchedBrandId') ?? undefined;
  const brand =
    requestedBrandId !== undefined
      ? brands.find((b) => b.id === requestedBrandId)
      : brands.length === 1
        ? brands[0]
        : undefined;

  const catalogue = {
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    brands: brands.map((b) => ({
      id: b.id,
      groupId: b.groupId,
      label: b.label,
      marketplaceCode: b.marketplaceCode,
    })),
    thresholds,
    thresholdsAreDefault: isDefault,
  };

  if (brand === undefined) {
    // Not an error and not an empty list — either would read as "nothing found". The screen
    // asks for a brand instead.
    return NextResponse.json({ ...catalogue, brand: null, findings: [], needsBrand: true });
  }

  const window = {
    sinceMs,
    untilMs,
    marketplaceCode: brand.marketplaceCode,
    watchedBrandIds: [brand.id],
  };

  const [aggregates, policyRows, knownSellers, deviations, categories, totals] = await Promise.all([
    brandReportsRepo.brandSellerAggregatesInRange(appDb, window),
    sellerPoliciesRepo.listSellerPolicies(appDb, {
      watchedBrandGroupId: brand.groupId,
      watchedBrandIds: [brand.id],
    }),
    competitorSellersRepo.listCompetitorSellers(appDb, { marketplaceCode: brand.marketplaceCode }),
    brandReportsRepo.worstSellerProductDeviations(appDb, window, {
      maxDeviationPct: thresholds.deepDiscountPct,
      limit: DEVIATION_LIMIT,
    }),
    trackedProductsRepo.trackedProductCategories(appDb, brand.id),
    trackedProductsRepo.queryTrackedProducts(appDb, { watchedBrandId: brand.id, limit: 1, offset: 0 }),
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

  /**
   * Whether a whitelist exists **for this brand**, which gates the "not on the list" signal.
   *
   * Read off the rules already scoped to the brand and its group defaults, so a whitelist
   * entered for Whiskas does not make every Royal Canin seller unauthorised. This is the case
   * Faz 6's definition of done names: an install that has entered no list has not said everyone
   * else is unauthorised — it has said nothing.
   */
  const hasAuthorisedList = rules.some((rule) => rule.status === 'authorised');

  const known = new Map(knownSellers.map((s) => [`${s.marketplaceCode}::${s.sellerRef}`, s]));

  /** The worst product per seller, and how much of their record it accounts for. */
  const worstBySeller = new Map<string, (typeof deviations)[number]>();
  for (const row of deviations) {
    const key = `${row.marketplaceCode}::${row.sellerRef}`;
    const current = worstBySeller.get(key);
    if (current === undefined || row.avgDeviationPct < current.avgDeviationPct) {
      worstBySeller.set(key, row);
    }
  }

  const policyNoteOf = new Map<string, string | null>();

  const sellers: AuditSellerFacts[] = aggregates.map((a) => {
    const key = `${a.marketplaceCode}::${a.sellerRef}`;
    const identity = known.get(key);
    const policy = resolveSellerPolicy(
      rules,
      {
        marketplaceCode: a.marketplaceCode,
        sellerRef: a.sellerRef,
        taxNumber: identity?.taxNumber ?? null,
      },
      { watchedBrandId: brand.id, watchedBrandGroupId: brand.groupId },
    );
    if (policy.rule?.note) policyNoteOf.set(key, policy.rule.note);

    const worstRow = worstBySeller.get(key);
    const worstProduct: AuditWorstProduct | null =
      worstRow === undefined
        ? null
        : {
            trackedProductId: worstRow.trackedProductId,
            label: worstRow.productLabel,
            deviationPct: worstRow.avgDeviationPct,
          };

    /**
     * The seller's mean over everything *except* that product, by subtraction rather than by a
     * second query: both figures are averaged over the same rows, which is what `comparedCount`
     * is reported for. `null` when there is nothing left to average — a seller whose entire
     * record is the one product has no contrast to draw, and the finding is not raised.
     */
    const remaining = worstRow === undefined ? 0 : a.comparedCount - worstRow.comparedCount;
    const avgDeviationPctExcludingWorst =
      worstRow === undefined || a.avgDeviationPct === null || remaining <= 0
        ? null
        : (a.avgDeviationPct * a.comparedCount - worstRow.avgDeviationPct * worstRow.comparedCount) /
          remaining;

    return {
      marketplaceCode: a.marketplaceCode,
      sellerRef: a.sellerRef,
      // The durable name where the operator has recorded one, else the name the observations
      // carried — the same precedence the seller report uses, so one company reads as one
      // company on both screens.
      sellerName: identity?.sellerName ?? a.observedName,
      verdict: policy.verdict,
      productCount: a.productCount,
      observationCount: a.observationCount,
      cheapestCount: a.cheapestCount,
      avgDeviationPct: a.avgDeviationPct,
      firstSeenAt: a.firstSeenAt,
      lastSeenAt: a.lastSeenAt,
      worstProduct,
      avgDeviationPctExcludingWorst,
    };
  });

  const categoryProductCounts = new Map(categories.map((c) => [c.ref, c.productCount]));
  const totalProductCount = totals.total;

  /**
   * Products worth asking the category question about: those in a category holding few enough
   * of the brand's products to be a candidate. The share test — the other half of the rule —
   * is left to the core module, so this narrowing can only ever be wider than the rule.
   */
  const rareCategories = categories.filter(
    (c) => c.productCount > 0 && c.productCount <= thresholds.unrelatedCategoryMaxProducts,
  );

  const categoryCandidates = await Promise.all(
    rareCategories.map((c) =>
      trackedProductsRepo.queryTrackedProducts(appDb, {
        watchedBrandId: brand.id,
        categoryRef: c.ref,
        limit: thresholds.unrelatedCategoryMaxProducts,
        offset: 0,
      }),
    ),
  );

  const disagreements = await trackedProductsRepo.queryTrackedProducts(appDb, {
    watchedBrandId: brand.id,
    searchTermOnly: true,
    limit: PRODUCT_CANDIDATE_LIMIT,
    offset: 0,
  });

  const productById = new Map<string, AuditProductFacts>();
  for (const row of [...categoryCandidates.flatMap((page) => page.rows), ...disagreements.rows]) {
    productById.set(row.id, {
      trackedProductId: row.id,
      label: row.label,
      categoryRef: row.categoryRef ?? null,
      categoryName: row.categoryName ?? null,
      viaBrandRef: row.viaBrandRef ?? false,
      viaSearchTerm: row.viaSearchTerm ?? false,
    });
  }

  const findings = deriveAuditFindings(
    {
      thresholds,
      sellers,
      products: [...productById.values()],
      categoryProductCounts,
      totalProductCount,
      hasAuthorisedList,
      nowMs: untilMs,
    },
    policyNoteOf,
  );

  return NextResponse.json({
    ...catalogue,
    brand: { id: brand.id, label: brand.label, marketplaceCode: brand.marketplaceCode },
    filters: { sinceMs, untilMs },
    findings,
    needsBrand: false,
    /**
     * What the screen has to say about itself. `hasAuthorisedList` explains a whole absent
     * signal — without it the operator cannot tell "everyone is authorised" from "no list has
     * been entered" — and the counts say how much archive the findings rest on.
     */
    context: {
      hasAuthorisedList,
      sellerCount: sellers.length,
      productCount: totalProductCount,
      truncatedDeviations: deviations.length >= DEVIATION_LIMIT,
      truncatedDisagreements: disagreements.total > disagreements.rows.length,
      disagreementTotal: disagreements.total,
    },
  });
}
