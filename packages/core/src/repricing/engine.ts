/**
 * RepricingEngine.decide() — docs/03-repricing-engines.md §5, §6, §8.
 *
 * Pure function of its inputs: gates (§5), the floor guard (§5), the phase machine (§6),
 * clamping (§5) and budget-priority admission (§8). No I/O, no clock reads (`now` is an
 * input), no marketplace branching — differences are expressed through `policy` and
 * `fees` only.
 *
 * A few points the prose leaves implicit are resolved here, each noted at its call site:
 *  - Every phase-transition arrow in §6 delegates to the target phase's own decision
 *    logic within the same `decide()` call — computing a decision for the new phase
 *    immediately — EXCEPT §6.3 (CLIMBING losing the buybox), which doc 03 explicitly
 *    calls out as not reverting immediately (confirmed by scenario T-6: "no submit that
 *    cycle"). That is the one transition handled before phase dispatch, as a special case.
 *  - "Sole seller" (§6.6) has no entry in the `RepricingPhase` enum; it is reached only
 *    as a branch of SEEKING (§6.1) when there is no buybox price, so the persisted phase
 *    stays `SEEKING` and re-evaluates sole-seller-ness next cycle.
 *  - Budget priority 3 ("Climbing ... only for listings ranked by expected value", §8) has
 *    a cross-listing ranking component that a single-listing pure function cannot apply;
 *    `decide()` applies the remaining-budget threshold only, and leaves ranking to the
 *    worker that calls it across a whole batch (doc 12 Phase 5.6).
 */
import { Duration, Money, type Result } from '@buybox/shared';
import type { CostError } from '../errors.js';
import { type FeeSettings, effectiveCommissionRate } from '../fee-model.js';
import { Fraction } from '../fraction.js';
import { type CampaignRatio, floorPrice, netProceeds, priceForNetProceeds } from '../price-calculator.js';
import type { ListingPriceOverrides, RepricingPolicy } from './policy.js';
import type {
  BuyboxObservation,
  DecisionReason,
  ListingSnapshot,
  OptimumContext,
  PriceDecision,
  RepricingState,
  UpdateBudget,
} from './types.js';

interface Ctx {
  readonly listing: ListingSnapshot;
  readonly observation: BuyboxObservation;
  readonly state: RepricingState;
  readonly cost: Money;
  readonly fees: FeeSettings;
  readonly policy: RepricingPolicy;
  readonly now: Date;
  readonly currentPrice: Money;
  readonly floor: Money;
  readonly effRate: number;
  readonly campaignRatio: number;
  readonly overrides: ListingPriceOverrides;
  readonly allowIncrease: boolean;
  readonly allowDecrease: boolean;
}

function minMoney(a: Money | null, b: Money): Money {
  return a === null ? b : Money.min(a, b);
}
function maxMoney(a: Money | null, b: Money): Money {
  return a === null ? b : Money.max(a, b);
}

function clamp(p: Money, floorPriceValue: Money, overrides: ListingPriceOverrides): Money {
  let result = Money.max(p, floorPriceValue);
  if (overrides.minPrice) result = Money.max(result, overrides.minPrice);
  if (overrides.maxPrice) result = Money.min(result, overrides.maxPrice);
  return result;
}

function none(
  state: RepricingState,
  reason: DecisionReason,
  priority: number,
  explanation: string,
): PriceDecision {
  return { action: 'none', nextState: state, reason, priority, explanation };
}

function submit(
  state: RepricingState,
  price: Money,
  reason: DecisionReason,
  priority: number,
  explanation: string,
): PriceDecision {
  return { action: 'submit', newPrice: price, nextState: state, reason, priority, explanation };
}

function buildOptimumContext(ctx: Ctx): OptimumContext {
  return {
    unitCost: ctx.cost,
    commissionRate: ctx.listing.commissionRate,
    vatRate: ctx.listing.vatRate,
    campaignRatio: ctx.campaignRatio,
    secondPrice: ctx.observation.secondPrice,
    secondSellerId: ctx.observation.secondSellerId,
  };
}

