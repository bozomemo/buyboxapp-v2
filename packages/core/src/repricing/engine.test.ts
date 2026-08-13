import { Duration, Money, err, ok, type Result } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import type { CostError } from '../errors.js';
import { effectiveCommissionRate, type FeeSettings } from '../fee-model.js';
import { floorPrice, priceForNetProceeds } from '../price-calculator.js';
import { decide } from './engine.js';
import type { RepricingPolicy } from './policy.js';
import type {
  BuyboxObservation,
  DecisionInput,
  ListingSnapshot,
  RepricingState,
  UpdateBudget,
} from './types.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const VAT_RATE = 10;
const C0 = 16;
const C_EFF = effectiveCommissionRate(C0, {
  commissionVatRate: 20,
  commissionRateIncludesVat: false,
  commissionVatDeductible: false,
});

// Zero cargo/expenditure so `floor` is a clean function of unit cost alone — the gates and
// phase machine are what these tests exercise, not the price model (covered separately in
// price-calculator.test.ts).
const FEES: FeeSettings = {
  effectiveFrom: new Date(0),
  commissionVatRate: 20,
  commissionRateIncludesVat: false,
  commissionVatDeductible: false,
  commissionBase: 'gross',
  defaultCommissionRate: C0,
  cargoBands: [{ maxPrice: null, amount: Money.zero }],
  cargoAmountsIncludeVat: true,
  cargoVatRate: 20,
  cargoVatDeductible: false,
  expenditureBands: [],
  expenditureIncludesVat: true,
  expenditureVatRate: 20,
  expenditureVatDeductible: false,
};

const UNIT_COST = Money.fromKurus(2000n);
const FLOOR = (() => {
  const result = floorPrice({
    unitCost: UNIT_COST,
    vatRate: VAT_RATE,
    effectiveCommissionRate: C_EFF,
    campaign: null,
    fees: FEES,
  });
  if (!result.ok) throw new Error('fixture floor computation failed');
  return result.value;
})();

const DEFAULT_POLICY: RepricingPolicy = {
  enabled: true,
  coarseStepMode: 'absolute',
  coarseStep: 100n,
  refineTolerance: 10n,
  seekStrategy: 'direct',
  undercutBy: 1n,
  seekStep: 50n,
  soleSellerMarginPct: 20,
  lowStockGuardEnabled: false,
  lowStockThreshold: 0,
  lowStockMarginPct: 0,
  stockMode: 'ignoreStock',
  minPhysicalStock: 0,
  requirePriceConfirmation: true,
  settleDuration: Duration.minutes(10),
  competitorPriceDelta: 5n,
  useSellerIdentityTrigger: true,
  pollInterval: Duration.minutes(5),
  concurrency: 1,
};

const DEFAULT_BUDGET: UpdateBudget = { dailyAllowance: 1000, consumedToday: 0, reservePct: 20 };

const FRESH_STATE: RepricingState = {
  phase: 'SEEKING',
  lastGoodPrice: null,
  lastBadPrice: null,
  optimumPrice: null,
  optimumContext: null,
  pendingSubmission: null,
  settleUntil: null,
  consecutiveRejections: 0,
};

function listing(overrides: Partial<ListingSnapshot> = {}): ListingSnapshot {
  return {
    currentPrice: FLOOR.add(Money.fromKurus(1000n)),
    physicalStock: 100,
    commissionRate: C0,
    vatRate: VAT_RATE,
    locked: false,
    suspended: false,
    salable: true,
    archived: false,
    campaign: null,
    overrides: {},
    ...overrides,
  };
}

function observation(overrides: Partial<BuyboxObservation> = {}): BuyboxObservation {
  return {
    rank: 1,
    buyboxPrice: FLOOR.add(Money.fromKurus(2000n)),
    secondPrice: null,
    thirdPrice: null,
    hasMultipleSeller: true,
    secondSellerId: null,
    competitorStock: null,
    observedAt: NOW,
    ...overrides,
  };
}

