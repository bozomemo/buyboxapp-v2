/**
 * Whether a seller is allowed to sell a brand we own (doc 06 §12.4, Faz 5).
 *
 * Pure: rules and a seller in, a verdict out. No I/O, no clock. The rules come from
 * `seller_policies` (doc 05 §5) and the seller from the brand report; nothing here reads either.
 *
 * ## The three states are three, not two
 *
 * `authorised`, `blocked` and **`undefined`** — and the third is a real state, not the absence
 * of an answer. "We have not looked at this seller yet" is not "this seller is unauthorised",
 * and a system that collapsed them would send a distributor after every new marketplace seller
 * the moment they appear. Every verdict says which of the three it is, and an `undefined`
 * verdict is a normal result rather than a missing one.
 *
 * ## Identity is account-level, policy is brand-level
 *
 * A seller is one account on one marketplace (or one legal firm, by tax number). A policy is
 * about that seller **and one brand**: the same firm may be Whiskas' authorised distributor and
 * have no arrangement at all for Royal Canin, and 21% of Royal Canin's sellers were measured
 * also selling Whiskas, so this overlap is the normal case rather than an edge one.
 *
 * ## Precedence
 *
 * Two axes, resolved in this order, and both are "the more specific statement wins":
 *
 * 1. **Scope** — a rule written for one brand beats the group-wide default it sits under. That
 *    is what makes a group default useful: "Mars authorises this distributor for everything"
 *    plus "…except Royal Canin" is two rows, not one row per brand.
 * 2. **Identity** — within one scope, a rule naming the marketplace seller account beats one
 *    naming the tax number. The tax number is the stronger *identity* (one firm, many
 *    storefronts) but the seller ref is the more specific *statement*: an operator who wrote a
 *    ref meant this storefront, and a firm-wide rule should not silently override it.
 *
 * Nothing is ever matched by **display name**. Names collide, change and are chosen by the
 * seller; matching on one would apply a real company's policy to an unrelated company while
 * looking like it worked. This is the same rule `competitor_seller_groups` exists to protect
 * (doc 05 §5).
 */

export type SellerPolicyStatus = 'authorised' | 'blocked';

export type SellerPolicyVerdict = SellerPolicyStatus | 'undefined';

/** How a rule names the seller it is about. Never a display name — see the module header. */
export type SellerPolicyIdentity =
  | { readonly kind: 'sellerRef'; readonly marketplaceCode: string; readonly sellerRef: string }
  | { readonly kind: 'taxNumber'; readonly taxNumber: string };

/**
 * One operator statement: this seller, this scope, this verdict.
 *
 * `watchedBrandId` of `null` means the rule is the **group default** — it applies to every brand
 * in the group that does not override it.
 */
export interface SellerPolicyRule {
  readonly id: string;
  readonly watchedBrandGroupId: string;
  readonly watchedBrandId: string | null;
  readonly identity: SellerPolicyIdentity;
  readonly status: SellerPolicyStatus;
  /**
   * The operator's own words about why. Free text and nothing else — the product owner's
   * decision, 2026-08-27: a date field and a document field would look like a compliance record
   * and be filled in inconsistently, whereas a note is honestly what it is.
   */
  readonly note: string | null;
}

/** The seller a verdict is being asked about. */
export interface SellerIdentityFacts {
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  /**
   * The firm behind the storefront, when we know it. `null` until an operator records one by
   * hand or Faz 7 resolves it from the marketplace — a tax-number rule simply does not match
   * until then, which is why a rule's effect is shown beside it on screen rather than assumed.
   */
  readonly taxNumber: string | null;
}

export interface SellerPolicyResolution {
  readonly verdict: SellerPolicyVerdict;
  /** The rule that decided it, or `null` for an `undefined` verdict. */
  readonly rule: SellerPolicyRule | null;
  /**
   * Rules that matched the seller but lost on precedence — the "…except Royal Canin" case seen
   * from the losing side. Surfaced so a screen can explain *why* a group default did not apply,
   * which is the question an operator asks the moment a verdict surprises them.
   */
  readonly overridden: readonly SellerPolicyRule[];
}

const NO_RULES: readonly SellerPolicyRule[] = [];

/** Does this rule name this seller at all? */
function identityMatches(rule: SellerPolicyRule, seller: SellerIdentityFacts): boolean {
  if (rule.identity.kind === 'sellerRef') {
    // Marketplace **and** ref. The same digits are different companies on different
    // marketplaces, and a ref-only match would hand one company another's policy.
    return (
      rule.identity.marketplaceCode === seller.marketplaceCode &&
      rule.identity.sellerRef === seller.sellerRef
    );
  }
  return seller.taxNumber !== null && rule.identity.taxNumber === seller.taxNumber;
}

/**
 * Higher wins. Scope is the outer axis and identity the inner one, so a brand-scoped tax-number
 * rule beats a group-scoped seller-ref rule — the operator narrowed the brand deliberately,
 * while the group rule was written without this brand in mind.
 */
function precedenceOf(rule: SellerPolicyRule): number {
  const scope = rule.watchedBrandId === null ? 0 : 2;
  const identity = rule.identity.kind === 'sellerRef' ? 1 : 0;
  return scope + identity;
}

/**
 * Resolves one seller against the rules in force for one brand.
 *
 * `rules` may be every rule the install holds; the brand and its group are filtered here so a
 * caller cannot get the scope filter subtly wrong in one place and right in another.
 *
 * A tie — two rules at the same precedence naming the same seller in the same scope — cannot
 * arise from the repository, which keeps one rule per identity per scope. Should one ever
 * arise (a hand-edited database), the **blocking** rule wins: between two contradictory
 * statements about whether a firm may sell a brand, the cautious reading is the one that
 * surfaces the question to a human rather than the one that silently clears it.
 */
export function resolveSellerPolicy(
  rules: readonly SellerPolicyRule[],
  seller: SellerIdentityFacts,
  brand: { readonly watchedBrandId: string; readonly watchedBrandGroupId: string },
): SellerPolicyResolution {
  const applicable = rules.filter(
    (rule) =>
      rule.watchedBrandGroupId === brand.watchedBrandGroupId &&
      (rule.watchedBrandId === null || rule.watchedBrandId === brand.watchedBrandId) &&
      identityMatches(rule, seller),
  );

  if (applicable.length === 0) {
    return { verdict: 'undefined', rule: null, overridden: NO_RULES };
  }

  let winner = applicable[0]!;
  for (const candidate of applicable.slice(1)) {
    const better = precedenceOf(candidate) - precedenceOf(winner);
    if (better > 0 || (better === 0 && candidate.status === 'blocked' && winner.status !== 'blocked')) {
      winner = candidate;
    }
  }

  return {
    verdict: winner.status,
    rule: winner,
    overridden: applicable.filter((rule) => rule !== winner),
  };
}
