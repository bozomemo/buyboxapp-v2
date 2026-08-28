/**
 * packages/core — the pure domain: stock codes, cost, fees, pricing, the decision engine.
 * NO I/O. NO database. NO clock (all time is an input). NO `any`.
 */
export type { MarketplaceCode } from './marketplace.js';
export type { CostError, PriceError } from './errors.js';

export type { StockCode, StockCodeError } from './stock-code.js';
export { parseStockCode } from './stock-code.js';

export type { Fraction } from './fraction.js';
export { Fraction as FractionOps } from './fraction.js';

export type { BundleMember, CostCalculatorDeps } from './cost-calculator.js';
export { originalUnitCost, unitCost } from './cost-calculator.js';

export type { CargoBand, ExpenditureBand, FeeSettings } from './fee-model.js';
export {
  effectiveCommissionRate,
  normaliseAmount,
  normalisedCargo,
  normalisedExpenditure,
  selectCargoBandIndex,
  selectExpenditureBandIndex,
  bandKey,
} from './fee-model.js';

export type {
  CampaignFinal,
  CampaignRatio,
  FloorPriceInput,
  NetProceedsInput,
  SolvePriceInput,
} from './price-calculator.js';
export { floorPrice, netProceeds, priceForNetProceeds, retentionFactor } from './price-calculator.js';

export type { ListingPriceOverrides, PolicyValidationError, RepricingPolicy } from './repricing/policy.js';
export { validateListingOverrides, validatePolicy } from './repricing/policy.js';

export type {
  BuyboxObservation,
  DecisionInput,
  DecisionReason,
  ListingSnapshot,
  OptimumContext,
  PendingSubmission,
  PriceDecision,
  RepricingPhase,
  RepricingState,
  UpdateBudget,
} from './repricing/types.js';

export { decide } from './repricing/engine.js';

export type {
  AlertEvaluation,
  AlertListingContext,
  AlertMatch,
  AlertOffer,
  AlertPredicate,
  AlertRule,
  AlertScopeType,
  AlertSubjectType,
  AlertThresholdType,
  PriceSource,
} from './alerts/rules.js';
export { alertKey, evaluateAlertRules } from './alerts/rules.js';

export type {
  SellerIdentityFacts,
  SellerPolicyIdentity,
  SellerPolicyResolution,
  SellerPolicyRule,
  SellerPolicyStatus,
  SellerPolicyVerdict,
} from './brand/seller-policy.js';
export { resolveSellerPolicy } from './brand/seller-policy.js';

export type {
  AuditFinding,
  AuditFindingBasis,
  AuditFindingKind,
  AuditInput,
  AuditProductFacts,
  AuditSellerFacts,
  AuditSubject,
  AuditThresholds,
  AuditWorstProduct,
} from './brand/audit-findings.js';
export {
  auditFindingOrder,
  deriveAuditFindings,
  DEFAULT_AUDIT_THRESHOLDS,
} from './brand/audit-findings.js';
