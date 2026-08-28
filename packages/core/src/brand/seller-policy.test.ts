/**
 * Table-driven, like every decision branch in this package. The table is the specification: each
 * row names a situation an auditor can describe in a sentence, and the expected verdict.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveSellerPolicy,
  type SellerIdentityFacts,
  type SellerPolicyRule,
} from './seller-policy.js';

const GROUP = 'mars';
const WHISKAS = 'brand-whiskas';
const ROYAL_CANIN = 'brand-royal-canin';

const BRAND = { watchedBrandId: WHISKAS, watchedBrandGroupId: GROUP };

function seller(overrides: Partial<SellerIdentityFacts> = {}): SellerIdentityFacts {
  return { marketplaceCode: 'trendyol', sellerRef: 'm-1', taxNumber: null, ...overrides };
}

let ruleCounter = 0;
function rule(overrides: Partial<SellerPolicyRule> = {}): SellerPolicyRule {
  return {
    id: `rule-${ruleCounter++}`,
    watchedBrandGroupId: GROUP,
    watchedBrandId: WHISKAS,
    identity: { kind: 'sellerRef', marketplaceCode: 'trendyol', sellerRef: 'm-1' },
    status: 'authorised',
    note: null,
    ...overrides,
  };
}

describe('resolveSellerPolicy', () => {
  it('returns undefined when no rule names the seller', () => {
    // The state that must stay distinct from `blocked`: nobody has looked at this seller yet.
    expect(resolveSellerPolicy([], seller(), BRAND)).toEqual({
      verdict: 'undefined',
      rule: null,
      overridden: [],
    });
  });

  it('applies a brand rule that names the seller account', () => {
    const r = rule({ status: 'blocked', note: 'sözleşme feshedildi' });
    const result = resolveSellerPolicy([r], seller(), BRAND);
    expect(result.verdict).toBe('blocked');
    expect(result.rule).toBe(r);
  });

  it('applies a group default to a brand with no rule of its own', () => {
    const r = rule({ watchedBrandId: null });
    expect(resolveSellerPolicy([r], seller(), BRAND).rule).toBe(r);
  });

  it('lets a brand rule override the group default, and says which rule lost', () => {
    // The "Mars authorises them for everything, except Royal Canin" case — two rows, not one
    // row per brand.
    const groupDefault = rule({ watchedBrandId: null, status: 'authorised' });
    const brandOverride = rule({ watchedBrandId: WHISKAS, status: 'blocked' });
    const result = resolveSellerPolicy([groupDefault, brandOverride], seller(), BRAND);
    expect(result.verdict).toBe('blocked');
    expect(result.rule).toBe(brandOverride);
    expect(result.overridden).toEqual([groupDefault]);
  });

  it('overrides in the permissive direction too', () => {
    // A group-wide block with one brand carved out. Nothing about precedence favours blocking;
    // the more specific statement wins whichever way it points.
    const groupDefault = rule({ watchedBrandId: null, status: 'blocked' });
    const brandOverride = rule({ watchedBrandId: WHISKAS, status: 'authorised' });
    expect(resolveSellerPolicy([groupDefault, brandOverride], seller(), BRAND).verdict).toBe(
      'authorised',
    );
  });

  it('ignores a rule written for a different brand in the same group', () => {
    const other = rule({ watchedBrandId: ROYAL_CANIN, status: 'blocked' });
    expect(resolveSellerPolicy([other], seller(), BRAND).verdict).toBe('undefined');
  });

  it('ignores a rule from another group entirely', () => {
    // Two brand owners on one install must not be able to see or affect each other's policy.
    const foreign = rule({ watchedBrandGroupId: 'nestle', watchedBrandId: null, status: 'blocked' });
    expect(resolveSellerPolicy([foreign], seller(), BRAND).verdict).toBe('undefined');
  });

  describe('identity matching', () => {
    it('requires the marketplace to match, not just the ref', () => {
      // The same digits are different companies on different marketplaces.
      const r = rule({
        identity: { kind: 'sellerRef', marketplaceCode: 'hepsiburada', sellerRef: 'm-1' },
        status: 'blocked',
      });
      expect(resolveSellerPolicy([r], seller({ marketplaceCode: 'trendyol' }), BRAND).verdict).toBe(
        'undefined',
      );
    });

    it('matches a firm by tax number across its storefronts', () => {
      const r = rule({ identity: { kind: 'taxNumber', taxNumber: '1234567890' }, status: 'blocked' });
      const result = resolveSellerPolicy(
        [r],
        seller({ sellerRef: 'some-other-storefront', taxNumber: '1234567890' }),
        BRAND,
      );
      expect(result.verdict).toBe('blocked');
    });

    it('leaves a tax-number rule dormant while the seller has no tax number', () => {
      // Not a failure: until an operator records the firm behind a storefront (or Faz 7 resolves
      // it), we genuinely do not know whether the rule is about this seller. Guessing would be
      // the name-matching mistake wearing a different hat.
      const r = rule({ identity: { kind: 'taxNumber', taxNumber: '1234567890' }, status: 'blocked' });
      expect(resolveSellerPolicy([r], seller({ taxNumber: null }), BRAND).verdict).toBe('undefined');
    });

    it('prefers the rule naming the storefront over the one naming the firm', () => {
      // Within one scope the ref is the more specific statement: the operator who wrote it meant
      // this storefront, and a firm-wide rule should not silently override it.
      const firmRule = rule({
        identity: { kind: 'taxNumber', taxNumber: '1234567890' },
        status: 'blocked',
      });
      const storeRule = rule({ status: 'authorised' });
      const result = resolveSellerPolicy(
        [firmRule, storeRule],
        seller({ taxNumber: '1234567890' }),
        BRAND,
      );
      expect(result.verdict).toBe('authorised');
      expect(result.overridden).toEqual([firmRule]);
    });

    it('lets a brand-scoped firm rule beat a group-scoped storefront rule', () => {
      // Scope is the outer axis: the operator narrowed the brand deliberately, while the group
      // rule was written without this brand in mind.
      const groupStore = rule({ watchedBrandId: null, status: 'authorised' });
      const brandFirm = rule({
        watchedBrandId: WHISKAS,
        identity: { kind: 'taxNumber', taxNumber: '1234567890' },
        status: 'blocked',
      });
      expect(
        resolveSellerPolicy([groupStore, brandFirm], seller({ taxNumber: '1234567890' }), BRAND)
          .verdict,
      ).toBe('blocked');
    });
  });

  it('resolves a hand-edited tie towards blocking', () => {
    // Cannot arise through the repository, which keeps one rule per identity per scope. If it
    // ever does, the cautious reading surfaces the contradiction to a human rather than quietly
    // clearing the seller.
    const allow = rule({ status: 'authorised' });
    const block = rule({ status: 'blocked' });
    expect(resolveSellerPolicy([allow, block], seller(), BRAND).verdict).toBe('blocked');
    expect(resolveSellerPolicy([block, allow], seller(), BRAND).verdict).toBe('blocked');
  });

  it('never matches on display name', () => {
    // There is no name in `SellerIdentityFacts` at all, which is the point — the mistake is not
    // guarded against at run time, it is impossible to express. This test exists so that adding
    // a name field later has to break something visible.
    const facts = seller();
    expect(Object.keys(facts).sort()).toEqual(['marketplaceCode', 'sellerRef', 'taxNumber']);
  });
});
