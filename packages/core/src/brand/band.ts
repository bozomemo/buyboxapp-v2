/**
 * A brand product's price band (doc 17 §2.2, §2.3).
 *
 * PSF, min and max are stated **per unit** of the brand product. A card that sells a three-pack
 * is compared against them after scaling, and the scaling is done by **multiplying the
 * threshold, never by dividing the price**: `price < min × m`, not `price / m < min`. A kuruş
 * amount divided by three has no exact answer; a threshold multiplied by three always does.
 *
 * The effective upper bound — `max` if set, otherwise PSF — is derived here and nowhere else.
 * It is never stored: a stored copy would go stale the first time someone edited PSF.
 */

export interface BrandProductPrices {
  /** PSF, per unit, kuruş. Required. */
  readonly referencePrice: bigint;
  /** Per unit, kuruş. `null` = no lower-bound alarm. */
  readonly minPrice: bigint | null;
  /** Per unit, kuruş. `null` = PSF is the upper bound. */
  readonly maxPrice: bigint | null;
}

export interface EffectiveBand {
  /** `null` when the product has no `min`: there is then no lower bound to fall under. */
  readonly lower: bigint | null;
  /** Always present, because PSF is mandatory. */
  readonly upper: bigint;
  /** The upper bound is PSF standing in for an unset `max` — the screens mark it _PSF_. */
  readonly upperIsReferencePrice: boolean;
}

/** The per-unit band: `min` if set; `max` if set, otherwise PSF. */
export function effectiveBand(prices: BrandProductPrices): EffectiveBand {
  return {
    lower: prices.minPrice,
    upper: prices.maxPrice ?? prices.referencePrice,
    upperIsReferencePrice: prices.maxPrice === null,
  };
}