function settleAtOptimum(ctx: Ctx, lastGoodPrice: Money, phaseState: RepricingState): PriceDecision {
  const nextState: RepricingState = {
    ...phaseState,
    phase: 'OPTIMUM',
    optimumPrice: lastGoodPrice,
    optimumContext: buildOptimumContext(ctx),
  };
  if (!ctx.currentPrice.equals(lastGoodPrice)) {
    return submit(nextState, lastGoodPrice, 'Refining', 2, `Settled at optimum ${lastGoodPrice.format()}.`);
  }
  return none(nextState, 'HoldingOptimum', 2, `Holding optimum at ${lastGoodPrice.format()}.`);
}

// --- §6.1 SEEKING ---
function seeking(ctx: Ctx, workingState: RepricingState): PriceDecision {
  const { observation, policy } = ctx;

  if (observation.buyboxPrice === null) {
    if (!observation.hasMultipleSeller) {
      return soleSeller(ctx, workingState);
    }
    return none(
      { ...workingState, phase: 'SEEKING' },
      'InsufficientData',
      1,
      'No buybox price observed and multiple sellers are present; cannot determine a seeking target.',
    );
  }

  const target = observation.buyboxPrice.subtract(Money.fromKurus(policy.undercutBy));

  if (target.compareTo(ctx.floor) < 0) {
    // Delegate into BLOCKED's own logic within this cycle (consistent with every other
    // phase-transition arrow in doc 03 §6) — which is what actually produces T-4's
    // "submit floor" outcome, not a bare no-op.
    return blocked(ctx, { ...workingState, phase: 'BLOCKED' });
  }

  if (!ctx.allowDecrease && target.compareTo(ctx.currentPrice) < 0) {
    return none(
      { ...workingState, phase: 'SEEKING' },
      'Disabled',
      1,
      'Decreases are disabled for this listing.',
    );
  }

  if (
    policy.lowStockGuardEnabled &&
    observation.competitorStock !== null &&
    observation.competitorStock < policy.lowStockThreshold
  ) {
    const npAtTarget = netProceeds({
      price: target,
      vatRate: ctx.listing.vatRate,
      effectiveCommissionRate: ctx.effRate,
      campaign: ctx.listing.campaign,
      fees: ctx.fees,
    });
    const requiredNet = Fraction.toMoneyRoundHalfUp(
      Fraction.mul(
        Fraction.fromMoney(npAtTarget),
        Fraction.add(Fraction.one, Fraction.fromPercent(policy.lowStockMarginPct)),
      ),
    );
    const guardResult = priceForNetProceeds(requiredNet, {
      vatRate: ctx.listing.vatRate,
      effectiveCommissionRate: ctx.effRate,
      campaign: campaignRatioOf(ctx),
      fees: ctx.fees,
    });
    const guardBlocks = !guardResult.ok || guardResult.value.compareTo(observation.buyboxPrice) > 0;
    if (guardBlocks) {
      return none(
        { ...workingState, phase: 'SEEKING' },
        'NothingChanged',
        1,
        'Buybox holder is low on stock; not worth undercutting at this margin.',
      );
    }
  }

  const next =
    policy.seekStrategy === 'direct'
      ? clamp(target, ctx.floor, ctx.overrides)
      : clamp(
          Money.max(ctx.currentPrice.subtract(Money.fromKurus(policy.seekStep)), target),
          ctx.floor,
          ctx.overrides,
        );

  const nextState: RepricingState = {
    ...workingState,
    phase: 'SEEKING',
    lastBadPrice: minMoney(workingState.lastBadPrice, ctx.currentPrice),
  };

  if (next.equals(ctx.currentPrice)) {
    return none(nextState, 'NothingChanged', 1, 'Already at the seeking target.');
  }
  return submit(nextState, next, 'Seeking', 1, `Undercutting buybox at ${observation.buyboxPrice.format()}.`);
}

