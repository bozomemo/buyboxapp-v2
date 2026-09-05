/**
 * Audit findings over the brand archive — the pure derivation (doc 06 §12.4, Faz 6).
 *
 * Faz 4 says who sells the brand and how; Faz 5 says who is supposed to. This says **what is
 * worth a person's attention**, and it is deliberately the only place that decides so: the
 * repositories aggregate, the route fetches, and this function turns those numbers into a
 * ranked list. Pure — no I/O, no database, no clock (`nowMs` is an input) — so every rule below
 * is table-testable without a scrape or a fixture.
 *
 * ## A finding is not a violation
 *
 * Nothing here concludes anything. A finding says "here is a thing, here are the numbers behind
 * it, go look" — which is why every one of them carries the figures it was derived from and a
 * subject that resolves back to the raw observations it came out of. An auditor sends the
 * notice; the software does not, and must not phrase itself as though it had.
 *
 * ## Stated beats measured
 *
 * Findings come in two bases, and the ranking follows from the difference rather than from a
 * table of importance:
 *
 * - **`stated`** — derived from an operator's own recorded statement. "This seller is blocked
 *   for this brand and is selling it" is *certain*: someone wrote the rule, and the seller is on
 *   the page. Nothing about it is inference.
 * - **`measured`** — derived from observed prices. "Sells 22% below the market" is an
 *   *interpretation* of a sample: it moves with the window, with which competitors happened to
 *   be on the page, and with a threshold someone chose.
 *
 * "Below the brand's own published price" (2026-09-03) is the one **price** finding that is
 * `stated`, and the distinction is worth being exact about: the comparison is against a number
 * the brand owner wrote down, not against whoever else happened to be on the page. Both halves
 * of it are facts — what the list says, and what the page showed — so nothing about it is a
 * sample. It is still not a *violation*: an auditor decides that, and the wording never says
 * otherwise.
 *
 * A stated finding therefore always outranks a measured one, however dramatic the measured
 * one's number. That ordering is a property of the two bases and not a weight anyone tunes.
 *
 * ## Every threshold is an argument
 *
 * There is no number below that is not either a member of `AuditThresholds` or a defended
 * constant of the domain (100 for percent, a day in milliseconds). `DEFAULT_AUDIT_THRESHOLDS` is
 * the starting point an install gets, not a floor or a ceiling on what it may hold: the
 * operator's stored overrides are read from `app_settings` and passed in whole.
 */

import type { SellerPolicyVerdict } from './seller-policy.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every number the derivation uses, in one place.
 *
 * Percentages are whole percent and **positive** where they describe a distance below the
 * market: `belowMarketPct: 15` reads "more than fifteen percent under", which is how an operator
 * says it. The sign is applied here rather than stored, so nobody has to remember which way a
 * stored `-15` was meant.
 */
export interface AuditThresholds {
  /** A seller whose mean price sits more than this far below the market is a finding. */
  readonly belowMarketPct: number;
  /**
   * A single product this far below the market is a finding on its own, even from a seller
   * whose overall average is unremarkable — the pattern of a seller who is ordinary everywhere
   * except one line.
   */
  readonly deepDiscountPct: number;
  /**
   * …but only when the seller's *other* products are within this of the market. Without the
   * contrast the finding would fire on every seller who is simply cheap, duplicating
   * `belowMarketAverage` with a bigger number.
   */
  readonly deepDiscountContrastPct: number;
  /** Cheapest in at least this share of their own looks — the systematic price-cutter. */
  readonly undercutSharePct: number;
  /** …across at least this many products, so one product's price war is not called a pattern. */
  readonly undercutMinProducts: number;
  /** A seller first observed within this many days of the window's end is newly appeared. */
  readonly newSellerDays: number;
  /**
   * Fewer observations than this and no **measured** finding is raised about the seller at all.
   * A mean over two looks is not a mean. Stated findings ignore this deliberately — a blocked
   * seller seen once is still a blocked seller seen selling.
   */
  readonly minObservations: number;
  /**
   * How far under the brand's own published price a seller may go before it is a finding
   * (2026-09-03).
   *
   * Not zero, and the reason is not leniency. A list price is quoted to the lira while a
   * marketplace price moves by kuruş, and a campaign badge routinely shaves a percent off the
   * displayed figure without anyone deciding to undercut anything. A zero tolerance would file
   * every one of those beside a genuine 30% cut, and the operator would learn to skim the list.
   */
  readonly referenceBelowPct: number;
  /** A category holding at most this share of the brand's products is an unusual place for it. */
  readonly unrelatedCategoryMaxSharePct: number;
  /** …and at most this many products, so the share test cannot be met by a large catalogue. */
  readonly unrelatedCategoryMaxProducts: number;
}