const COST: Result<Money, CostError> = ok(UNIT_COST);

function input(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    listing: listing(),
    observation: observation(),
    state: FRESH_STATE,
    cost: COST,
    fees: FEES,
    policy: DEFAULT_POLICY,
    budget: DEFAULT_BUDGET,
    now: NOW,
    ...overrides,
  };
}

describe('doc 03 §11 scenarios', () => {
  it('T-1: price below floor -> single submit to exactly floor, priority 0', () => {
    const d = decide(input({ listing: listing({ currentPrice: FLOOR.subtract(Money.fromKurus(500n)) }) }));
    expect(d.action).toBe('submit');
    expect(d.newPrice?.equals(FLOOR)).toBe(true);
    expect(d.reason).toBe('SellingAtLoss');
    expect(d.priority).toBe(0);
  });

  it('T-2: below floor, allowIncrease = false -> no submit, alert raised', () => {
    const d = decide(
      input({
        listing: listing({
          currentPrice: FLOOR.subtract(Money.fromKurus(500n)),
          overrides: { allowIncrease: false },
        }),
      }),
    );
    expect(d.action).toBe('none');
    expect(d.reason).toBe('SellingAtLoss');
  });

  it('T-3: rank 3, buybox above floor, direct seek -> one submit to buyboxPrice - undercutBy', () => {
    const buyboxPrice = FLOOR.add(Money.fromKurus(1000n));
    const d = decide(
      input({
        state: { ...FRESH_STATE, phase: 'SEEKING' },
        observation: observation({ rank: 3, buyboxPrice }),
      }),
    );
    expect(d.action).toBe('submit');
    expect(d.newPrice?.equals(buyboxPrice.subtract(Money.fromKurus(1n)))).toBe(true);
    expect(d.reason).toBe('Seeking');
    expect(d.priority).toBe(1);
  });

  it('T-4: rank 3, buybox below floor -> BLOCKED, submit floor, no undercut', () => {
    const buyboxPrice = FLOOR.subtract(Money.fromKurus(500n));
    const d = decide(
      input({
        listing: listing({ currentPrice: FLOOR.add(Money.fromKurus(200n)) }),
        state: { ...FRESH_STATE, phase: 'SEEKING' },
        observation: observation({ rank: 3, buyboxPrice }),
      }),
    );
    expect(d.action).toBe('submit');
    expect(d.newPrice?.equals(FLOOR)).toBe(true);
    expect(d.reason).toBe('Blocked');
    expect(d.nextState.phase).toBe('BLOCKED');
  });

  it('T-5: rank 1, climbing -> submit current + coarseStep, lastGoodPrice = current', () => {
    const current = FLOOR.add(Money.fromKurus(1000n));
    const d = decide(
      input({
        listing: listing({ currentPrice: current }),
        state: { ...FRESH_STATE, phase: 'CLIMBING' },
        observation: observation({ rank: 1 }),
      }),
    );
    expect(d.action).toBe('submit');
    expect(d.newPrice?.equals(current.add(Money.fromKurus(100n)))).toBe(true);
    expect(d.reason).toBe('Climbing');
    expect(d.priority).toBe(3);
    expect(d.nextState.lastGoodPrice?.equals(current)).toBe(true);
  });

  it('T-6: climbing, then rank 2 -> REFINING, lastBadPrice set, no submit that cycle', () => {
    const current = FLOOR.add(Money.fromKurus(1000n));
    const d = decide(
      input({
        listing: listing({ currentPrice: current }),
        state: { ...FRESH_STATE, phase: 'CLIMBING', lastGoodPrice: current },
        observation: observation({ rank: 2 }),
      }),
    );
    expect(d.action).toBe('none');
    expect(d.nextState.phase).toBe('REFINING');
    expect(d.nextState.lastBadPrice?.equals(current)).toBe(true);
  });

  it('T-7: refining a 100-kuruş gap with a 10-kuruş tolerance converges in <= 4 submits (doc 03 §6.4)', () => {
    // doc 03 §6.4: "With a 100 kuruş coarse step and a 10 kuruş tolerance, refinement
    // costs at most 4 updates" — log2(100/10) rounded up.
    const trueCeilingOffset = 2037n;
    let state: RepricingState = {
      ...FRESH_STATE,
      phase: 'REFINING',
      lastGoodPrice: FLOOR.add(Money.fromKurus(2000n)),
      lastBadPrice: FLOOR.add(Money.fromKurus(2100n)),
    };
    let currentPrice = state.lastGoodPrice as Money;
    let submits = 0;
    for (let i = 0; i < 10 && state.phase === 'REFINING'; i++) {
      const rank = currentPrice.subtract(FLOOR).toKurus() <= trueCeilingOffset ? 1 : 2;
      const d = decide(
        input({ listing: listing({ currentPrice }), state, observation: observation({ rank }) }),
      );
      state = d.nextState;
      if (d.action === 'submit') {
        submits++;
        currentPrice = d.newPrice as Money;
      }
    }
    expect(submits).toBeLessThanOrEqual(4);
    expect(state.phase).toBe('OPTIMUM');
    expect(state.optimumPrice && state.optimumPrice.subtract(FLOOR).toKurus() <= trueCeilingOffset).toBe(
      true,
    );
  });

  it('T-8: OPTIMUM, nothing changed -> no submit for 100 consecutive cycles', () => {
    const current = FLOOR.add(Money.fromKurus(1500n));
    const l = listing({ currentPrice: current });
    const obs = observation({ rank: 1, secondPrice: Money.fromKurus(500n), secondSellerId: 'seller-x' });
    let state: RepricingState = {
      ...FRESH_STATE,
      phase: 'OPTIMUM',
      optimumPrice: current,
      optimumContext: {
        unitCost: UNIT_COST,
        commissionRate: C0,
        vatRate: VAT_RATE,
        campaignRatio: 1,
        secondPrice: obs.secondPrice,
        secondSellerId: obs.secondSellerId,
      },
    };
    for (let i = 0; i < 100; i++) {
      const d = decide(input({ listing: l, state, observation: obs }));
      expect(d.action).toBe('none');
      expect(d.reason).toBe('HoldingOptimum');
      state = d.nextState;
    }
  });

  it('T-9: OPTIMUM, 2nd price rises -> CLIMBING, lastBadPrice cleared', () => {
    const current = FLOOR.add(Money.fromKurus(1500n));
    const state: RepricingState = {
      ...FRESH_STATE,
      phase: 'OPTIMUM',
      lastBadPrice: FLOOR.add(Money.fromKurus(1900n)),
      optimumPrice: current,
      optimumContext: {
        unitCost: UNIT_COST,
        commissionRate: C0,
        vatRate: VAT_RATE,
        campaignRatio: 1,
        secondPrice: Money.fromKurus(500n),
        secondSellerId: null,
      },
    };
    const d = decide(
      input({
        listing: listing({ currentPrice: current }),
        state,
        observation: observation({ rank: 1, secondPrice: Money.fromKurus(900n) }),
      }),
    );
    expect(d.nextState.phase).toBe('CLIMBING');
    expect(d.nextState.lastBadPrice).toBeNull();
  });

  it('T-10: OPTIMUM, we lose the buybox -> SEEKING, lastGoodPrice cleared', () => {
    const current = FLOOR.add(Money.fromKurus(1500n));
    const state: RepricingState = {
      ...FRESH_STATE,
      phase: 'OPTIMUM',
      lastGoodPrice: current,
      optimumPrice: current,
      optimumContext: {
        unitCost: UNIT_COST,
        commissionRate: C0,
        vatRate: VAT_RATE,
        campaignRatio: 1,
        secondPrice: null,
        secondSellerId: null,
      },
    };
    const d = decide(
      input({
        listing: listing({ currentPrice: current }),
        state,
        observation: observation({ rank: 2, buyboxPrice: current.subtract(Money.fromKurus(50n)) }),
      }),
    );
    expect(d.nextState.phase).toBe('SEEKING');
    expect(d.nextState.lastGoodPrice).toBeNull();
  });

  it('T-11: OPTIMUM, unit cost rises above the optimum price -> floor gate fires first, submits new floor', () => {
    const current = FLOOR.add(Money.fromKurus(200n));
    const higherCost = current.add(Money.fromKurus(500n)); // pushes the new floor above `current`
    const state: RepricingState = {
      ...FRESH_STATE,
      phase: 'OPTIMUM',
      optimumPrice: current,
      optimumContext: {
        unitCost: UNIT_COST,
        commissionRate: C0,
        vatRate: VAT_RATE,
        campaignRatio: 1,
        secondPrice: null,
        secondSellerId: null,
      },
    };
    const d = decide(
      input({
        listing: listing({ currentPrice: current }),
        state,
        cost: ok(higherCost),
        observation: observation({ rank: 1 }),
      }),
    );
    expect(d.action).toBe('submit');
    expect(d.reason).toBe('SellingAtLoss');
    expect(d.priority).toBe(0);
  });

  it('T-12: submitted, not yet confirmed -> AwaitingConfirmation, no submit', () => {
    const d = decide(
      input({
        state: {
          ...FRESH_STATE,
          pendingSubmission: {
            submissionId: 's1',
            submittedPrice: FLOOR.add(Money.fromKurus(100n)),
            submittedAt: NOW,
            confirmedAt: null,
          },
        },
      }),
    );
    expect(d.action).toBe('none');
    expect(d.reason).toBe('AwaitingConfirmation');
  });

  it('T-13: confirmed, inside settle window -> AwaitingSettle, no submit', () => {
    const confirmedPrice = FLOOR.add(Money.fromKurus(100n));
    const d = decide(
      input({
        listing: listing({ currentPrice: confirmedPrice }),
        state: {
          ...FRESH_STATE,
          pendingSubmission: {
            submissionId: 's1',
            submittedPrice: confirmedPrice,
            submittedAt: NOW,
            confirmedAt: NOW,
          },
          settleUntil: new Date(NOW.getTime() + 60_000),
        },
      }),
    );
    expect(d.action).toBe('none');
    expect(d.reason).toBe('AwaitingSettle');
  });

  it('T-14: confirmed, observed price still old -> AwaitingConfirmation, bracket untouched', () => {
    const state: RepricingState = {
      ...FRESH_STATE,
      pendingSubmission: {
        submissionId: 's1',
        submittedPrice: FLOOR.add(Money.fromKurus(100n)),
        submittedAt: NOW,
        confirmedAt: NOW,
      },
    };
    const d = decide(input({ listing: listing({ currentPrice: FLOOR.add(Money.fromKurus(50n)) }), state }));
    expect(d.action).toBe('none');
    expect(d.reason).toBe('AwaitingConfirmation');
    expect(d.nextState).toBe(state);
  });

  // T-15 (`OutOfPriceRange` rejection classification) belongs to §7.1's submission/
  // confirmation choreography, which doc 12 Phase 2 scopes to `decide()`'s gates and phase
  // machine only — rejection handling is `ConfirmSubmissions` (Phase 5.7). Not tested here.

  it('T-16: budget exhausted, climbing decision -> BudgetExhausted, no submit', () => {
    const current = FLOOR.add(Money.fromKurus(1000n));
    const d = decide(
      input({
        listing: listing({ currentPrice: current }),
        state: { ...FRESH_STATE, phase: 'CLIMBING' },
        observation: observation({ rank: 1 }),
        budget: { dailyAllowance: 1000, consumedToday: 1000, reservePct: 20 },
      }),
    );
    expect(d.action).toBe('none');
    expect(d.reason).toBe('BudgetExhausted');
  });

  it('T-17: budget exhausted, selling at loss -> submits anyway (priority 0)', () => {
    const d = decide(
      input({
        listing: listing({ currentPrice: FLOOR.subtract(Money.fromKurus(500n)) }),
        budget: { dailyAllowance: 1000, consumedToday: 1000, reservePct: 20 },
      }),
    );
    expect(d.action).toBe('submit');
    expect(d.reason).toBe('SellingAtLoss');
    expect(d.priority).toBe(0);
  });

  it('T-18: sole seller -> price pinned to cost x (1 + soleSellerMarginPct%)', () => {
    const expected = priceForNetProceeds(Money.fromKurus((UNIT_COST.toKurus() * 120n) / 100n), {
      vatRate: VAT_RATE,
      effectiveCommissionRate: C_EFF,
      campaign: null,
      fees: FEES,
    });
    expect(expected.ok).toBe(true);
    const d = decide(
      input({
        state: { ...FRESH_STATE, phase: 'SEEKING' },
        observation: observation({ buyboxPrice: null, hasMultipleSeller: false }),
      }),
    );
    expect(d.action).toBe('submit');
    expect(d.reason).toBe('SoleSeller');
    expect(d.priority).toBe(4);
    expect(expected.ok && d.newPrice?.equals(expected.value)).toBe(true);
  });

  it('T-19: competitor low on stock, guard on -> no undercut when the guard margin exceeds the buybox price', () => {
    const buyboxPrice = FLOOR.add(Money.fromKurus(300n));
    const d = decide(
      input({
        listing: listing({ currentPrice: FLOOR.add(Money.fromKurus(500n)) }),
        state: { ...FRESH_STATE, phase: 'SEEKING' },
        policy: {
          ...DEFAULT_POLICY,
          lowStockGuardEnabled: true,
          lowStockThreshold: 5,
          lowStockMarginPct: 80,
        },
        observation: observation({ rank: 3, buyboxPrice, competitorStock: 1 }),
      }),
    );
    expect(d.action).toBe('none');
  });

  it('T-20: cost unknown -> no submit, CostUnknown, alert', () => {
    const d = decide(input({ cost: err({ type: 'StockItemNotFound', baseCode: '12345' }) }));
    expect(d.action).toBe('none');
    expect(d.reason).toBe('CostUnknown');
  });

  it('T-21: maxPrice below floor -> AtConfiguredLimit, alert, no submit', () => {
    const d = decide(
      input({
        listing: listing({
          currentPrice: FLOOR.add(Money.fromKurus(100n)),
          overrides: { maxPrice: FLOOR.subtract(Money.fromKurus(10n)) },
        }),
      }),
    );
    expect(d.action).toBe('none');
    expect(d.reason).toBe('AtConfiguredLimit');
  });

  it('T-22: scrape unavailable (secondSellerId null) -> identity trigger skipped; price triggers still fire', () => {
    const current = FLOOR.add(Money.fromKurus(1500n));
    const baseState: RepricingState = {
      ...FRESH_STATE,
      phase: 'OPTIMUM',
      optimumPrice: current,
      optimumContext: {
        unitCost: UNIT_COST,
        commissionRate: C0,
        vatRate: VAT_RATE,
        campaignRatio: 1,
        secondPrice: Money.fromKurus(500n),
        secondSellerId: 'seller-old',
      },
    };
    const l = listing({ currentPrice: current });

    // Identity unknown, nothing else changed -> still holding (trigger skipped, not fired).
    const holding = decide(
      input({
        listing: l,
        state: baseState,
        observation: observation({ rank: 1, secondPrice: Money.fromKurus(500n), secondSellerId: null }),
      }),
    );
    expect(holding.action).toBe('none');
    expect(holding.reason).toBe('HoldingOptimum');

    // Identity unknown, but the price trigger fires independently.
    const priceTriggered = decide(
      input({
        listing: l,
        state: baseState,
        observation: observation({ rank: 1, secondPrice: Money.fromKurus(900n), secondSellerId: null }),
      }),
    );
    expect(priceTriggered.nextState.phase).toBe('CLIMBING');
  });
});

