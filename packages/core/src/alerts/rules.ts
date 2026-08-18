/**
 * Competitor alert rules — the pure decision (doc 12 Phase 10C).
 *
 * Alerts are **reporting**. Nothing here reads a clock, touches a database or influences a
 * price: the scrape hands this function a snapshot, it says which rules match and why, and the
 * caller records the outcome. A failure on this path can never reach a pricing decision, which
 * is the same isolation `ScrapeCompetitors` itself is built around (doc 07 §1.1).
 *
 * The rule shape is one generic predicate rather than one type per alert the operator asked
 * for, because all three requested alerts are the same sentence with different blanks:
 *
 *     scope (which products)  ×  subject (which seller)  ×  predicate (present / priced below)
 *
 * "Seller X appears on product Y", "seller X sells below Z on product Y" and "anyone sells
 * below Z on product Y" are three fillings of it. A fourth — "X took the buybox", "the price
 * dropped by more than N%" — is a new enum value, not a new table.
 */
import { Money } from '@buybox/shared';

export type AlertScopeType = 'listing' | 'baseStockCode' | 'marketplace' | 'all';
export type AlertSubjectType = 'seller' | 'sellerGroup' | 'any';
export type AlertPredicate = 'sellerPresent' | 'priceBelow';

/**
 * How the comparison price is derived.
 *
 * `fixed` exists because some products have a floor the market itself enforces — "nobody can
 * sell this under 400 ₺" — and someone breaking it is the signal, typically counterfeit or a
 * distributor breaking terms. The others are relative because a fixed number written today is
 * stale in three months and nobody revisits it; the UI shows a fixed threshold alongside the
 * current market price for exactly that reason.
 */
export type AlertThresholdType = 'fixed' | 'belowOurPrice' | 'belowFloor' | 'pctBelowOurs';

export interface AlertRule {
  readonly id: string;
  readonly name: string;
  readonly scopeType: AlertScopeType;
  /** Listing id, base stock code or marketplace code; `null` when the scope is `all`. */
  readonly scopeValue: string | null;
  readonly subjectType: AlertSubjectType;
  /** Seller ref for `seller`, group id for `sellerGroup`; `null` when the subject is `any`. */
  readonly subjectValue: string | null;
  readonly predicate: AlertPredicate;
  readonly thresholdType: AlertThresholdType;
  /** Kuruş. Required by `fixed`, ignored otherwise. Money is `bigint`, thresholds included. */
  readonly thresholdValue: bigint | null;
  /** Whole percent. Required by `pctBelowOurs`, ignored otherwise. */
  readonly thresholdPct: number | null;
  readonly enabled: boolean;
}

/** The listing being evaluated, with the two prices a relative threshold can be measured against. */
export interface AlertListingContext {
  readonly listingId: string;
  readonly marketplaceCode: string;
  readonly baseStockCode: string | null;
  readonly ourPrice: Money;
  /** `null` when the floor could not be computed; `belowFloor` rules then cannot be evaluated. */
  readonly floorPrice: Money | null;
}

export interface AlertOffer {
  readonly sellerRef: string | null;
  readonly sellerName: string;
  readonly rank: number;
  /** The shelf/discounted price. */
  readonly price: Money | null;
  /** The coupon-applicable price where the marketplace exposes one. */
  readonly finalPrice: Money | null;
  /** Kept for display beside a match — never parsed, never a source of a price (CLAUDE.md). */
  readonly promotionText: string | null;
}

/** Which of the two price fields the comparison actually used, recorded on every match. */
export type PriceSource = 'finalPrice' | 'price';

export interface AlertMatch {
  readonly sellerRef: string | null;
  readonly sellerName: string;
  readonly rank: number;
  readonly observedPrice: bigint;
  readonly priceSource: PriceSource;
  readonly promotionText: string | null;
}

