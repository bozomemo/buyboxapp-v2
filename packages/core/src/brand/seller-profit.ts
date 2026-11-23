/**
 * The reseller profit estimate (doc 17 §8): how much the seller holding the buybox on a card
 * plausibly earns, given what the brand sells them the product for.
 *
 * **Reporting only.** Nothing here feeds a price, an alarm or a decision; it is a column on
 * İlanlar. Every input it cannot know is reported as missing rather than defaulted, because a
 * zero cost or a zero commission would print a confident, wrong profit.
 *
 * The model, per one purchase of a card at price `P` (no VAT anywhere — doc 02 §0):
 *
 *     profit = P − P × c(P) − cargo(desi) − operation(desi) − fixedSaleFee − unitPrice × m
 *
 * `c(P)` is the marketplace's **tiered** commission: the rate depends on which price band `P`
 * falls in (Trendyol _Komisyon Tarifeleri_). That makes profit non-monotonic in price — one kuruş
 * across a tier edge can move the commission from 6 % to 16.5 % — so the break-even is solved per
 * tier rather than once.
 *
 * Amounts are `bigint` kuruş, as everywhere in the brand module (`band.ts`); arithmetic runs in
 * `Fraction` and rounds once (doc 02 §1).
 */
import { Fraction } from '../fraction.js';

/** One commission band of a tariff. Bounds are inclusive kuruş; `null` = open on that side. */
export interface CommissionTier {
  readonly minPrice: bigint | null;
  readonly maxPrice: bigint | null;
  /** Percent, as the tariff states it, e.g. `16.5`. */
  readonly rate: number;
}

/** One row of the desi table (doc 17 §8.1). `maxDesi: null` is the catch-all last row. */
export interface DesiBand {
  readonly maxDesi: number | null;
  /** Cargo cost for a parcel in this band, kuruş. */
  readonly cargo: bigint;
  /** Estimated operating cost (staff, storage, packing) for a parcel in this band, kuruş. */
  readonly operation: bigint;
}

export interface SellerProfitSettings {
  /** The marketplace's fixed per-sale fee (Trendyol: ₺12.50 at the time of writing), kuruş. */
  readonly fixedSaleFee: bigint;
  /** Ordered; the first band whose `maxDesi` is null or ≥ the parcel's desi wins. */
  readonly desiBands: readonly DesiBand[];
  /**
   * Percent applied, flat at every price, to a product with no usable tariff — none loaded, none
   * current, no barcode match, or a price in a gap of its tariff. Entered by the operator on Kâr
   * Ayarları (product owner, 2026-11-23); `null`/absent = no default, and the estimate says
   * `noTariff` / `priceOutsideTariff` as before. Never a value the system invents.
   */
  readonly defaultCommissionRate?: number | null;
}

export interface SellerProfitInput {
  /** The card's price — one purchase of the card, kuruş. */
  readonly price: bigint;
  /** The brand product's unit price to resellers, per unit, kuruş. `null` = not entered. */
  readonly unitPrice: bigint | null;
  /** One unit's desi. `null` = not entered. */
  readonly desi: number | null;
  /** How many units one purchase of the card delivers (doc 17 §2.1). */
  readonly unitMultiplier: number;
  /** The tariff in force for this product, or `null` when none is loaded / none is current. */
  readonly tiers: readonly CommissionTier[] | null;
  readonly settings: SellerProfitSettings | null;
}

export type SellerProfitMissing =
  | 'noSettings'
  | 'noUnitPrice'
  | 'noDesi'
  | 'noDesiBand'
  | 'noTariff'
  /** A tariff is stated per product, i.e. per single unit; a pack card's price is outside it. */
  | 'packCard'
  | 'priceOutsideTariff';

export interface SellerProfitEstimate {
  readonly commissionRate: number;
  /** Whether `commissionRate` is the product's tariff or the operator's default. */
  readonly commissionSource: 'tariff' | 'default';
  readonly commission: bigint;
  readonly cargo: bigint;
  readonly operation: bigint;
  readonly fixedSaleFee: bigint;
  /** What the seller paid the brand for what one purchase of the card delivers. */
  readonly cost: bigint;
  readonly profit: bigint;
  /** Profit as a percentage of the price. */
  readonly profitPct: number;
  /** The lowest price at which the seller breaks even, or `null` if no tier allows one. */
  readonly breakEvenPrice: bigint | null;
}

