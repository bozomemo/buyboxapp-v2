/**
 * Gathering the facts one brand's audit findings are derived from (doc 06 §12.4, Faz 6).
 *
 * Lifted out of `apps/web/src/app/api/brand-reports/findings/route.ts` on 2026-09-03, unchanged,
 * when the findings stopped being something only a person could ask for: `EvaluateBrandFindings`
 * runs the same derivation on a cadence so a finding can reach an operator who is not looking at
 * the screen. Two copies of this orchestration would have been the worst possible outcome — the
 * job and the screen would drift, and the first symptom would be an alert nobody can reproduce.
 *
 * Everything here is fetching and shaping. The **deciding** is `deriveAuditFindings` in
 * `packages/core`, which is pure and table-tested; this module exists so that one function gets
 * the same input whichever caller asked.
 *
 * ## Every query is bounded by a threshold, not by the catalogue
 *
 * A brand sweep puts thousands of products behind this question (887 for Whiskas, 4,863 for
 * Royal Canin), so nothing here fetches "all products" and filters in JS:
 *
 * - the deep-discount pairs come back already filtered by `deepDiscountPct` in SQL;
 * - the brand-attribution disagreements are a repository filter (`searchTermOnly`);
 * - the category candidates are only the products sitting in categories small enough to be
 *   candidates at all;
 * - the below-list-price pairs come back ordered deepest-first and capped.
 *
 * Those narrowings are deliberately **weaker** than the tests in the core module: this module
 * may hand over a row that turns out not to be a finding, but it can never withhold one that is.
 * A narrowing that applied the same predicate would be a second copy of the rule, free to drift
 * from the one that is tested.
 */
import {
  deriveAuditFindings,
  resolveSellerPolicy,
  type AuditFinding,
  type AuditProductFacts,
  type AuditReferenceViolation,
  type AuditSellerFacts,
  type AuditThresholds,
  type AuditWorstProduct,
  type SellerPolicyRule,
} from '@buybox/core';
import {
  brandReportsRepo,
  competitorSellersRepo,
  sellerPoliciesRepo,
  trackedProductsRepo,
  type AppDatabase,
  type watchedBrandsRepo,
} from '@buybox/db';

/**
 * How many deep-discount pairs to consider. Far above what the threshold yields on real data,
 * and there so a misconfigured threshold (`deepDiscountPct: 0`) degrades into a long list
 * rather than into fetching the whole archive.
 */
const DEVIATION_LIMIT = 2000;

/** Product candidates fetched per signal. Both feed a screen a person reads, not an export. */
const PRODUCT_CANDIDATE_LIMIT = 500;

/**
 * How many below-the-list-price pairs to consider. Bounded for the same reason as
 * `DEVIATION_LIMIT`: a brand that has imported a list for its whole catalogue and then meets a
 * price war could otherwise put every seller on every product into one response. The rows come
 * back deepest-cut first, so a truncation drops the mildest ones and the caller says it happened.
 */
const REFERENCE_VIOLATION_LIMIT = 2000;

/** What a caller has to say about itself. `nowMs` is the window end — this module has no clock. */
export interface BrandFindingsRequest {
  readonly brand: watchedBrandsRepo.WatchedBrandRow;
  readonly sinceMs: number;
  readonly untilMs: number;
  readonly thresholds: AuditThresholds;
}

/**
 * What the findings rest on, reported beside them.
 *
 * Every field here exists to stop a *silence* from being misread. `hasAuthorisedList` explains a
 * whole absent signal; the truncation flags say a list was cut rather than exhausted; and the
 * reference-price coverage says how much of the catalogue the newest signal could even apply to.
 */
export interface BrandFindingsContext {
  readonly hasAuthorisedList: boolean;
  readonly sellerCount: number;
  readonly productCount: number;
  readonly truncatedDeviations: boolean;
  readonly truncatedDisagreements: boolean;
  readonly disagreementTotal: number;
  readonly referencePrice: {
    readonly productsWithPrice: number;
    readonly productsTotal: number;
    readonly truncated: boolean;
  };
}

export interface BrandFindingsResult {
  readonly findings: readonly AuditFinding[];
  readonly context: BrandFindingsContext;
}

export async function collectBrandFindings(
  appDb: AppDatabase,
  request: BrandFindingsRequest,
): Promise<BrandFindingsResult> {
  const { brand, sinceMs, untilMs, thresholds } = request;
  const window = {
    sinceMs,
    untilMs,
    marketplaceCode: brand.marketplaceCode,
    watchedBrandIds: [brand.id],
  };

  const [
    aggregates,
    policyRows,
    knownSellers,
    deviations,
    categories,
    totals,
    referenceRows,
    referenceCoverage,
  ] = await Promise.all([
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
    brandReportsRepo.referencePriceViolations(appDb, window, { limit: REFERENCE_VIOLATION_LIMIT }),
    trackedProductsRepo.referencePriceCoverage(appDb, brand.id),
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

  /**
   * The durable seller name is preferred over the observed one here exactly as it is for the
   * aggregates above, so one company reads as one company whichever signal named it.
   */
  const referenceViolations: AuditReferenceViolation[] = referenceRows.map((row) => ({
    marketplaceCode: row.marketplaceCode,
    sellerRef: row.sellerRef,
    sellerName: known.get(`${row.marketplaceCode}::${row.sellerRef}`)?.sellerName ?? row.observedName,
    trackedProductId: row.trackedProductId,
    productLabel: row.productLabel,
    referencePrice: row.referencePrice,
    lowestPrice: row.lowestPrice,
    looksBelow: row.looksBelow,
    lastBelowAt: row.lastBelowAt,
  }));

  const findings = deriveAuditFindings(
    {
      thresholds,
      sellers,
      referenceViolations,
      products: [...productById.values()],
      categoryProductCounts,
      totalProductCount,
      hasAuthorisedList,
      nowMs: untilMs,
    },
    policyNoteOf,
  );

  return {
    findings,
    context: {
      hasAuthorisedList,
      sellerCount: sellers.length,
      productCount: totalProductCount,
      truncatedDeviations: deviations.length >= DEVIATION_LIMIT,
      truncatedDisagreements: disagreements.total > disagreements.rows.length,
      disagreementTotal: disagreements.total,
      referencePrice: {
        productsWithPrice: referenceCoverage.withPrice,
        productsTotal: referenceCoverage.total,
        truncated: referenceRows.length >= REFERENCE_VIOLATION_LIMIT,
      },
    },
  };
}