export interface AlertEvaluation {
  readonly ruleId: string;
  readonly listingId: string;
  /** The price the rule compared against, for the evidence snapshot. `null` for presence rules. */
  readonly thresholdApplied: bigint | null;
  readonly matches: readonly AlertMatch[];
  /**
   * Set when the rule was in scope but could not be judged — a `belowFloor` rule on a listing
   * with no computable floor, a `pctBelowOurs` rule where our own price is zero, an offer whose
   * price the payload never carried. Reported rather than silently treated as "no match", since
   * those look identical on a dashboard and mean opposite things.
   */
  readonly undecidable: string | null;
}

/**
 * The customer-facing price of an offer.
 *
 * `finalPrice ?? price`, and which one was used travels with the result. Hepsiburada hard-codes
 * `finalPrice` to `null` for every offer (api-references §2.11) — a rule reading it alone would
 * never fire there, silently, across a whole marketplace rather than on one listing. Trendyol
 * has never once produced a `finalPrice` that differs from `price` in the live archive, and
 * whether that is correct is still open (api-references §1.6), so recording the source is what
 * makes a stored alert re-interpretable once it is settled.
 */
function customerPrice(offer: AlertOffer): { value: Money; source: PriceSource } | null {
  if (offer.finalPrice !== null) return { value: offer.finalPrice, source: 'finalPrice' };
  if (offer.price !== null) return { value: offer.price, source: 'price' };
  return null;
}

function inScope(rule: AlertRule, listing: AlertListingContext): boolean {
  switch (rule.scopeType) {
    case 'all':
      return true;
    case 'marketplace':
      return rule.scopeValue === listing.marketplaceCode;
    case 'listing':
      return rule.scopeValue === listing.listingId;
    case 'baseStockCode':
      return rule.scopeValue !== null && rule.scopeValue === listing.baseStockCode;
  }
}

/**
 * Whether an offer is the seller this rule is about.
 *
 * A group subject matches any of its members, which is the whole point of grouping: the
 * operator asserts that Trendyol's merchant and Hepsiburada's merchant are one company, and one
 * rule then covers both. `groupOf` maps a seller ref to its group id and is supplied by the
 * caller — this function stays pure and knows nothing about how that mapping was stored.
 *
 * An offer with no seller ref never matches a targeted rule. It has no identity to target, and
 * falling back to the display name is the misidentification `competitor_seller_groups` exists
 * to prevent. It can still match an `any` rule, where no identity is claimed.
 */
function matchesSubject(
  rule: AlertRule,
  offer: AlertOffer,
  groupOf: ReadonlyMap<string, string>,
): boolean {
  switch (rule.subjectType) {
    case 'any':
      return true;
    case 'seller':
      return offer.sellerRef !== null && offer.sellerRef === rule.subjectValue;
    case 'sellerGroup':
      return offer.sellerRef !== null && groupOf.get(offer.sellerRef) === rule.subjectValue;
  }
}

interface Threshold {
  readonly value: Money | null;
  readonly undecidable: string | null;
}

function resolveThreshold(rule: AlertRule, listing: AlertListingContext): Threshold {
  switch (rule.thresholdType) {
    case 'fixed':
      if (rule.thresholdValue === null) {
        return { value: null, undecidable: 'Sabit eşik tanımlı değil.' };
      }
      return { value: Money.fromKurus(rule.thresholdValue), undecidable: null };
    case 'belowOurPrice':
      return { value: listing.ourPrice, undecidable: null };
    case 'belowFloor':
      if (listing.floorPrice === null) {
        return { value: null, undecidable: 'Bu ilan için taban fiyat hesaplanamadı.' };
      }
      return { value: listing.floorPrice, undecidable: null };
    case 'pctBelowOurs': {
      if (rule.thresholdPct === null) {
        return { value: null, undecidable: 'Yüzde eşiği tanımlı değil.' };
      }
      if (!listing.ourPrice.isPositive()) {
        return { value: null, undecidable: 'Kendi fiyatımız sıfır; yüzdeye göre eşik hesaplanamaz.' };
      }
      // ourPrice × (100 − pct) / 100, rounded by Money's single half-up rule.
      const remaining = BigInt(100 - rule.thresholdPct);
      return { value: listing.ourPrice.multiplyByFraction(remaining, 100n), undecidable: null };
    }
  }
}