// --- §6.6 SOLE SELLER (a branch of SEEKING; phase stays SEEKING) ---
function soleSeller(ctx: Ctx, workingState: RepricingState): PriceDecision {
  const targetNet = Fraction.toMoneyRoundHalfUp(
    Fraction.mul(
      Fraction.fromMoney(ctx.cost),
      Fraction.add(Fraction.one, Fraction.fromPercent(ctx.policy.soleSellerMarginPct)),
    ),
  );
  const priceResult = priceForNetProceeds(targetNet, {
    vatRate: ctx.listing.vatRate,
    effectiveCommissionRate: ctx.effRate,
    campaign: campaignRatioOf(ctx),
    fees: ctx.fees,
  });
  const nextState: RepricingState = { ...workingState, phase: 'SEEKING' };
  if (!priceResult.ok) {
    // Unreachable in practice: D depends only on vatRate/commission/campaign, already
    // validated positive by the floor computation that ran before dispatch (H1).
    return none(nextState, 'CostUnknown', 1, 'Sole-seller target price is not solvable at any price.');
  }
  const next = clamp(priceResult.value, ctx.floor, ctx.overrides);
  if (next.equals(ctx.currentPrice)) {
    return none(nextState, 'HoldingOptimum', 4, `Holding sole-seller price at ${next.format()}.`);
  }
  return submit(
    nextState,
    next,
    'SoleSeller',
    4,
    `No competing seller; pricing to ${ctx.policy.soleSellerMarginPct}% margin.`,
  );
}

function campaignRatioOf(ctx: Ctx): CampaignRatio | null {
  return ctx.listing.campaign
    ? { ratio: ctx.campaignRatio, storeSharePct: ctx.listing.campaign.storeSharePct }
    : null;
}

// --- §6.2 CLIMBING ---
function climbing(ctx: Ctx, workingState: RepricingState): PriceDecision {
  const { policy } = ctx;
  const lastGoodPrice = maxMoney(workingState.lastGoodPrice, ctx.currentPrice);
  const afterTracking: RepricingState = { ...workingState, lastGoodPrice };

  if (!ctx.allowIncrease) {
    return settleAtOptimum(ctx, ctx.currentPrice, afterTracking);
  }

  const step =
    policy.coarseStepMode === 'absolute'
      ? Money.fromKurus(policy.coarseStep as bigint)
      : Fraction.toMoneyRoundHalfUp(
          Fraction.mul(
            Fraction.fromMoney(ctx.currentPrice),
            Fraction.fromPercent(policy.coarseStep as number),
          ),
        );
  const next = clamp(ctx.currentPrice.add(step), ctx.floor, ctx.overrides);

  if (afterTracking.lastBadPrice !== null && next.compareTo(afterTracking.lastBadPrice) >= 0) {
    return refining(ctx, { ...afterTracking, phase: 'REFINING' });
  }

  if (next.equals(ctx.currentPrice)) {
    return settleAtOptimum(ctx, ctx.currentPrice, afterTracking);
  }

  return submit(
    { ...afterTracking, phase: 'CLIMBING' },
    next,
    'Climbing',
    3,
    `Probing upward from ${ctx.currentPrice.format()} while holding the buybox.`,
  );
}

