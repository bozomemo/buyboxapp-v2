/**
 * When the tracked sweep's current pass is likely to finish (doc 07 §7.4, doc 06 §12.2).
 *
 * Computed from the pass's **own observed rate** — elapsed time divided by products actually
 * read — and never from the configured requests-per-minute. The two differ by about a factor of
 * four on the operator's machine, because the bound is how long a Trendyol product page takes to
 * render (8-15 s) rather than the rate limit (30/min), so an estimate built from the limit would
 * promise a finishing time the machine cannot reach.
 */
export interface SweepPassProgress {
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly plannedCount: number;
  readonly doneCount: number;
}

/**
 * How many products a pass must have read before its rate is worth extrapolating from.
 *
 * A prediction drawn from two products will be wrong by hours, and an operator would reasonably
 * read it as a promise. Below this the card shows no estimate at all, which is honest: the pass
 * has not been running long enough to know.
 */
export const MIN_SAMPLE_FOR_ESTIMATE = 10;

export function estimateFinishAtMs(pass: SweepPassProgress, nowMs: number): number | null {
  // A finished pass has an answer, not an estimate.
  if (pass.finishedAt !== null) return null;
  if (pass.doneCount <= MIN_SAMPLE_FOR_ESTIMATE) return null;
  const elapsedMs = nowMs - pass.startedAt;
  if (elapsedMs <= 0) return null;
  const remaining = Math.max(0, pass.plannedCount - pass.doneCount);
  return nowMs + (elapsedMs / pass.doneCount) * remaining;
}