export type SellerProfitResult =
  | { readonly ok: true; readonly estimate: SellerProfitEstimate }
  | { readonly ok: false; readonly missing: SellerProfitMissing };

/** The tier containing `price`, or `undefined` when the tariff has a gap there. */
export function tierAt(price: bigint, tiers: readonly CommissionTier[]): CommissionTier | undefined {
  return tiers.find(
    (tier) =>
      (tier.minPrice === null || price >= tier.minPrice) &&
      (tier.maxPrice === null || price <= tier.maxPrice),
  );
}

/** The desi band a parcel falls in, or `undefined` when the table has no row for it. */
export function desiBandFor(desi: number, bands: readonly DesiBand[]): DesiBand | undefined {
  return bands.find((band) => band.maxDesi === null || desi <= band.maxDesi);
}

function percentOf(amount: bigint, rate: number): Fraction {
  return Fraction.mul(Fraction.of(amount), Fraction.fromPercent(rate));
}

/**
 * The lowest price at which `price − price × c(price) = fixedCosts`.
 *
 * Each tier is solved on its own — `P = fixedCosts / (1 − rate)`, rounded **up** so the seller is
 * never shown breaking even a kuruş short — and kept only if the answer lies inside that tier.
 * Cargo and operation depend on desi, not on price, so unlike the floor price (doc 02 §5.3) there
 * is no circularity to iterate out.
 */
export function breakEvenPrice(fixedCosts: bigint, tiers: readonly CommissionTier[]): bigint | null {
  let best: bigint | null = null;
  for (const tier of tiers) {
    const retained = Fraction.sub(Fraction.one, Fraction.fromPercent(tier.rate));
    if (!Fraction.isPositive(retained)) continue;
    const solved = Fraction.toMoneyRoundUp(Fraction.div(Fraction.of(fixedCosts), retained)).toKurus();
    const inside =
      (tier.minPrice === null || solved >= tier.minPrice) &&
      (tier.maxPrice === null || solved <= tier.maxPrice);
    if (inside && (best === null || solved < best)) best = solved;
  }
  return best;
}

export function estimateSellerProfit(input: SellerProfitInput): SellerProfitResult {
  const { settings } = input;
  if (!settings) return { ok: false, missing: 'noSettings' };
  if (input.unitPrice === null) return { ok: false, missing: 'noUnitPrice' };
  if (input.desi === null) return { ok: false, missing: 'noDesi' };
  if (input.unitMultiplier !== 1) return { ok: false, missing: 'packCard' };

  const fallback = settings.defaultCommissionRate ?? null;
  const defaultTiers: readonly CommissionTier[] | null =
    fallback === null ? null : [{ minPrice: null, maxPrice: null, rate: fallback }];

  let tiers: readonly CommissionTier[];
  let commissionSource: SellerProfitEstimate['commissionSource'] = 'tariff';
  if (input.tiers && input.tiers.length > 0) {
    tiers = input.tiers;
  } else if (defaultTiers) {
    tiers = defaultTiers;
    commissionSource = 'default';
  } else {
    return { ok: false, missing: 'noTariff' };
  }

  const band = desiBandFor(input.desi * input.unitMultiplier, settings.desiBands);
  if (!band) return { ok: false, missing: 'noDesiBand' };

  let tier = tierAt(input.price, tiers);
  if (!tier && defaultTiers) {
    // The tariff has no band for this price: it states no commission here, so the default does.
    tiers = defaultTiers;
    tier = defaultTiers[0];
    commissionSource = 'default';
  }
  if (!tier) return { ok: false, missing: 'priceOutsideTariff' };

  const cost = input.unitPrice * BigInt(input.unitMultiplier);
  const fixedCosts = band.cargo + band.operation + settings.fixedSaleFee + cost;
  const commission = percentOf(input.price, tier.rate);
  const profit = Fraction.toMoneyRoundHalfUp(
    Fraction.sub(Fraction.sub(Fraction.of(input.price), commission), Fraction.of(fixedCosts)),
  ).toKurus();

  return {
    ok: true,
    estimate: {
      commissionRate: tier.rate,
      commissionSource,
      commission: Fraction.toMoneyRoundHalfUp(commission).toKurus(),
      cargo: band.cargo,
      operation: band.operation,
      fixedSaleFee: settings.fixedSaleFee,
      cost,
      profit,
      profitPct: input.price === 0n ? 0 : (Number(profit) / Number(input.price)) * 100,
      breakEvenPrice: breakEvenPrice(fixedCosts, tiers),
    },
  };
}