/**
 * What an install starts with. Not baked in anywhere — the route merges the operator's stored
 * overrides over these, exactly as `DEFAULT_RETENTION_WINDOWS` is treated (doc 05 §10).
 *
 * The values are opening positions rather than measurements. 15% is where the Faz 4 screen's
 * callout already sat, 30% is roughly where a Turkish marketplace discount stops being a
 * campaign, and three observations is the smallest number over which "mean" is not a joke.
 * Every one of them is expected to be moved once a brand's own data is in front of someone.
 */
export const DEFAULT_AUDIT_THRESHOLDS: AuditThresholds = {
  belowMarketPct: 15,
  deepDiscountPct: 30,
  deepDiscountContrastPct: 10,
  undercutSharePct: 60,
  undercutMinProducts: 3,
  newSellerDays: 7,
  minObservations: 3,
  referenceBelowPct: 5,
  unrelatedCategoryMaxSharePct: 2,
  unrelatedCategoryMaxProducts: 5,
};

/** The one product a seller sits furthest below the market on, when the caller found one. */
export interface AuditWorstProduct {
  readonly trackedProductId: string;
  readonly label: string;
  /** Negative means below the market. */
  readonly deviationPct: number;
}

/**
 * One seller's window, as the brand report already computes it.
 *
 * `verdict` comes from `resolveSellerPolicy` and is `undefined` for the great majority of
 * sellers — that is the normal state, not a missing value (see `seller-policy.ts`).
 */
export interface AuditSellerFacts {
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  readonly sellerName: string;
  readonly verdict: SellerPolicyVerdict;
  readonly productCount: number;
  readonly observationCount: number;
  /** Of those observations, how many were the cheapest offer in their own look. */
  readonly cheapestCount: number;
  /** Mean distance from the market, negative below it. `null` when no look could be compared. */
  readonly avgDeviationPct: number | null;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly worstProduct: AuditWorstProduct | null;
  /**
   * Mean deviation across everything *except* `worstProduct`, which is what makes the
   * one-product finding distinguishable from a generally cheap seller. `null` when the seller
   * has only the one product — in which case there is no contrast to draw and the finding is
   * not raised.
   */
  readonly avgDeviationPctExcludingWorst: number | null;
}

/**
 * One seller seen below the brand's own published price on one product (2026-09-03).
 *
 * The prices are kuruş, and the percentage is derived here rather than passed in: it is the
 * whole content of the finding, and computing it in one place is what stops the screen and the
 * query from disagreeing about what "18% below" means.
 *
 * `lowestPrice` is the seller's **worst** offer in the window rather than their latest or their
 * mean. A published price is a floor that was either respected or not, and averaging would let
 * an afternoon at half price vanish into a fortnight of compliance.
 */
export interface AuditReferenceViolation {
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  readonly sellerName: string;
  readonly trackedProductId: string;
  readonly productLabel: string;
  /** Kuruş, as the operator's own list states it. Never observed, never inferred. */
  readonly referencePrice: bigint;
  /** Kuruş — the lowest price this seller was seen at on this product in the window. */
  readonly lowestPrice: bigint;
  readonly looksBelow: number;
  readonly lastBelowAt: number;
}

/** One tracked product, for the two findings that are about a product rather than a seller. */
export interface AuditProductFacts {
  readonly trackedProductId: string;
  readonly label: string;
  readonly categoryRef: string | null;
  readonly categoryName: string | null;
  /** The marketplace attributes it to the brand id we watch. */
  readonly viaBrandRef: boolean;
  /** The brand's search term found it. */
  readonly viaSearchTerm: boolean;
}

