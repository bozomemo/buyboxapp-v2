/**
 * Repricing engine types — docs/03-repricing-engines.md §2, §4, §8.
 */
import type { Money, Result } from '@buybox/shared';
import type { CostError } from '../errors.js';
import type { FeeSettings } from '../fee-model.js';
import type { CampaignFinal } from '../price-calculator.js';
import type { ListingPriceOverrides, RepricingPolicy } from './policy.js';

export interface BuyboxObservation {
  readonly rank: number | null; // 1 = we hold the buybox; null = unknown
  readonly buyboxPrice: Money | null;
  readonly secondPrice: Money | null;
  readonly thirdPrice: Money | null;
  readonly hasMultipleSeller: boolean;
  readonly secondSellerId: string | null; // reporting scrape; may be stale or absent
  /**
   * The buybox holder's offered stock. Not listed in doc 03 §2's `BuyboxObservation`
   * shape, but required by the low-stock guard in §6.1 ("competitorStock < threshold");
   * it is added here so the guard has data to read. `null` when unknown, in which case
   * the guard is skipped, matching how every other capability-dependent trigger degrades.
   */
  readonly competitorStock: number | null;
  readonly observedAt: Date;
}

export type RepricingPhase = 'SEEKING' | 'CLIMBING' | 'REFINING' | 'OPTIMUM' | 'BLOCKED';

export interface OptimumContext {
  readonly unitCost: Money;
  readonly commissionRate: number;
  readonly vatRate: number;
  readonly campaignRatio: number;
  readonly secondPrice: Money | null;
  readonly secondSellerId: string | null;
}

export interface PendingSubmission {
  readonly submissionId: string;
  readonly submittedPrice: Money;
  readonly submittedAt: Date;
  readonly confirmedAt: Date | null;
}

export interface RepricingState {
  readonly phase: RepricingPhase;
  readonly lastGoodPrice: Money | null; // highest price observed in the buybox
  readonly lastBadPrice: Money | null; // lowest price observed out of the buybox
  readonly optimumPrice: Money | null;
  readonly optimumContext: OptimumContext | null;
  readonly pendingSubmission: PendingSubmission | null;
  readonly settleUntil: Date | null;
  readonly consecutiveRejections: number;
}

/** doc 03 §8. `remaining` is derived, not stored — see the design note in `engine.ts`. */
export interface UpdateBudget {
  readonly dailyAllowance: number;
  readonly consumedToday: number;
  readonly reservePct: number; // default 20
}

export interface ListingSnapshot {
  readonly currentPrice: Money;
  readonly physicalStock: number;
  readonly commissionRate: number; // c0, ex-VAT percent
  readonly vatRate: number; // percent
  readonly locked: boolean;
  readonly suspended: boolean;
  readonly salable: boolean;
  readonly archived: boolean;
  readonly campaign: CampaignFinal | null;
  readonly overrides: ListingPriceOverrides;
}

export type DecisionReason =
  | 'SellingAtLoss'
  | 'Seeking'
  | 'Climbing'
  | 'Refining'
  | 'HoldingOptimum'
  | 'Blocked'
  | 'SoleSeller'
  | 'NothingChanged'
  | 'AwaitingConfirmation'
  | 'AwaitingSettle'
  | 'Disabled'
  | 'InsufficientData'
  | 'BudgetExhausted'
  | 'CostUnknown'
  | 'PriceRangeRejected'
  | 'AtConfiguredLimit';

export interface PriceDecision {
  readonly action: 'none' | 'submit';
  readonly newPrice?: Money;
  readonly nextState: RepricingState;
  readonly reason: DecisionReason;
  readonly priority: number; // 0 = highest
  readonly explanation: string;
}

export interface DecisionInput {
  readonly listing: ListingSnapshot;
  readonly observation: BuyboxObservation;
  readonly state: RepricingState;
  readonly cost: Result<Money, CostError>;
  readonly fees: FeeSettings;
  readonly policy: RepricingPolicy;
  readonly budget: UpdateBudget;
  readonly now: Date;
}
