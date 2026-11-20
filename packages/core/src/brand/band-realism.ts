/**
 * Is a brand product's band anywhere near the market? (brand roadmap §6.12, "PSF gerçekçilik").
 *
 * When every seller's price over a whole period sits above the upper bound — or below the min —
 * the band is not describing the market, and every alarm it raises says the same thing. The
 * product screen then shows a note with the median price, so the manager can decide whether the
 * band or the market is wrong. A note only: nothing here opens, closes or silences an alarm.
 *
 * Pure. The caller hands in the period's successful looks (every seller, not only the buybox,
 * each at the price the band judges: coupon price, falling back to the shelf price) and the
 * card's multiplier. As everywhere in this module, the **bound is multiplied**, never the price
 * divided; the median is divided for display only (`unitPriceForDisplay`).
 */
import { cardBand, effectiveBand, unitPriceForDisplay, type BrandProductPrices } from './band.js';

/** Fewer looks than this say nothing about the market. */
export const BAND_REALISM_MIN_LOOKS = 10;

export interface RealismObservation {
  /** The card's price as judged — `finalPrice ?? price`, kuruş, > 0. */
  readonly price: bigint;
  readonly unitMultiplier: number;
}

export type BandRealismKind = 'insufficient' | 'consistent' | 'allAbove' | 'allBelow';

export interface BandRealism {
  readonly kind: BandRealismKind;
  readonly looks: number;
  /** Per unit, for display. `null` with no looks. */
  readonly medianUnitPrice: bigint | null;
}

function median(sorted: readonly bigint[]): bigint | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  // Half up, in kuruş — the convention `unitPriceForDisplay` uses.
  return (sorted[mid - 1]! + sorted[mid]! + 1n) / 2n;
}

export function assessBandRealism(prices: BrandProductPrices, observations: readonly RealismObservation[]): BandRealism {
  const unit = effectiveBand(prices);
  const units = observations
    .map((o) => unitPriceForDisplay(o.price, o.unitMultiplier))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const base = { looks: observations.length, medianUnitPrice: median(units) };
  if (observations.length < BAND_REALISM_MIN_LOOKS) return { kind: 'insufficient', ...base };

  const allAbove = observations.every((o) => o.price > cardBand(unit, o.unitMultiplier).upper);
  if (allAbove) return { kind: 'allAbove', ...base };
  const allBelow =
    unit.lower !== null &&
    observations.every((o) => {
      const lower = cardBand(unit, o.unitMultiplier).lower;
      return lower !== null && o.price < lower;
    });
  return { kind: allBelow ? 'allBelow' : 'consistent', ...base };
}