describe('doc 03 §11 property tests', () => {
  it('never submits a price below floor, except when raising to it', () => {
    for (let offset = -600n; offset <= 600n; offset += 73n) {
      const current = FLOOR.add(Money.fromKurus(offset));
      const d = decide(
        input({
          listing: listing({
            currentPrice: current.compareTo(Money.zero) >= 0 ? current : Money.fromKurus(1n),
          }),
          state: { ...FRESH_STATE, phase: 'CLIMBING' },
          observation: observation({ rank: 1 }),
        }),
      );
      if (d.action === 'submit') {
        expect(d.newPrice && d.newPrice.compareTo(FLOOR) >= 0).toBe(true);
      }
    }
  });

  it('never submits a price outside [minPrice, maxPrice]', () => {
    const minPrice = FLOOR.add(Money.fromKurus(500n));
    const maxPrice = FLOOR.add(Money.fromKurus(1500n));
    for (let offset = 0n; offset <= 2000n; offset += 111n) {
      const current = FLOOR.add(Money.fromKurus(offset));
      const d = decide(
        input({
          listing: listing({ currentPrice: current, overrides: { minPrice, maxPrice } }),
          state: { ...FRESH_STATE, phase: 'CLIMBING' },
          observation: observation({ rank: 1 }),
        }),
      );
      if (d.action === 'submit' && d.newPrice) {
        expect(d.newPrice.compareTo(minPrice) >= 0).toBe(true);
        expect(d.newPrice.compareTo(maxPrice) <= 0).toBe(true);
      }
    }
  });

  it('a sequence of unchanged observations converges to zero submissions within a bounded number of cycles', () => {
    let state: RepricingState = { ...FRESH_STATE, phase: 'SEEKING' };
    let current = FLOOR.add(Money.fromKurus(1000n));
    const buyboxPrice = FLOOR.add(Money.fromKurus(2000n));
    let submits = 0;
    const MAX_CYCLES = 50;
    let cyclesToZero = -1;
    for (let i = 0; i < MAX_CYCLES; i++) {
      const d = decide(
        input({
          listing: listing({ currentPrice: current }),
          state,
          observation: observation({ rank: state.phase === 'CLIMBING' ? 1 : 3, buyboxPrice }),
        }),
      );
      state = d.nextState;
      if (d.action === 'submit') {
        submits++;
        current = d.newPrice as Money;
      } else if (cyclesToZero === -1) {
        cyclesToZero = i;
      }
      if (state.phase === 'OPTIMUM' && d.action === 'none') break;
    }
    expect(submits).toBeLessThan(MAX_CYCLES);
  });

  it('lastGoodPrice < lastBadPrice whenever both are set', () => {
    // A realistic climb-then-refine run: rank is derived from where `current` sits
    // relative to a fixed true ceiling, so the bracket is only ever populated from
    // observations actually taken at the (changing) submitted price — never seeded
    // artificially at a single fixed point, which is what a real deployment does too.
    const trueCeilingOffset = 1650n;
    let state: RepricingState = { ...FRESH_STATE, phase: 'CLIMBING' };
    let current = FLOOR.add(Money.fromKurus(1000n));
    for (let i = 0; i < 30; i++) {
      const rank = current.subtract(FLOOR).toKurus() <= trueCeilingOffset ? 1 : 2;
      const d = decide(
        input({ listing: listing({ currentPrice: current }), state, observation: observation({ rank }) }),
      );
      state = d.nextState;
      if (d.action === 'submit' && d.newPrice) current = d.newPrice;
      if (state.lastGoodPrice && state.lastBadPrice) {
        expect(state.lastGoodPrice.compareTo(state.lastBadPrice) < 0).toBe(true);
      }
      if (state.phase === 'OPTIMUM' && d.action === 'none') break;
    }
  });
});