// --- §6.4 REFINING ---
function refining(ctx: Ctx, workingState: RepricingState): PriceDecision {
  // "On the next evaluation, the observed rank updates the bracket" (§6.4) — applied here,
  // at entry, using the observation for `currentPrice` (which gates G5-G7 guarantee is a
  // settled, confirmed price when this is reached via normal cross-cycle dispatch).
  const tracked: RepricingState =
    ctx.observation.rank === 1
      ? { ...workingState, lastGoodPrice: maxMoney(workingState.lastGoodPrice, ctx.currentPrice) }
      : { ...workingState, lastBadPrice: minMoney(workingState.lastBadPrice, ctx.currentPrice) };

  if (tracked.lastGoodPrice === null) {
    return seeking(ctx, { ...tracked, phase: 'SEEKING' });
  }
  if (tracked.lastBadPrice === null) {
    // Defensive: REFINING should always be entered with a known bad price. If not,
    // there is nothing to bracket against yet — resume climbing from the known-good price.
    return climbing(ctx, { ...tracked, phase: 'CLIMBING' });
  }

  const lastGoodPrice = tracked.lastGoodPrice;
  const lastBadPrice = tracked.lastBadPrice;
  const gap = lastBadPrice.subtract(lastGoodPrice);

  if (gap.compareTo(Money.fromKurus(ctx.policy.refineTolerance)) <= 0) {
    return settleAtOptimum(ctx, lastGoodPrice, { ...tracked, phase: 'REFINING' });
  }

  const half = Fraction.toMoneyRoundHalfUp(Fraction.div(Fraction.fromMoney(gap), Fraction.of(2n)));
  const mid = clamp(lastGoodPrice.add(half), ctx.floor, ctx.overrides);

  if (mid.equals(ctx.currentPrice) || mid.compareTo(lastGoodPrice) <= 0 || mid.compareTo(lastBadPrice) >= 0) {
    return settleAtOptimum(ctx, lastGoodPrice, { ...tracked, phase: 'REFINING' });
  }

  return submit(
    { ...tracked, phase: 'REFINING' },
    mid,
    'Refining',
    2,
    `Binary search between ${lastGoodPrice.format()} and ${lastBadPrice.format()}.`,
  );
}

// --- §6.5 OPTIMUM ---
function optimum(ctx: Ctx, workingState: RepricingState): PriceDecision {
  const context = workingState.optimumContext;
  if (!context) {
    // Defensive: OPTIMUM must have a context snapshot; without one there is nothing to
    // compare against, so treat as freshly lost and re-seek.
    return seeking(ctx, { ...workingState, phase: 'SEEKING', lastGoodPrice: null });
  }

  const costChanged = !ctx.cost.equals(context.unitCost);
  const commissionChanged = ctx.listing.commissionRate !== context.commissionRate;
  const vatChanged = ctx.listing.vatRate !== context.vatRate;
  const campaignChanged = ctx.campaignRatio !== context.campaignRatio;
  const secondPriceChanged = secondPriceMoved(
    ctx.observation.secondPrice,
    context.secondPrice,
    ctx.policy.competitorPriceDelta,
  );
  const secondSellerChanged =
    ctx.policy.useSellerIdentityTrigger &&
    ctx.observation.secondSellerId !== null &&
    ctx.observation.secondSellerId !== context.secondSellerId;
  const lostBuybox = ctx.observation.rank !== 1;

  const invalidated =
    costChanged ||
    commissionChanged ||
    vatChanged ||
    campaignChanged ||
    secondPriceChanged ||
    secondSellerChanged ||
    lostBuybox;

  if (!invalidated) {
    return none(
      workingState,
      'HoldingOptimum',
      2,
      `Nothing changed; holding at ${ctx.currentPrice.format()}.`,
    );
  }

  if (lostBuybox) {
    const nextState: RepricingState = {
      ...workingState,
      lastBadPrice: ctx.currentPrice,
      lastGoodPrice: null,
    };
    return seeking(ctx, { ...nextState, phase: 'SEEKING' });
  }

  const nextState: RepricingState = { ...workingState, lastBadPrice: null };
  return climbing(ctx, { ...nextState, phase: 'CLIMBING' });
}

function secondPriceMoved(current: Money | null, previous: Money | null, delta: bigint): boolean {
  if (current === null && previous === null) return false;
  if (current === null || previous === null) return true;
  return current.subtract(previous).abs().compareTo(Money.fromKurus(delta)) > 0;
}

