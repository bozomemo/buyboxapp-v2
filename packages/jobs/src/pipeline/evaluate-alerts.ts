/**
 * The alert step of `ScrapeCompetitors` (doc 07 §1.1, doc 12 Phase 10C).
 *
 * Kept in its own module because it must stay *provably* separable from the scrape: it reads
 * the offers the scrape already fetched, writes only to the alert tables, and is invoked inside
 * a `try`/`catch` that cannot fail the run. Alerting is reporting — it can never reach a
 * pricing decision, and its failure degrades a dashboard, not the price of anything.
 *
 * It evaluates the **fresh snapshot**, deliberately not `competitor_observations`. Those rows
 * are only written when the seller set changes, so a rule created today against a product whose
 * offers have been stable for a week would otherwise never be evaluated at all — the single
 * most likely way for this feature to look broken to an operator.
 */
import {
  alertKey,
  evaluateAlertRules,
  type AlertListingContext,
  type AlertOffer,
  type AlertRule,
} from '@buybox/core';
import { alertsRepo, type AppDatabase } from '@buybox/db';
import { Money } from '@buybox/shared';
import type { CompetitorOffer } from '@buybox/adapters';

/** Rules as stored, narrowed to the union types the pure evaluator expects. */
export function toDomainRule(row: alertsRepo.AlertRuleRow): AlertRule {
  return {
    id: row.id,
    name: row.name,
    scopeType: row.scopeType as AlertRule['scopeType'],
    scopeValue: row.scopeValue,
    subjectType: row.subjectType as AlertRule['subjectType'],
    subjectValue: row.subjectValue,
    predicate: row.predicate as AlertRule['predicate'],
    thresholdType: row.thresholdType as AlertRule['thresholdType'],
    thresholdValue: row.thresholdValue,
    thresholdPct: row.thresholdPct,
    enabled: row.enabled,
  };
}

export function toAlertOffers(offers: readonly CompetitorOffer[]): AlertOffer[] {
  return offers.map((offer) => ({
    sellerRef: offer.sellerRef,
    sellerName: offer.sellerName ?? '',
    rank: offer.rank,
    price: offer.price,
    finalPrice: offer.finalPrice,
    promotionText: offer.promotionText,
  }));
}

export interface AlertEvaluationInput {
  readonly listing: AlertListingContext;
  readonly offers: readonly CompetitorOffer[];
  readonly payloadHash: string;
}

/**
 * Evaluates every enabled rule against one listing and folds the verdicts into alert state.
 *
 * Every in-scope rule produces an outcome, matched or not: `reconcileAlerts` resolves an open
 * alert only when it is told the rule no longer matches, so omitting the negatives would leave
 * cleared conditions open forever.
 */
export async function evaluateAlertsForListing(
  appDb: AppDatabase,
  rules: readonly alertsRepo.AlertRuleRow[],
  groupOf: ReadonlyMap<string, string>,
  input: AlertEvaluationInput,
  nowMs: number,
): Promise<alertsRepo.ReconcileResult> {
  const domainRules = rules.map(toDomainRule);
  const byId = new Map(rules.map((r) => [r.id, r]));

  const evaluations = evaluateAlertRules({
    rules: domainRules,
    listing: input.listing,
    offers: toAlertOffers(input.offers),
    groupOf,
  });

  const outcomes: alertsRepo.AlertOutcome[] = [];
  for (const evaluation of evaluations) {
    const stored = byId.get(evaluation.ruleId);
    const rule = domainRules.find((r) => r.id === evaluation.ruleId);
    if (!stored || !rule) continue;

    // A rule that could not be judged is left exactly as it is — neither opened nor resolved.
    // Treating "we could not tell" as "no breach" would silently close a real alert the moment
    // a floor price stopped computing.
    if (evaluation.undecidable !== null) continue;

    const snapshot = JSON.stringify({
      observedAt: nowMs,
      thresholdApplied: evaluation.thresholdApplied?.toString() ?? null,
      thresholdType: rule.thresholdType,
      ourPrice: input.listing.ourPrice.toKurus().toString(),
      floorPrice: input.listing.floorPrice?.toKurus().toString() ?? null,
      payloadHash: input.payloadHash,
      sellers: evaluation.matches.map((m) => ({
        sellerRef: m.sellerRef,
        sellerName: m.sellerName,
        rank: m.rank,
        price: m.observedPrice.toString(),
        priceSource: m.priceSource,
        promotionText: m.promotionText,
      })),
    });

    if (rule.subjectType === 'any') {
      // One alert per listing, carrying its offenders — a market-wide breach is one row on the
      // dashboard, not twenty, while `alert_sellers` keeps who and since when.
      outcomes.push({
        ruleId: rule.id,
        alertKey: alertKey(rule, evaluation.listingId, null),
        listingId: evaluation.listingId,
        sellerRef: null,
        quietPeriodMs: stored.quietPeriodMs,
        matched: evaluation.matches.length > 0,
        thresholdApplied: evaluation.thresholdApplied,
        snapshot: evaluation.matches.length > 0 ? snapshot : null,
        sellers: evaluation.matches.map((m) => ({
          sellerRef: m.sellerRef,
          sellerName: m.sellerName,
          observedPrice: m.observedPrice,
          priceSource: m.priceSource,
          rank: m.rank,
          promotionText: m.promotionText,
        })),
      });
      continue;
    }

    // A targeted rule names one seller, so there is at most one match and nothing to group.
    const match = evaluation.matches[0];
    outcomes.push({
      ruleId: rule.id,
      alertKey: alertKey(rule, evaluation.listingId, rule.subjectValue),
      listingId: evaluation.listingId,
      sellerRef: rule.subjectValue,
      quietPeriodMs: stored.quietPeriodMs,
      matched: match !== undefined,
      thresholdApplied: evaluation.thresholdApplied,
      snapshot: match !== undefined ? snapshot : null,
      sellers:
        match === undefined
          ? []
          : [
              {
                sellerRef: match.sellerRef,
                sellerName: match.sellerName,
                observedPrice: match.observedPrice,
                priceSource: match.priceSource,
                rank: match.rank,
                promotionText: match.promotionText,
              },
            ],
    });
  }

  return alertsRepo.reconcileAlerts(appDb, outcomes, nowMs);
}

/** Our own price and floor for a listing, as the relative thresholds need them. */
export function toListingContext(listing: {
  id: string;
  marketplaceCode: string;
  baseStockCode: string | null;
  price: bigint;
  minPrice: bigint | null;
}): AlertListingContext {
  return {
    listingId: listing.id,
    marketplaceCode: listing.marketplaceCode,
    baseStockCode: listing.baseStockCode,
    ourPrice: Money.fromKurus(listing.price),
    // The operator's floor override where one is set. The engine's computed floor needs the
    // full cost model (doc 02) and is not reachable from the reporting-only scrape path — a
    // `belowFloor` rule on a listing without an explicit floor reports itself as undecidable
    // rather than quietly comparing against something else.
    floorPrice: listing.minPrice === null ? null : Money.fromKurus(listing.minPrice),
  };
}