/**
 * Evaluates every rule against one listing's freshly-observed offers.
 *
 * Deliberately takes the **snapshot**, not the stored observations. `competitor_observations`
 * is only written when the seller set changes, so a rule created today against a product whose
 * offers have been stable for a week would never be evaluated at all if this read the table.
 * The scrape has the offers in hand either way.
 */
export function evaluateAlertRules(input: {
  readonly rules: readonly AlertRule[];
  readonly listing: AlertListingContext;
  readonly offers: readonly AlertOffer[];
  readonly groupOf: ReadonlyMap<string, string>;
}): AlertEvaluation[] {
  const { rules, listing, offers, groupOf } = input;
  const evaluations: AlertEvaluation[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!inScope(rule, listing)) continue;

    const candidates = offers.filter((offer) => matchesSubject(rule, offer, groupOf));

    if (rule.predicate === 'sellerPresent') {
      evaluations.push({
        ruleId: rule.id,
        listingId: listing.listingId,
        thresholdApplied: null,
        matches: candidates.map((offer) => {
          const priced = customerPrice(offer);
          return {
            sellerRef: offer.sellerRef,
            sellerName: offer.sellerName,
            rank: offer.rank,
            // Presence does not depend on a price; where one exists it is carried for evidence,
            // and where it does not the match still stands.
            observedPrice: priced?.value.toKurus() ?? 0n,
            priceSource: priced?.source ?? 'price',
            promotionText: offer.promotionText,
          };
        }),
        undecidable: null,
      });
      continue;
    }

    const threshold = resolveThreshold(rule, listing);
    if (threshold.value === null) {
      evaluations.push({
        ruleId: rule.id,
        listingId: listing.listingId,
        thresholdApplied: null,
        matches: [],
        undecidable: threshold.undecidable,
      });
      continue;
    }

    const matches: AlertMatch[] = [];
    let unpriced = 0;
    for (const offer of candidates) {
      const priced = customerPrice(offer);
      if (priced === null) {
        unpriced += 1;
        continue;
      }
      // Strictly below. An offer exactly at the threshold has not broken it — a rule reading
      // "below 400" firing at 400 would make an operator's own floor price alert on itself.
      if (priced.value.compareTo(threshold.value) < 0) {
        matches.push({
          sellerRef: offer.sellerRef,
          sellerName: offer.sellerName,
          rank: offer.rank,
          observedPrice: priced.value.toKurus(),
          priceSource: priced.source,
          // Carried for the operator to read beside the match, never parsed. Quantity-tiered
          // promotions ("3 adet ve üzeri 150 TL indirim") advertise reductions that no price
          // field carries and must not count as a breach — measured and confirmed 2026-08-18.
          promotionText: offer.promotionText,
        });
      }
    }

    evaluations.push({
      ruleId: rule.id,
      listingId: listing.listingId,
      thresholdApplied: threshold.value.toKurus(),
      matches,
      undecidable:
        unpriced > 0 && matches.length === 0
          ? `${unpriced} teklifin fiyatı okunamadı; bu kural bu ilanda değerlendirilemedi.`
          : null,
    });
  }

  return evaluations;
}

/**
 * The identity of the alert an evaluation belongs to.
 *
 * A rule naming one seller keys per seller — there is only ever one, and splitting is moot. A
 * rule about *anyone* keys per listing, so a market-wide breach is one dashboard row carrying
 * its offenders rather than twenty rows the operator has to reassemble. The offending sellers
 * are still individually recorded underneath, so "who" and "since when" survive; only the
 * grouping changes.
 */
export function alertKey(rule: AlertRule, listingId: string, sellerRef: string | null): string {
  if (rule.subjectType === 'any') return `${rule.id}::${listingId}`;
  return `${rule.id}::${listingId}::${sellerRef ?? ''}`;
}