// --- §6.7 BLOCKED ---
function blocked(ctx: Ctx, workingState: RepricingState): PriceDecision {
  const { observation, policy } = ctx;
  if (observation.buyboxPrice === null) {
    return none({ ...workingState, phase: 'BLOCKED' }, 'InsufficientData', 1, 'No buybox price observed.');
  }
  if (observation.buyboxPrice.compareTo(ctx.floor.add(Money.fromKurus(policy.undercutBy))) > 0) {
    return seeking(ctx, { ...workingState, phase: 'SEEKING' });
  }
  if (!ctx.currentPrice.equals(ctx.floor) && ctx.allowIncrease) {
    return submit(
      { ...workingState, phase: 'BLOCKED' },
      ctx.floor,
      'Blocked',
      1,
      `Holding at floor; buybox at ${observation.buyboxPrice.format()} is below our break-even of ${ctx.floor.format()}.`,
    );
  }
  return none(
    { ...workingState, phase: 'BLOCKED' },
    'Blocked',
    1,
    'Holding; the market has not returned above our floor.',
  );
}

function admitByBudget(priority: number, budget: UpdateBudget): boolean {
  const remaining = budget.dailyAllowance - budget.consumedToday;
  if (priority === 0) return true;
  if (priority === 1) return remaining > 0;
  const reserve = budget.dailyAllowance * (budget.reservePct / 100);
  return remaining > reserve;
}