export interface AuditInput {
  readonly thresholds: AuditThresholds;
  readonly sellers: readonly AuditSellerFacts[];
  readonly products: readonly AuditProductFacts[];
  /**
   * Sellers seen below the brand's published price. Empty on an install that has imported no
   * price list — which is not the same as "nobody is below it", and the screen says so rather
   * than reporting a clean audit (the same distinction the "not on the list" signal draws).
   */
  readonly referenceViolations?: readonly AuditReferenceViolation[];
  /** How many of the brand's products sit in each category ref. */
  readonly categoryProductCounts: ReadonlyMap<string, number>;
  /** The brand's total product count, the denominator of the category share. */
  readonly totalProductCount: number;
  /**
   * Whether the brand has at least one **authorised** rule in force.
   *
   * Gates `notOnAuthorisedList` entirely. An install that has never entered a whitelist has not
   * said that everyone else is unauthorised — it has said nothing — and a screen that opened
   * with "412 unauthorised sellers" on day one would be wrong about every one of them and would
   * teach the operator to ignore the whole list. Faz 6's definition of done names this case.
   */
  readonly hasAuthorisedList: boolean;
  /** The window's end, and the reference point for "new". Core has no clock. */
  readonly nowMs: number;
}

export type AuditFindingKind =
  | 'blockedSellerPresent'
  | 'belowReferencePrice'
  | 'notOnAuthorisedList'
  | 'deepDiscountOnOneProduct'
  | 'persistentUndercut'
  | 'belowMarketAverage'
  | 'newSeller'
  | 'unrelatedCategory'
  | 'brandRefDisagreement';

/** Certain because someone wrote it down, or inferred from a sample. See the module header. */
export type AuditFindingBasis = 'stated' | 'measured';

/** What the finding is about, and what the evidence query has to be given to re-open it. */
export type AuditSubject =
  | {
      readonly kind: 'seller';
      readonly marketplaceCode: string;
      readonly sellerRef: string;
      readonly name: string;
    }
  | { readonly kind: 'product'; readonly trackedProductId: string; readonly label: string };

interface FindingBase {
  /** Stable across runs, so a row can be keyed, linked and re-found. */
  readonly id: string;
  readonly basis: AuditFindingBasis;
  readonly subject: AuditSubject;
  /**
   * Which threshold produced it, so the screen can offer "this is the number that decided it"
   * beside the finding rather than in a settings page three clicks away. `null` for a stated
   * finding, which no threshold governs.
   */
  readonly thresholdKey: keyof AuditThresholds | null;
  /** Sorts findings of the same kind. Larger is more extreme; never compared across kinds. */
  readonly magnitude: number;
}

/**
 * The findings themselves, each carrying the figures it was derived from.
 *
 * A discriminated union rather than a generic list of label/value pairs: the numbers behind a
 * finding differ by kind, they are the whole content of it, and typing them means a screen
 * cannot render a deviation where a share belongs. Turkish wording lives in the UI — this layer
 * holds numbers.
 */
