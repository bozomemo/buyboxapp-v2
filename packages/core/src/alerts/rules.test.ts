import { Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import {
  alertKey,
  evaluateAlertRules,
  type AlertListingContext,
  type AlertOffer,
  type AlertRule,
} from './rules.js';

const LISTING: AlertListingContext = {
  listingId: 'listing-1',
  marketplaceCode: 'trendyol',
  baseStockCode: 'SKU-1',
  ourPrice: Money.fromKurus(50_000n), // 500,00 ₺
  floorPrice: Money.fromKurus(40_000n), // 400,00 ₺
};

function rule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule-1',
    name: 'Test',
    scopeType: 'all',
    scopeValue: null,
    subjectType: 'any',
    subjectValue: null,
    predicate: 'priceBelow',
    thresholdType: 'fixed',
    thresholdValue: 40_000n,
    thresholdPct: null,
    enabled: true,
    ...overrides,
  };
}

function offer(overrides: Partial<AlertOffer> = {}): AlertOffer {
  return {
    sellerRef: 's-1',
    sellerName: 'Rakip A',
    rank: 1,
    price: Money.fromKurus(45_000n),
    finalPrice: null,
    promotionText: null,
    ...overrides,
  };
}

const NO_GROUPS = new Map<string, string>();

function evaluate(rules: AlertRule[], offers: AlertOffer[], groupOf = NO_GROUPS) {
  return evaluateAlertRules({ rules, listing: LISTING, offers, groupOf });
}

describe('alert scope', () => {
  it.each([
    ['all', null, true],
    ['marketplace', 'trendyol', true],
    ['marketplace', 'hepsiburada', false],
    ['listing', 'listing-1', true],
    ['listing', 'listing-2', false],
    ['baseStockCode', 'SKU-1', true],
    ['baseStockCode', 'SKU-9', false],
  ] as const)('%s=%s is in scope: %s', (scopeType, scopeValue, expected) => {
    const result = evaluate([rule({ scopeType, scopeValue, thresholdValue: 60_000n })], [offer()]);
    expect(result.length > 0).toBe(expected);
  });

  it('skips disabled rules entirely', () => {
    expect(evaluate([rule({ enabled: false, thresholdValue: 60_000n })], [offer()])).toEqual([]);
  });
});

describe('alert subject', () => {
  it('a seller rule matches only that merchant id', () => {
    const rules = [rule({ subjectType: 'seller', subjectValue: 's-1', thresholdValue: 60_000n })];
    expect(evaluate(rules, [offer({ sellerRef: 's-1' })])[0]!.matches).toHaveLength(1);
    expect(evaluate(rules, [offer({ sellerRef: 's-2' })])[0]!.matches).toHaveLength(0);
  });

  it('a group rule matches every member, across marketplaces', () => {
    const groupOf = new Map([
      ['s-1', 'g-1'],
      ['s-9', 'g-1'],
    ]);
    const rules = [rule({ subjectType: 'sellerGroup', subjectValue: 'g-1', thresholdValue: 60_000n })];
    const result = evaluate(rules, [offer({ sellerRef: 's-9' })], groupOf);
    expect(result[0]!.matches).toHaveLength(1);
  });

  // Falling back to the display name is the misidentification the grouping table exists to
  // prevent: two merchants can trade under the same name.
  it('an offer with no merchant id never matches a targeted rule, but can match "any"', () => {
    const targeted = rule({ subjectType: 'seller', subjectValue: 's-1', thresholdValue: 60_000n });
    const anyone = rule({ subjectType: 'any', thresholdValue: 60_000n });
    const anonymous = [offer({ sellerRef: null, sellerName: 'Rakip A' })];
    expect(evaluate([targeted], anonymous)[0]!.matches).toHaveLength(0);
    expect(evaluate([anyone], anonymous)[0]!.matches).toHaveLength(1);
  });
});

describe('alert thresholds', () => {
  it.each([
    ['fixed at 400,00 — offer 450,00', 'fixed', 40_000n, null, 45_000n, false],
    ['fixed at 400,00 — offer 399,99', 'fixed', 40_000n, null, 39_999n, true],
    ['belowOurPrice (500,00) — offer 499,99', 'belowOurPrice', null, null, 49_999n, true],
    ['belowOurPrice (500,00) — offer 500,00', 'belowOurPrice', null, null, 50_000n, false],
    ['belowFloor (400,00) — offer 399,00', 'belowFloor', null, null, 39_900n, true],
    ['belowFloor (400,00) — offer 400,00', 'belowFloor', null, null, 40_000n, false],
    ['pctBelowOurs 10% (450,00) — offer 449,00', 'pctBelowOurs', null, 10, 44_900n, true],
    ['pctBelowOurs 10% (450,00) — offer 450,00', 'pctBelowOurs', null, 10, 45_000n, false],
  ] as const)('%s', (_label, thresholdType, thresholdValue, thresholdPct, offerKurus, expected) => {
    const result = evaluate(
      [rule({ thresholdType, thresholdValue, thresholdPct })],
      [offer({ price: Money.fromKurus(offerKurus) })],
    );
    expect(result[0]!.matches.length === 1).toBe(expected);
  });

  // An operator's own floor firing an alert against itself would make the feature unusable.
  it('is strictly below: an offer exactly at the threshold is not a breach', () => {
    const result = evaluate(
      [rule({ thresholdType: 'fixed', thresholdValue: 40_000n })],
      [offer({ price: Money.fromKurus(40_000n) })],
    );
    expect(result[0]!.matches).toHaveLength(0);
  });

  it('records the threshold it actually applied, for the evidence snapshot', () => {
    const result = evaluate([rule({ thresholdType: 'pctBelowOurs', thresholdValue: null, thresholdPct: 10 })], [
      offer({ price: Money.fromKurus(44_900n) }),
    ]);
    expect(result[0]!.thresholdApplied).toBe(45_000n);
  });
});

