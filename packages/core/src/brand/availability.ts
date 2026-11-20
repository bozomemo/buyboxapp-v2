/**
 * Shelf and stock warnings for a brand product's card (brand roadmap §6.8).
 *
 * A brand manager's second question after price is availability: is my product on the shelf at
 * all, and is it on the shelf of someone I authorised? Pure: the caller hands in what the card's
 * last **successful** look found, with each seller's policy verdict already resolved, and gets
 * back the issues. Nothing here reads a database or a clock.
 *
 * - `noSellers` — the last successful look found nobody selling (`has_sellers = false`).
 * - `onlyUnauthorised` — sellers, but none of them authorised. Only said when at least one
 *   authorised rule is in force for the card's brand: without such a rule every seller is
 *   "undecided" and the warning would fire on every card.
 * - `lowStock` — the buybox holder's offered stock is under the threshold. The marketplace's
 *   displayed number, not the seller's real stock: some sellers show a fixed figure.
 *
 * A card never successfully read (`hasSellers === null`) has no issue: "we have not looked" is
 * not "nobody sells it" (doc 17 §5.3).
 */
import type { SellerPolicyVerdict } from './seller-policy.js';

/** Under this many units on the buybox offer, the stock is "low". At the value, it is not. */
export const LOW_STOCK_THRESHOLD = 3;

export type AvailabilityIssue = 'noSellers' | 'onlyUnauthorised' | 'lowStock';

export interface AvailabilityOffer {
  readonly rank: number | null;
  /** `null` when no policy scope applies to the card. */
  readonly verdict: SellerPolicyVerdict | null;
  readonly offeredStock: number | null;
}

export interface AvailabilityInput {
  /** From the card: `null` until a successful look. */
  readonly hasSellers: boolean | null;
  /** The last successful look's offers. */
  readonly offers: readonly AvailabilityOffer[];
  /** At least one `authorised` rule applies to the card's brand. */
  readonly policyInForce: boolean;
  readonly lowStockThreshold: number;
}

export function classifyAvailability(input: AvailabilityInput): AvailabilityIssue[] {
  if (input.hasSellers === null) return [];
  if (input.hasSellers === false) return ['noSellers'];
  if (input.offers.length === 0) return [];

  const issues: AvailabilityIssue[] = [];
  if (input.policyInForce && !input.offers.some((o) => o.verdict === 'authorised')) {
    issues.push('onlyUnauthorised');
  }
  const buybox = input.offers.find((o) => o.rank === 1);
  if (buybox !== undefined && buybox.offeredStock !== null && buybox.offeredStock < input.lowStockThreshold) {
    issues.push('lowStock');
  }
  return issues;
}
