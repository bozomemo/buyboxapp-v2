/**
 * PriceCalculator — netProceeds and floorPrice (docs/02-cost-and-price-model.md §5).
 *
 * Both are pure functions over `Fraction`, rounding to `Money` exactly once at their
 * final step (doc 02 §1, §5.3). `floorPrice` is the special case of the more general
 * `priceForNetProceeds` where the target is the unit cost — the repricing engine (doc 03
 * §6.6 "sole seller") reuses the same solver with a different target net-proceeds value.
 */
import { Money, err, ok, type Result } from '@buybox/shared';
import type { PriceError } from './errors.js';
import { Fraction } from './fraction.js';
import {
  type FeeSettings,
  bandKeyFraction,
  lastCargoAmount,
  lastExpenditureAmount,
  normalisedCargoFraction,
  normalisedExpenditureFraction,
} from './fee-model.js';

/** Campaign state as observed for a known selling price — used by `netProceeds`. */
export interface CampaignFinal {
  readonly finalPrice: Money;
  readonly storeSharePct: number; // 0-100
}

/** Campaign state as an assumed-constant ratio — used by `priceForNetProceeds`/`floorPrice`. */
export interface CampaignRatio {
  readonly ratio: number; // finalPrice / listingPrice
  readonly storeSharePct: number; // 0-100
}

export interface NetProceedsInput {
  readonly price: Money;
  readonly vatRate: number; // percent
  readonly effectiveCommissionRate: number; // percent, c_eff
  readonly campaign: CampaignFinal | null;
  readonly fees: FeeSettings;
}

/** doc 02 §5.1 — given a selling price, what actually reaches our account. */
export function netProceeds(input: NetProceedsInput): Money {
  const { price, vatRate, effectiveCommissionRate, campaign, fees } = input;

  const P = Fraction.fromMoney(price);
  const Pf = campaign ? Fraction.fromMoney(campaign.finalPrice) : P;
  const totalDiscount = Fraction.sub(P, Pf);
  const storeSharePct = campaign ? campaign.storeSharePct : 0;
  const storeDiscount = Fraction.mul(totalDiscount, Fraction.fromPercent(storeSharePct));
  const marketplaceRefund = Fraction.sub(totalDiscount, storeDiscount);

  const vatFactor = Fraction.add(Fraction.one, Fraction.fromPercent(vatRate));
  const priceNetOfStoreDiscount = Fraction.sub(P, storeDiscount);
  const commissionBase =
    fees.commissionBase === 'gross'
      ? priceNetOfStoreDiscount
      : Fraction.div(priceNetOfStoreDiscount, vatFactor);
  const commission = Fraction.mul(commissionBase, Fraction.fromPercent(effectiveCommissionRate));

  const customerPrice = campaign ? campaign.finalPrice : price;
  const cargo = normalisedCargoFraction(Fraction.fromMoney(customerPrice), fees);
  const expenditure = normalisedExpenditureFraction(Fraction.fromMoney(customerPrice), fees);

  const revenueNet = Fraction.div(Pf, vatFactor);

  const result = Fraction.add(
    Fraction.sub(Fraction.sub(Fraction.sub(revenueNet, commission), cargo), expenditure),
    marketplaceRefund,
  );
  return Fraction.toMoneyRoundHalfUp(result);
}

export interface RetentionFactorInput {
  readonly vatRate: number;
  readonly effectiveCommissionRate: number;
  readonly campaign: CampaignRatio | null;
}

/** doc 02 §5.2/§5.3 — the "net retention factor" `D`. */
export function retentionFactor(input: RetentionFactorInput): Fraction {
  const vatFactor = Fraction.add(Fraction.one, Fraction.fromPercent(input.vatRate));
  const cEff = Fraction.fromPercent(input.effectiveCommissionRate);

  if (!input.campaign) {
    return Fraction.sub(Fraction.div(Fraction.one, vatFactor), cEff);
  }

  const r = Fraction.fromNumber(input.campaign.ratio);
  const s = Fraction.fromPercent(input.campaign.storeSharePct);
  const oneMinusR = Fraction.sub(Fraction.one, r);

  const term1 = Fraction.div(r, vatFactor);
  const term2 = Fraction.mul(Fraction.sub(Fraction.one, Fraction.mul(oneMinusR, s)), cEff);
  const term3 = Fraction.mul(oneMinusR, Fraction.sub(Fraction.one, s));
  return Fraction.add(Fraction.sub(term1, term2), term3);
}

export interface SolvePriceInput {
  readonly vatRate: number;
  readonly effectiveCommissionRate: number;
  readonly campaign: CampaignRatio | null;
  readonly fees: FeeSettings;
}

const MAX_ITERATIONS = 5;

/**
 * Solve `netProceeds(P) = targetNet` for `P` (doc 02 §5.2/§5.3). Cargo and expenditure
 * bands depend on price, so this converges by fixed-point iteration, seeded from the
 * highest band and always rounding the result up — the safe direction, since the goal is
 * a floor that must never be crossed downward. On a genuine band-edge oscillation within
 * `MAX_ITERATIONS`, the highest candidate seen is returned (doc 02 §7.3: "take the higher
 * price"), which is at least as safe as the literal pseudocode's "return the last value."
 */
export function priceForNetProceeds(targetNet: Money, input: SolvePriceInput): Result<Money, PriceError> {
  const D = retentionFactor(input);
  if (!Fraction.isPositive(D)) {
    return err({ type: 'NotProfitableAtAnyPrice' });
  }

  const target = Fraction.fromMoney(targetNet);
  const seedCargo = Fraction.fromMoney(lastCargoAmount(input.fees.cargoBands) ?? Money.zero);
  const seedExpenditure = Fraction.fromMoney(
    lastExpenditureAmount(input.fees.expenditureBands) ?? Money.zero,
  );
  let P = Fraction.div(Fraction.add(target, Fraction.add(seedCargo, seedExpenditure)), D);
  let highestSeen = P;

  const ratio = input.campaign ? Fraction.fromNumber(input.campaign.ratio) : null;
  const customerPriceOf = (price: Fraction): Fraction => (ratio ? Fraction.mul(price, ratio) : price);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const customerPrice = customerPriceOf(P);
    const cargo = normalisedCargoFraction(customerPrice, input.fees);
    const expenditure = normalisedExpenditureFraction(customerPrice, input.fees);
    const next = Fraction.div(Fraction.add(target, Fraction.add(cargo, expenditure)), D);
    highestSeen = Fraction.max(highestSeen, next);

    if (bandKeyFraction(customerPriceOf(next), input.fees) === bandKeyFraction(customerPrice, input.fees)) {
      return ok(Fraction.toMoneyRoundUp(next));
    }
    P = next;
  }
  return ok(Fraction.toMoneyRoundUp(highestSeen));
}

export interface FloorPriceInput {
  readonly unitCost: Money;
  readonly vatRate: number;
  readonly effectiveCommissionRate: number;
  readonly campaign: CampaignRatio | null;
  readonly fees: FeeSettings;
}

/** doc 02 §5.2 — the price at which net proceeds exactly equal cost. */
export function floorPrice(input: FloorPriceInput): Result<Money, PriceError> {
  return priceForNetProceeds(input.unitCost, input);
}