describe('undecidable rather than silently negative', () => {
  it.each([
    [
      'belowFloor with no computable floor',
      rule({ thresholdType: 'belowFloor' }),
      { ...LISTING, floorPrice: null },
    ],
    [
      'pctBelowOurs when our own price is zero',
      rule({ thresholdType: 'pctBelowOurs', thresholdValue: null, thresholdPct: 10 }),
      { ...LISTING, ourPrice: Money.zero },
    ],
    [
      'fixed with no threshold stored',
      rule({ thresholdType: 'fixed', thresholdValue: null }),
      LISTING,
    ],
  ])('%s', (_label, r, listing) => {
    const [result] = evaluateAlertRules({
      rules: [r],
      listing,
      offers: [offer({ price: Money.fromKurus(1n) })],
      groupOf: NO_GROUPS,
    });
    expect(result!.matches).toHaveLength(0);
    // "Could not judge" and "judged, no breach" look identical on a dashboard and mean
    // opposite things, so the first is stated rather than collapsed into the second.
    expect(result!.undecidable).not.toBeNull();
  });

  it('reports an offer whose price the payload never carried', () => {
    const result = evaluate([rule({ thresholdValue: 60_000n })], [
      offer({ price: null, finalPrice: null }),
    ]);
    expect(result[0]!.matches).toHaveLength(0);
    expect(result[0]!.undecidable).toContain('okunamadı');
  });
});

describe('which price is compared', () => {
  it('prefers the coupon price and records that it did', () => {
    const result = evaluate([rule({ thresholdValue: 46_000n })], [
      offer({ price: Money.fromKurus(47_000n), finalPrice: Money.fromKurus(45_000n) }),
    ]);
    expect(result[0]!.matches[0]).toMatchObject({ observedPrice: 45_000n, priceSource: 'finalPrice' });
  });

  // Hepsiburada hard-codes finalPrice to null (api-references §2.11). Reading it alone would
  // make every rule silently dead across that whole marketplace.
  it('falls back to the shelf price and records that too', () => {
    const result = evaluate([rule({ thresholdValue: 46_000n })], [
      offer({ price: Money.fromKurus(45_000n), finalPrice: null }),
    ]);
    expect(result[0]!.matches[0]).toMatchObject({ observedPrice: 45_000n, priceSource: 'price' });
  });

  // Confirmed against the live site 2026-08-18: a "3 adet ve üzeri" discount moves no price
  // field, and must not be treated as one. CLAUDE.md: never derive a price from display text.
  it('never treats promotion text as a price', () => {
    const result = evaluate([rule({ thresholdValue: 40_000n })], [
      offer({
        price: Money.fromKurus(45_000n),
        promotionText: '3 Adet ve Üzeri 150 TL İndirim',
      }),
    ]);
    expect(result[0]!.matches).toHaveLength(0);
  });

  it('carries promotion text alongside a match, for the operator to read', () => {
    const result = evaluate([rule({ thresholdValue: 46_000n })], [
      offer({ price: Money.fromKurus(45_000n), promotionText: 'Sepette 10 TL İndirim' }),
    ]);
    expect(result[0]!.matches[0]!.promotionText).toBe('Sepette 10 TL İndirim');
  });
});

describe('presence rules', () => {
  it('matches regardless of price, including an offer with no price at all', () => {
    const result = evaluate(
      [rule({ predicate: 'sellerPresent', subjectType: 'seller', subjectValue: 's-1' })],
      [offer({ sellerRef: 's-1', price: null, finalPrice: null })],
    );
    expect(result[0]!.matches).toHaveLength(1);
    expect(result[0]!.thresholdApplied).toBeNull();
  });
});

describe('alert identity', () => {
  it('keys a targeted rule per seller and an "any" rule per listing', () => {
    const targeted = rule({ subjectType: 'seller', subjectValue: 's-1' });
    expect(alertKey(targeted, 'listing-1', 's-1')).not.toBe(alertKey(targeted, 'listing-1', 's-2'));

    // One market-wide breach is one dashboard row, not twenty; the offenders are recorded
    // underneath rather than as separate alerts.
    const anyone = rule({ subjectType: 'any' });
    expect(alertKey(anyone, 'listing-1', 's-1')).toBe(alertKey(anyone, 'listing-1', 's-2'));
  });
});

describe('multi-seller breach', () => {
  it('returns every offender under one evaluation', () => {
    const result = evaluate(
      [rule({ subjectType: 'any', thresholdType: 'fixed', thresholdValue: 40_000n })],
      [
        offer({ sellerRef: 's-1', price: Money.fromKurus(39_000n), rank: 1 }),
        offer({ sellerRef: 's-2', price: Money.fromKurus(38_000n), rank: 2 }),
        offer({ sellerRef: 's-3', price: Money.fromKurus(41_000n), rank: 3 }),
      ],
    );
    expect(result[0]!.matches.map((m) => m.sellerRef)).toEqual(['s-1', 's-2']);
  });
});