export function decide(input: {
  readonly listing: ListingSnapshot;
  readonly observation: BuyboxObservation;
  readonly state: RepricingState;
  readonly cost: Result<Money, CostError>;
  readonly fees: FeeSettings;
  readonly policy: RepricingPolicy;
  readonly budget: UpdateBudget;
  readonly now: Date;
}): PriceDecision {
  const { listing, observation, state, cost, fees, policy, budget, now } = input;

  // G1 / G2
  if (!policy.enabled || listing.overrides.enabled === false) {
    return none(state, 'Disabled', 5, 'Repricing is disabled for this policy or listing.');
  }
  if (listing.locked || listing.suspended || !listing.salable || listing.archived) {
    return none(state, 'Disabled', 5, 'Listing is locked, suspended, not salable or archived.');
  }
  // G3
  if (!cost.ok) {
    return none(state, 'CostUnknown', 5, 'Unit cost could not be determined.');
  }
  // G4
  if (policy.stockMode === 'respectStock' && listing.physicalStock < policy.minPhysicalStock) {
    return none(state, 'Disabled', 5, 'Physical stock is below the configured minimum.');
  }
  // G5
  if (state.pendingSubmission && state.pendingSubmission.confirmedAt === null) {
    return none(
      state,
      'AwaitingConfirmation',
      5,
      'Waiting for the marketplace to confirm the pending submission.',
    );
  }
  // G6
  if (
    policy.requirePriceConfirmation &&
    state.pendingSubmission &&
    !listing.currentPrice.equals(state.pendingSubmission.submittedPrice)
  ) {
    return none(
      state,
      'AwaitingConfirmation',
      5,
      'Confirmed submission has not yet reflected in the listing feed.',
    );
  }
  // G7
  if (state.settleUntil !== null && now.getTime() < state.settleUntil.getTime()) {
    return none(state, 'AwaitingSettle', 5, 'Waiting for the settle window to elapse.');
  }
  // G8
  if (observation.rank === null) {
    return none(state, 'InsufficientData', 5, 'No buybox observation available.');
  }
  // G9
  if (now.getTime() - observation.observedAt.getTime() > 2 * Duration.toMillis(policy.pollInterval)) {
    return none(state, 'InsufficientData', 5, 'Buybox observation is stale.');
  }

  const effRate = effectiveCommissionRate(listing.commissionRate, fees);
  const campaignRatio = listing.campaign
    ? Number(listing.campaign.finalPrice.toKurus()) / Number(listing.currentPrice.toKurus())
    : 1;
  const floorResult = floorPrice({
    unitCost: cost.value,
    vatRate: listing.vatRate,
    effectiveCommissionRate: effRate,
    campaign: listing.campaign
      ? { ratio: campaignRatio, storeSharePct: listing.campaign.storeSharePct }
      : null,
    fees,
  });

  // H1
  if (!floorResult.ok) {
    return none(
      state,
      'CostUnknown',
      5,
      'No price is profitable at any point (commission plus VAT exceeds revenue).',
    );
  }
  const floor = floorResult.value;
  const overrides = listing.overrides;
  const allowIncrease = overrides.allowIncrease ?? true;
  const allowDecrease = overrides.allowDecrease ?? true;

  // H2 / H3
  if (listing.currentPrice.compareTo(floor) < 0) {
    if (allowIncrease) {
      return finalise(
        submit(
          state,
          floor,
          'SellingAtLoss',
          0,
          `Current price is below floor ${floor.format()}; raising immediately.`,
        ),
        budget,
      );
    }
    return none(
      state,
      'SellingAtLoss',
      0,
      `Selling below floor ${floor.format()} and increases are disabled.`,
    );
  }

  // H4. doc 03 §5's gate table labels this reason 'Blocked'; scenario T-21 (§11) labels
  // the identical situation 'AtConfiguredLimit'. These conflict; 'AtConfiguredLimit' is
  // used here since it is the dedicated enum value for "a configured bound made the
  // required price unreachable," keeping it distinct from 'Blocked' (§6.7's meaning:
  // the *market* won't support a profitable price, not a configuration contradiction).
  if (overrides.maxPrice && floor.compareTo(overrides.maxPrice) > 0) {
    return none(
      { ...state, phase: 'BLOCKED' },
      'AtConfiguredLimit',
      1,
      `Configured maxPrice ${overrides.maxPrice.format()} is below the floor ${floor.format()}.`,
    );
  }

  const ctx: Ctx = {
    listing,
    observation,
    state,
    cost: cost.value,
    fees,
    policy,
    now,
    currentPrice: listing.currentPrice,
    floor,
    effRate,
    campaignRatio,
    overrides,
    allowIncrease,
    allowDecrease,
  };

  // §6.3 — CLIMBING losing the buybox is the one transition that does not compute a
  // same-cycle decision for the new phase (explicit "no submit that cycle", T-6).
  if (state.phase === 'CLIMBING' && observation.rank !== 1) {
    const nextState: RepricingState = {
      ...state,
      phase: 'REFINING',
      lastBadPrice: minMoney(state.lastBadPrice, ctx.currentPrice),
    };
    return finalise(
      none(
        nextState,
        'Refining',
        2,
        `Lost the buybox at ${ctx.currentPrice.format()}; narrowing the bracket.`,
      ),
      budget,
    );
  }

  const decision = dispatch(ctx, state);
  return finalise(decision, budget);
}

function dispatch(ctx: Ctx, state: RepricingState): PriceDecision {
  switch (state.phase) {
    case 'SEEKING':
      return seeking(ctx, state);
    case 'CLIMBING':
      return climbing(ctx, state);
    case 'REFINING':
      return refining(ctx, state);
    case 'OPTIMUM':
      return optimum(ctx, state);
    case 'BLOCKED':
      return blocked(ctx, state);
  }
}

function finalise(decision: PriceDecision, budget: UpdateBudget): PriceDecision {
  if (decision.action !== 'submit') return decision;
  if (admitByBudget(decision.priority, budget)) return decision;
  return {
    ...decision,
    action: 'none',
    reason: 'BudgetExhausted',
    explanation: 'Daily update budget is exhausted for this priority.',
  };
}
