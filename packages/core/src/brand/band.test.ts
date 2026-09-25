/**
 * Table-driven, like every decision branch in this package. Amounts are kuruş.
 */
import { describe, expect, it } from 'vitest';
import {
  cardBand,
  checkBrandProductPrices,
  effectiveBand,
  evaluateBand,
  isValidUnitMultiplier,
  scaleToCard,
  unitPriceForDisplay,
  type BrandProductPrices,
} from './band.js';

function prices(overrides: Partial<BrandProductPrices> = {}): BrandProductPrices {
  return { referencePrice: 100_00n, minPrice: null, maxPrice: null, ...overrides };
}

describe('effectiveBand', () => {
  it.each([
    {
      name: 'no min, no max: no lower bound, PSF is the upper bound',
      input: prices(),
      expected: { lower: null, upper: 100_00n, upperIsReferencePrice: true },
    },
    {
      name: 'min only: lower is min, upper still defaults to PSF',
      input: prices({ minPrice: 80_00n }),
      expected: { lower: 80_00n, upper: 100_00n, upperIsReferencePrice: true },
    },
    {
      name: 'max set: it replaces PSF as the upper bound',
      input: prices({ maxPrice: 120_00n }),
      expected: { lower: null, upper: 120_00n, upperIsReferencePrice: false },
    },
    {
      name: 'max equal to PSF is still an explicit max',
      input: prices({ maxPrice: 100_00n }),
      expected: { lower: null, upper: 100_00n, upperIsReferencePrice: false },
    },
    {
      name: 'both set',
      input: prices({ minPrice: 90_00n, maxPrice: 110_00n }),
      expected: { lower: 90_00n, upper: 110_00n, upperIsReferencePrice: false },
    },
  ])('$name', ({ input, expected }) => {
    expect(effectiveBand(input)).toEqual(expected);
  });
});

describe('cardBand', () => {
  it.each([
    { name: '×1 leaves the band unchanged', multiplier: 1, lower: 33_33n, upper: 49_99n },
    // The point of multiplying: 33,33 × 3 = 99,99 exactly, where 99,99 / 3 would have to round.
    { name: '×3 scales both bounds exactly', multiplier: 3, lower: 99_99n, upper: 149_97n },
    { name: '×12 scales exactly', multiplier: 12, lower: 399_96n, upper: 599_88n },
  ])('$name', ({ multiplier, lower, upper }) => {
    const band = effectiveBand(prices({ referencePrice: 49_99n, minPrice: 33_33n }));
    expect(cardBand(band, multiplier)).toEqual({ lower, upper, upperIsReferencePrice: true });
  });

  it('keeps a missing lower bound missing', () => {
    expect(cardBand(effectiveBand(prices()), 4)).toEqual({
      lower: null,
      upper: 400_00n,
      upperIsReferencePrice: true,
    });
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses multiplier %s', (multiplier) => {
    expect(() => cardBand(effectiveBand(prices()), multiplier)).toThrow(RangeError);
  });
});

describe('scaleToCard / isValidUnitMultiplier', () => {
  it.each([
    { multiplier: 1, valid: true },
    { multiplier: 2, valid: true },
    { multiplier: 0, valid: false },
    { multiplier: -3, valid: false },
    { multiplier: 2.5, valid: false },
    { multiplier: Number.POSITIVE_INFINITY, valid: false },
  ])('multiplier $multiplier → valid: $valid', ({ multiplier, valid }) => {
    expect(isValidUnitMultiplier(multiplier)).toBe(valid);
  });

  it('multiplies a per-unit amount', () => {
    expect(scaleToCard(1_249_90n, 3)).toBe(3_749_70n);
  });
});

describe('checkBrandProductPrices', () => {
  it.each([
    { name: 'PSF only is clean', input: prices(), errors: [], warnings: [] },
    {
      name: 'a sensible band is clean',
      input: prices({ minPrice: 90_00n, maxPrice: 110_00n }),
      errors: [],
      warnings: [],
    },
    { name: 'zero PSF', input: prices({ referencePrice: 0n }), errors: ['nonPositive'], warnings: [] },
    { name: 'negative min', input: prices({ minPrice: -1n }), errors: ['nonPositive'], warnings: [] },
    {
      name: 'a PSF past the 100 million ₺ ceiling',
      input: prices({ referencePrice: 100_000_000_01n }),
      errors: ['tooLarge'],
      warnings: [],
    },
    {
      // No max: the upper bound is PSF, and a min above it means nothing could ever be in band.
      name: 'min above PSF with no max',
      input: prices({ minPrice: 100_01n }),
      errors: ['minAboveUpper'],
      warnings: ['referenceBelowMin'],
    },
    {
      name: 'min above an explicit max',
      input: prices({ minPrice: 120_00n, maxPrice: 110_00n }),
      errors: ['minAboveUpper'],
      warnings: ['referenceBelowMin'],
    },
    {
      name: 'min equal to the upper bound is allowed',
      input: prices({ minPrice: 100_00n }),
      errors: [],
      warnings: [],
    },
    {
      // Coherent — PSF is simply outside the manager's own band — so flagged, not refused.
      name: 'PSF below min, under a higher max',
      input: prices({ minPrice: 110_00n, maxPrice: 130_00n }),
      errors: [],
      warnings: ['referenceBelowMin'],
    },
    {
      name: 'PSF above an explicit max',
      input: prices({ maxPrice: 90_00n }),
      errors: [],
      warnings: ['referenceAboveMax'],
    },
  ])('$name', ({ input, errors, warnings }) => {
    expect(checkBrandProductPrices(input)).toEqual({ errors, warnings });
  });
});