export type AuditFinding =
  | (FindingBase & {
      readonly kind: 'blockedSellerPresent';
      readonly productCount: number;
      readonly lastSeenAt: number;
      /** The operator's own note on the rule, when they left one. */
      readonly note: string | null;
    })
  | (FindingBase & {
      readonly kind: 'belowReferencePrice';
      readonly trackedProductId: string;
      readonly productLabel: string;
      readonly sellerName: string;
      readonly sellerRef: string;
      readonly marketplaceCode: string;
      /** Kuruş. Both are carried so the screen can show the arithmetic rather than only its result. */
      readonly referencePrice: bigint;
      readonly lowestPrice: bigint;
      /** Positive: how far under the published price the worst offer sat. */
      readonly shortfallPct: number;
      readonly looksBelow: number;
      readonly lastBelowAt: number;
    })
  | (FindingBase & {
      readonly kind: 'notOnAuthorisedList';
      readonly productCount: number;
      readonly lastSeenAt: number;
    })
  | (FindingBase & {
      readonly kind: 'belowMarketAverage';
      readonly deviationPct: number;
      readonly observationCount: number;
      readonly productCount: number;
    })
  | (FindingBase & {
      readonly kind: 'deepDiscountOnOneProduct';
      readonly trackedProductId: string;
      readonly productLabel: string;
      readonly deviationPct: number;
      /** The seller's mean over everything else — the contrast that makes this a finding. */
      readonly otherDeviationPct: number;
      readonly sellerName: string;
      readonly sellerRef: string;
    })
  | (FindingBase & {
      readonly kind: 'persistentUndercut';
      readonly sharePct: number;
      readonly productCount: number;
      readonly observationCount: number;
    })
  | (FindingBase & {
      readonly kind: 'newSeller';
      readonly firstSeenAt: number;
      readonly daysAgo: number;
      readonly productCount: number;
    })
  | (FindingBase & {
      readonly kind: 'unrelatedCategory';
      readonly categoryRef: string;
      readonly categoryName: string;
      readonly categoryProductCount: number;
      readonly sharePct: number;
    })
  | (FindingBase & {
      readonly kind: 'brandRefDisagreement';
      readonly viaBrandRef: boolean;
      readonly viaSearchTerm: boolean;
    });

/**
 * Rank order, lowest first.
 *
 * The three `stated` kinds occupy 0, 1 and 2 **by construction**, which is the plan's "kara
 * liste eşleşmesi fiyat sapmasından önce gelir". Below them the order is by how much a person
 * can conclude from the finding alone: a deep discount on one line is a specific, checkable
 * claim; a new seller is barely a claim at all and sits last among the seller findings, because
 * a new seller is usually just a new seller.
 *
 * Within the stated tier the order is by how *specific* the claim is rather than by how serious
 * it sounds. `blockedSellerPresent` names one seller the operator personally ruled on.
 * `belowReferencePrice` names one seller, one product and two prices — as checkable as it gets.
 * `notOnAuthorisedList` is stated too, but it fires across a whole population: on a brand with
 * a short whitelist it can be most of the sellers on the page, and putting it above a specific
 * price violation would bury the checkable finding under the categorical one.
 */
const KIND_ORDER: Record<AuditFindingKind, number> = {
  blockedSellerPresent: 0,
  belowReferencePrice: 1,
  notOnAuthorisedList: 2,
  deepDiscountOnOneProduct: 3,
  persistentUndercut: 4,
  belowMarketAverage: 5,
  unrelatedCategory: 6,
  brandRefDisagreement: 7,
  newSeller: 8,
};

/** The rank of a kind, for a caller that wants to group or sort without re-deriving it. */
export function auditFindingOrder(kind: AuditFindingKind): number {
  return KIND_ORDER[kind];
}

function sellerSubject(seller: AuditSellerFacts): AuditSubject {
  return {
    kind: 'seller',
    marketplaceCode: seller.marketplaceCode,
    sellerRef: seller.sellerRef,
    name: seller.sellerName,
  };
}

function sellerId(kind: AuditFindingKind, seller: AuditSellerFacts): string {
  return `${kind}::${seller.marketplaceCode}::${seller.sellerRef}`;
}

/**
 * Derives every finding for one brand's window and returns them ranked.
 *
 * Takes facts, not a database handle, and returns findings, not rows: nothing is stored. A
 * finding is recomputed from the archive every time it is asked for, which means changing a
 * threshold re-answers the whole history rather than only what has been observed since — the
 * behaviour an operator expects from a number they were invited to tune.
 *
 * `policyNoteOf` carries the note on the rule that blocked a seller, keyed
 * `marketplaceCode::sellerRef`. Supplied by the caller because the winning rule is resolved
 * outside; a missing entry simply means the operator left no note.
 */
