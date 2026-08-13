/**
 * Update-budget admission (doc 03 §8, doc 07 §5) — a pure function of remaining budget and
 * reserve, so `SubmitPriceChanges` can filter its outbox batch without any I/O of its own.
 *
 * | Priority | Reason(s)                          | Admitted while remaining is… |
 * |----------|-------------------------------------|-------------------------------|
 * | 0        | SellingAtLoss                       | always — never held back      |
 * | 1        | Seeking, Blocked (raise to floor)   | > 0                            |
 * | 2        | Refining                            | > reserve                      |
 * | 3        | Climbing                            | > reserve                      |
 * | 4        | SoleSeller                          | > reserve                      |
 *
 * "Always" for priority 0 is literal: a fully exhausted budget (`remaining == 0`) still
 * admits priority 0, and refuses everything else — doc 12 Phase 5.6's DoD ("exhausted budget
 * admits priority 0 only").
 *
 * Priority 3's "ranked by expected value" nuance (doc 03 §8) is not modelled here — the
 * outbox's existing `(priority, decidedAt)` order (doc 05 §6) is what ranks candidates before
 * this function ever sees them; a true expected-value ranking is a future refinement doc 03
 * doesn't define a formula for yet.
 */

export function remainingBudget(allowance: number, consumedToday: number): number {
  return Math.max(0, allowance - consumedToday);
}

export function reserveAmount(allowance: number, reservePct: number): number {
  return allowance * (reservePct / 100);
}

export interface BudgetAdmission {
  readonly admitted: boolean;
}

/** `remaining` must already reflect any items admitted earlier in the same batch. */
export function admitByPriority(
  priority: number,
  remaining: number,
  reservePct: number,
  allowance: number,
): boolean {
  if (priority === 0) return true;
  if (remaining <= 0) return false;
  if (priority === 1) return true;
  return remaining > reserveAmount(allowance, reservePct);
}