/** Units of the product one purchase of a card delivers: a whole number, at least 1. */
export function isValidUnitMultiplier(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function assertUnitMultiplier(value: number): void {
  if (!isValidUnitMultiplier(value)) {
    throw new RangeError(`unit multiplier must be a whole number ≥ 1, got ${value}`);
  }
}

/** A per-unit amount scaled to what one purchase of an ×`unitMultiplier` card should cost. */
export function scaleToCard(unitAmount: bigint, unitMultiplier: number): bigint {
  assertUnitMultiplier(unitMultiplier);
  return unitAmount * BigInt(unitMultiplier);
}

/** The band a card's own price is compared against: the per-unit band times its multiplier. */
export function cardBand(band: EffectiveBand, unitMultiplier: number): EffectiveBand {
  return {
    lower: band.lower === null ? null : scaleToCard(band.lower, unitMultiplier),
    upper: scaleToCard(band.upper, unitMultiplier),
    upperIsReferencePrice: band.upperIsReferencePrice,
  };
}

/**
 * A card price expressed per unit, **for display only** — the İlanlar grid's _birim fiyat_
 * column (doc 17 §4.1).
 *
 * This is the one place in the system that divides money by a multiplier, and it exists because
 * a human reading a ×6 card beside a per-unit PSF needs the two in the same terms. It must never
 * feed a comparison: `299,41 ₺ / 6` is `49,90 ₺` after rounding and `49,9016…` before it, so a
 * card a kuruş above six times the PSF would render as exactly at it. Every judgement multiplies
 * the threshold instead — see this file's header and `evaluateBand` below.
 *
 * Rounds half up in kuruş, the same convention `marketSnapshot`'s median uses. Amounts here are
 * prices and so never negative; the rounding is not defined for negatives.
 */
export function unitPriceForDisplay(cardAmount: bigint, unitMultiplier: number): bigint {
  assertUnitMultiplier(unitMultiplier);
  const m = BigInt(unitMultiplier);
  return (cardAmount * 2n + m) / (2n * m);
}

/** The two ways a buybox price can sit outside the band — one violation kind each (doc 17 §5.1). */
export type BandViolationKind = 'belowMin' | 'aboveMax';

/**
 * `unknown` is not a third kind of breach: it is the honest answer when nobody is selling, when
 * the look failed, or when the page gave no usable price. The screens show _bilinmiyor_ (§4.1)
 * and no violation is opened or resolved on it (§5.3: "a page we could not read says nothing
 * about the price on it").
 */
export type BandStatus = 'inBand' | BandViolationKind | 'unknown';

/** Which field the judged price came from — stored on a violation and shown beside it (§5.1). */
export type BandPriceSource = 'finalPrice' | 'price';

/** The buybox offer as the normaliser returns it: the rank-1 offer, prices in kuruş. */
export interface BuyboxPrice {
  readonly price: bigint | null;
  readonly finalPrice: bigint | null;
}

export interface BandEvaluation {
  readonly status: BandStatus;
  /**
   * The kinds breached, at most one in practice. A list rather than a single value because
   * §5.1 states the two checks as independent and §5.2 keys an open violation on `(card, kind)`
   * — the reconcile in 11.6 iterates kinds, and `minAboveUpper` (which alone could produce both)
   * is refused at entry by `checkBrandProductPrices`.
   */
  readonly violations: readonly BandViolationKind[];
  /** The price judged, in the card's own terms. `null` when the status is `unknown`. */
  readonly observedPrice: bigint | null;
  readonly priceSource: BandPriceSource | null;
  /**
   * The card-scaled bound the price was measured against — `threshold_applied` on a violation
   * (§5.3), so a violation opened under an old band still reads correctly after an edit.
   */
  readonly band: EffectiveBand;
}

/**
 * Where the buybox price of one card sits against its brand product's band (doc 17 §5.1).
 *
 * Pure, and the only judge of a band anywhere: both sweeps, `RescanTrackedProducts` and the
 * İlanlar grid ask this same function, so a row's colour on the screen and a violation in the
 * database can never disagree.
 *
 * - **The buybox holder only.** Other sellers outside the band are the audit findings' subject
 *   (doc 06 §12.4); "who sells my brand cheaply" and "what price is the customer shown" are
 *   different questions and both are kept.
 * - **`finalPrice`, falling back to `price`** — the price after the marketplace's own coupon is
 *   what the customer pays, and it is what the band is about.
 * - **Thresholds are multiplied, never the price divided.** A ×6 card is judged against six
 *   times the per-unit band, exactly, in kuruş.
 * - **The boundary is inside the band.** `price === min × m` is not below it and
 *   `price === upper × m` is not above it: a manager who sets a floor of 39,90 means 39,90 is
 *   allowed. Only a strict breach opens a violation.
 */
export function evaluateBand(
  prices: BrandProductPrices,
  unitMultiplier: number,
  buybox: BuyboxPrice | null,
): BandEvaluation {
  const band = cardBand(effectiveBand(prices), unitMultiplier);

  const source: BandPriceSource | null =
    buybox === null
      ? null
      : buybox.finalPrice !== null
        ? 'finalPrice'
        : buybox.price !== null
          ? 'price'
          : null;
  const observed = source === null ? null : source === 'finalPrice' ? buybox!.finalPrice! : buybox!.price!;

  // A non-positive price is a bad read, not a giveaway. Judging it would open a `belowMin`
  // violation — and, from 11.6, fire a notification — on a parse glitch.
  if (observed === null || observed <= 0n) {
    return { status: 'unknown', violations: [], observedPrice: null, priceSource: null, band };
  }

  const violations: BandViolationKind[] = [];
  if (band.lower !== null && observed < band.lower) violations.push('belowMin');
  if (observed > band.upper) violations.push('aboveMax');

  return {
    status: violations[0] ?? 'inBand',
    violations,
    observedPrice: observed,
    priceSource: source,
    band,
  };
}

/**
 * The problems with a set of per-unit prices, split the way the Excel import reports them
 * (doc 17 §3.5): an **error** rejects the row, a **warning** accepts it and flags it.
 *
 * - `nonPositive` — an amount ≤ 0. A zero PSF would make every seller "above" the band and every
 *   percentage built on it a division by zero.
 * - `minAboveUpper` — `min` above the effective upper bound. No price could ever be in band, so
 *   every card of the product would alarm for ever.
 * - `referenceBelowMin` / `referenceAboveMax` — PSF outside the manager's own band. Unusual but
 *   coherent (a PSF nobody is expected to sell at), so it is flagged rather than refused.
 */
/**
 * Ceilings on what a person types, **added 2026-09-25**. Far above any real pet-food price or pack
 * size, they exist because nothing stopped `99999999999999999999` ₺ (a 500 from the database
 * layer's 20-digit sortable encoding) or a ×1,000,000 card (a card PSF of 1.9 billion ₺).
 * `BRAND_UNIT_MULTIPLIER_MAX` is checked where a multiplier is *entered* only —
 * `isValidUnitMultiplier` stays the arithmetic's guard, so a value stored before this ceiling
 * still renders.
 */
export const BRAND_PRICE_MAX_KURUS = 100_000_000_00n; // 100 million ₺
export const BRAND_UNIT_MULTIPLIER_MAX = 1000;

export type BrandPriceError = 'nonPositive' | 'minAboveUpper' | 'tooLarge';
export type BrandPriceWarning = 'referenceBelowMin' | 'referenceAboveMax';

export interface BrandPriceCheck {
  readonly errors: readonly BrandPriceError[];
  readonly warnings: readonly BrandPriceWarning[];
}

export function checkBrandProductPrices(prices: BrandProductPrices): BrandPriceCheck {
  const errors: BrandPriceError[] = [];
  const warnings: BrandPriceWarning[] = [];
  const amounts = [prices.referencePrice, prices.minPrice, prices.maxPrice];
  if (amounts.some((amount) => amount !== null && amount <= 0n)) errors.push('nonPositive');
  if (amounts.some((amount) => amount !== null && amount > BRAND_PRICE_MAX_KURUS)) errors.push('tooLarge');
  const band = effectiveBand(prices);
  if (band.lower !== null && band.lower > band.upper) errors.push('minAboveUpper');
  if (prices.minPrice !== null && prices.referencePrice < prices.minPrice) warnings.push('referenceBelowMin');
  if (prices.maxPrice !== null && prices.referencePrice > prices.maxPrice) warnings.push('referenceAboveMax');
  return { errors, warnings };
}