export function deriveAuditFindings(
  input: AuditInput,
  policyNoteOf: ReadonlyMap<string, string | null> = new Map(),
): AuditFinding[] {
  const { thresholds: t, sellers, products, nowMs } = input;
  const findings: AuditFinding[] = [];

  /**
   * Below the brand's own published price — `stated`, and the only price finding that is.
   *
   * `minObservations` is deliberately not consulted, for the same reason the two policy signals
   * ignore it: that threshold guards a *mean*, and there is no mean here. One look showing a
   * seller under a price the brand published is one look showing exactly that, and withholding
   * it until a third would suppress the single most actionable row on the screen.
   *
   * The shortfall is computed from the exact kuruş amounts and only then turned into a
   * percentage, so the figure on the row and the two prices beside it always agree. A reference
   * price of zero cannot reach here (the importer refuses it) but is guarded anyway: it would
   * otherwise divide by zero and produce `Infinity`, which sorts above every real finding.
   */
  for (const violation of input.referenceViolations ?? []) {
    if (violation.referencePrice <= 0n) continue;
    const shortfallPct =
      Number(((violation.referencePrice - violation.lowestPrice) * 10_000n) / violation.referencePrice) / 100;
    if (shortfallPct <= t.referenceBelowPct) continue;
    findings.push({
      kind: 'belowReferencePrice',
      id: `belowReferencePrice::${violation.marketplaceCode}::${violation.sellerRef}::${violation.trackedProductId}`,
      basis: 'stated',
      // The **product** is the subject, as it is for the deep-discount finding: the evidence to
      // open is that product's looks, with this seller one row inside them.
      subject: {
        kind: 'product',
        trackedProductId: violation.trackedProductId,
        label: violation.productLabel,
      },
      thresholdKey: 'referenceBelowPct',
      magnitude: shortfallPct,
      trackedProductId: violation.trackedProductId,
      productLabel: violation.productLabel,
      sellerName: violation.sellerName,
      sellerRef: violation.sellerRef,
      marketplaceCode: violation.marketplaceCode,
      referencePrice: violation.referencePrice,
      lowestPrice: violation.lowestPrice,
      shortfallPct,
      looksBelow: violation.looksBelow,
      lastBelowAt: violation.lastBelowAt,
    });
  }

  for (const seller of sellers) {
    // ---- stated -------------------------------------------------------------------------
    // Neither of these consults `minObservations`. A seller the operator has already ruled on
    // is a finding the first time they appear; waiting for a third look before saying so would
    // withhold the one fact on this screen that is not an inference.
    if (seller.verdict === 'blocked') {
      findings.push({
        kind: 'blockedSellerPresent',
        id: sellerId('blockedSellerPresent', seller),
        basis: 'stated',
        subject: sellerSubject(seller),
        thresholdKey: null,
        magnitude: seller.productCount,
        productCount: seller.productCount,
        lastSeenAt: seller.lastSeenAt,
        note: policyNoteOf.get(`${seller.marketplaceCode}::${seller.sellerRef}`) ?? null,
      });
    } else if (seller.verdict === 'undefined' && input.hasAuthorisedList) {
      findings.push({
        kind: 'notOnAuthorisedList',
        id: sellerId('notOnAuthorisedList', seller),
        basis: 'stated',
        subject: sellerSubject(seller),
        thresholdKey: null,
        magnitude: seller.productCount,
        productCount: seller.productCount,
        lastSeenAt: seller.lastSeenAt,
      });
    }

    // ---- measured -----------------------------------------------------------------------
    if (seller.observationCount < t.minObservations) continue;

    const worst = seller.worstProduct;
    const others = seller.avgDeviationPctExcludingWorst;
    if (
      worst !== null &&
      others !== null &&
      worst.deviationPct <= -t.deepDiscountPct &&
      others >= -t.deepDiscountContrastPct
    ) {
      findings.push({
        kind: 'deepDiscountOnOneProduct',
        id: `deepDiscountOnOneProduct::${seller.marketplaceCode}::${seller.sellerRef}::${worst.trackedProductId}`,
        basis: 'measured',
        // The **product** is the subject: the evidence to open is that product's looks, and the
        // seller is one row inside them. A seller-subject finding would open the seller's whole
        // window and leave the operator to find the line it was about.
        subject: { kind: 'product', trackedProductId: worst.trackedProductId, label: worst.label },
        thresholdKey: 'deepDiscountPct',
        magnitude: -worst.deviationPct,
        trackedProductId: worst.trackedProductId,
        productLabel: worst.label,
        deviationPct: worst.deviationPct,
        otherDeviationPct: others,
        sellerName: seller.sellerName,
        sellerRef: seller.sellerRef,
      });
    }

    if (seller.productCount >= t.undercutMinProducts && seller.observationCount > 0) {
      const sharePct = (seller.cheapestCount * 100) / seller.observationCount;
      if (sharePct >= t.undercutSharePct) {
        findings.push({
          kind: 'persistentUndercut',
          id: sellerId('persistentUndercut', seller),
          basis: 'measured',
          subject: sellerSubject(seller),
          thresholdKey: 'undercutSharePct',
          magnitude: sharePct,
          sharePct,
          productCount: seller.productCount,
          observationCount: seller.observationCount,
        });
      }
    }

    if (seller.avgDeviationPct !== null && seller.avgDeviationPct <= -t.belowMarketPct) {
      findings.push({
        kind: 'belowMarketAverage',
        id: sellerId('belowMarketAverage', seller),
        basis: 'measured',
        subject: sellerSubject(seller),
        thresholdKey: 'belowMarketPct',
        magnitude: -seller.avgDeviationPct,
        deviationPct: seller.avgDeviationPct,
        observationCount: seller.observationCount,
        productCount: seller.productCount,
      });
    }

    const ageMs = nowMs - seller.firstSeenAt;
    if (ageMs >= 0 && ageMs <= t.newSellerDays * DAY_MS) {
      findings.push({
        kind: 'newSeller',
        id: sellerId('newSeller', seller),
        basis: 'measured',
        subject: sellerSubject(seller),
        thresholdKey: 'newSellerDays',
        // Newer is more notable, so the magnitude counts down from the threshold rather than up
        // from zero — otherwise the seller who has been here longest would sort first.
        magnitude: t.newSellerDays * DAY_MS - ageMs,
        firstSeenAt: seller.firstSeenAt,
        daysAgo: ageMs / DAY_MS,
        productCount: seller.productCount,
      });
    }
  }

  for (const product of products) {
    if (product.categoryRef !== null && input.totalProductCount > 0) {
      const inCategory = input.categoryProductCounts.get(product.categoryRef) ?? 0;
      const sharePct = (inCategory * 100) / input.totalProductCount;
      if (
        inCategory > 0 &&
        inCategory <= t.unrelatedCategoryMaxProducts &&
        sharePct <= t.unrelatedCategoryMaxSharePct
      ) {
        findings.push({
          kind: 'unrelatedCategory',
          id: `unrelatedCategory::${product.trackedProductId}`,
          basis: 'measured',
          subject: { kind: 'product', trackedProductId: product.trackedProductId, label: product.label },
          thresholdKey: 'unrelatedCategoryMaxSharePct',
          // Rarest first: a category holding one of the brand's products is more worth a look
          // than one holding five.
          magnitude: t.unrelatedCategoryMaxProducts - inCategory,
          categoryRef: product.categoryRef,
          categoryName: product.categoryName ?? product.categoryRef,
          categoryProductCount: inCategory,
          sharePct,
        });
      }
    }

    // Found by the brand's name but not attributed to its brand id: either the marketplace has
    // it under someone else's brand, or someone else's product carries the name. Which of the
    // two it is, is precisely what the operator has to look at — so this is a finding rather
    // than a conclusion, and it is `measured` because it rests on a search term matching text.
    if (product.viaSearchTerm && !product.viaBrandRef) {
      findings.push({
        kind: 'brandRefDisagreement',
        id: `brandRefDisagreement::${product.trackedProductId}`,
        basis: 'measured',
        subject: { kind: 'product', trackedProductId: product.trackedProductId, label: product.label },
        thresholdKey: null,
        magnitude: 0,
        viaBrandRef: product.viaBrandRef,
        viaSearchTerm: product.viaSearchTerm,
      });
    }
  }

  return findings.sort((a, b) => {
    const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (byKind !== 0) return byKind;
    const byMagnitude = b.magnitude - a.magnitude;
    if (byMagnitude !== 0) return byMagnitude;
    // Ties break on the id so the order is stable between two runs over the same data. A list
    // that reshuffles on refresh cannot be worked through row by row.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
