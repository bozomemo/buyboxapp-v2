/**
 * Table-driven, like every decision branch in this package. Amounts are kuruş.
 */
import { describe, expect, it } from 'vitest';
import { assessBandRealism, BAND_REALISM_MIN_LOOKS, type RealismObservation } from './band-realism.js';
import type { BrandProductPrices } from './band.js';

const BAND: BrandProductPrices = { referencePrice: 100_00n, minPrice: 80_00n, maxPrice: null };

function looks(prices: bigint[], unitMultiplier = 1): RealismObservation[] {
  return prices.map((price) => ({ price, unitMultiplier }));
}

const many = (price: bigint, n = BAND_REALISM_MIN_LOOKS) => Array.from({ length: n }, () => price);

describe('assessBandRealism (brand roadmap §6.12)', () => {
  it.each([
    { name: 'too few looks to say anything', obs: looks(many(150_00n, BAND_REALISM_MIN_LOOKS - 1)), kind: 'insufficient' },
    { name: 'every look above the upper bound', obs: looks(many(150_00n)), kind: 'allAbove' },
    { name: 'every look below the min', obs: looks(many(60_00n)), kind: 'allBelow' },
    { name: 'one look inside the band is enough to call it consistent', obs: looks([...many(150_00n), 90_00n]), kind: 'consistent' },
    { name: 'looks on both sides: the band is not off to one side', obs: looks([...many(150_00n, 5), ...many(60_00n, 5)]), kind: 'consistent' },
    { name: 'exactly at the upper bound is inside', obs: looks(many(100_00n)), kind: 'consistent' },
    // A ×3 card at 330,00 is 110,00 a unit: above a 100,00 PSF, judged on the multiplied bound.
    { name: 'multi-packs are judged against the multiplied bound', obs: looks(many(330_00n), 3), kind: 'allAbove' },
  ] as const)('$name', ({ obs, kind }) => {
    expect(assessBandRealism(BAND, obs).kind).toBe(kind);
  });

  it('never says "all below" when there is no min', () => {
    expect(assessBandRealism({ ...BAND, minPrice: null }, looks(many(10_00n))).kind).toBe('consistent');
  });

  it('reports the look count and the median unit price for display', () => {
    const result = assessBandRealism(BAND, [...looks(many(150_00n, 9)), ...looks([360_00n], 3)]);
    expect(result).toEqual({ kind: 'allAbove', looks: 10, medianUnitPrice: 150_00n });
  });

  it('an even count takes the midpoint, half up', () => {
    const result = assessBandRealism(BAND, looks([...many(120_00n, 5), ...many(120_01n, 5)]));
    expect(result.medianUnitPrice).toBe(120_01n);
  });

  it('no looks: no median', () => {
    expect(assessBandRealism(BAND, [])).toEqual({ kind: 'insufficient', looks: 0, medianUnitPrice: null });
  });
});