describe('unitPriceForDisplay', () => {
  it.each([
    { name: 'a ×1 card is its own unit price', amount: 49_90n, multiplier: 1, expected: 49_90n },
    { name: 'a ×6 card that divides exactly', amount: 299_40n, multiplier: 6, expected: 49_90n },
    { name: 'rounds half up', amount: 101n, multiplier: 2, expected: 51n },
    { name: 'rounds down below the half', amount: 100n, multiplier: 3, expected: 33n },
  ])('$name', ({ amount, multiplier, expected }) => {
    expect(unitPriceForDisplay(amount, multiplier)).toBe(expected);
  });

  /**
   * The reason the function's doc comment forbids using it to compare. A card one kuruş above
   * six times the PSF rounds to exactly the PSF per unit, so an eye — or a comparison — reading
   * the rounded figure would call an out-of-band price in-band. `evaluateBand` multiplies.
   */
  it('rounds away a breach that multiplying the threshold still catches', () => {
    expect(unitPriceForDisplay(299_41n, 6)).toBe(49_90n);
    expect(evaluateBand(prices({ referencePrice: 49_90n }), 6, buybox(299_41n)).status).toBe('aboveMax');
  });
});

function buybox(finalPrice: bigint | null, price: bigint | null = null) {
  return { finalPrice, price };
}

describe('evaluateBand (doc 17 §5.1)', () => {
  it.each([
    {
      name: 'inside the band, min set',
      input: prices({ minPrice: 80_00n, maxPrice: 120_00n }),
      multiplier: 1,
      offer: buybox(100_00n),
      status: 'inBand',
    },
    {
      name: 'below an explicit min',
      input: prices({ minPrice: 80_00n }),
      multiplier: 1,
      offer: buybox(79_99n),
      status: 'belowMin',
    },
    {
      // §2.3: an unset max means PSF is the upper bound, so this is above it.
      name: 'no max: PSF is the upper bound and a price above it breaches',
      input: prices(),
      multiplier: 1,
      offer: buybox(100_01n),
      status: 'aboveMax',
    },
    {
      name: 'no min: nothing is ever below the band',
      input: prices(),
      multiplier: 1,
      offer: buybox(1n),
      status: 'inBand',
    },
    {
      name: 'a ×6 card is judged against six times the band',
      input: prices({ referencePrice: 49_90n, minPrice: 39_90n }),
      multiplier: 6,
      offer: buybox(299_40n),
      status: 'inBand',
    },
    {
      name: 'a ×6 card a kuruş under six times the min is below it',
      input: prices({ referencePrice: 49_90n, minPrice: 39_90n }),
      multiplier: 6,
      offer: buybox(239_39n),
      status: 'belowMin',
    },
    {
      name: 'exactly on the min is in band, not below it',
      input: prices({ minPrice: 80_00n }),
      multiplier: 1,
      offer: buybox(80_00n),
      status: 'inBand',
    },
    {
      name: 'exactly on the upper bound is in band, not above it',
      input: prices({ maxPrice: 120_00n }),
      multiplier: 1,
      offer: buybox(120_00n),
      status: 'inBand',
    },
    {
      name: 'nobody selling: unknown, never a breach',
      input: prices({ minPrice: 80_00n }),
      multiplier: 1,
      offer: null,
      status: 'unknown',
    },
    {
      name: 'an offer with no price at all: unknown',
      input: prices({ minPrice: 80_00n }),
      multiplier: 1,
      offer: buybox(null, null),
      status: 'unknown',
    },
    {
      // A zero from a bad parse must not open a violation, let alone notify one.
      name: 'a non-positive price is a bad read, not a giveaway',
      input: prices({ minPrice: 80_00n }),
      multiplier: 1,
      offer: buybox(0n),
      status: 'unknown',
    },
  ])('$name', ({ input, multiplier, offer, status }) => {
    expect(evaluateBand(input, multiplier, offer).status).toBe(status);
  });

  it('judges finalPrice when there is one, and says so', () => {
    // 95,00 is in band and 79,99 is not: which field is read decides the answer, so the
    // evaluation carries the field it used.
    const result = evaluateBand(prices({ minPrice: 80_00n }), 1, { finalPrice: 79_99n, price: 95_00n });
    expect(result).toMatchObject({ status: 'belowMin', observedPrice: 79_99n, priceSource: 'finalPrice' });
  });

  it('falls back to price when the offer carries no finalPrice', () => {
    const result = evaluateBand(prices({ minPrice: 80_00n }), 1, buybox(null, 95_00n));
    expect(result).toMatchObject({ status: 'inBand', observedPrice: 95_00n, priceSource: 'price' });
  });

  /** §5.3's `threshold_applied`: the bound a violation was measured against, card-scaled. */
  it('reports the card-scaled band it measured against', () => {
    const result = evaluateBand(prices({ referencePrice: 49_90n, minPrice: 39_90n }), 3, buybox(150_00n));
    expect(result.band).toEqual({ lower: 119_70n, upper: 149_70n, upperIsReferencePrice: true });
    expect(result.violations).toEqual(['aboveMax']);
  });
});
