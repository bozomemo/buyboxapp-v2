/**
 * Circuit breaker thresholds (doc 07 §3: "after N consecutive transport failures, open the
 * circuit ... Half-open probe after a cooldown"). Doc 08 does not list values for N or the
 * cooldown — this rewrite has no legacy circuit breaker to inherit numbers from — so these
 * are a deliberate, disclosed default rather than a spec-derived constant. Not yet exposed
 * as a per-marketplace policy field (doc 08 §11 "Engine policy" doesn't list it either);
 * revisit if real-world tuning shows a marketplace needs a different threshold.
 */
export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
export const CIRCUIT_BREAKER_OPEN_DURATION_MS = 5 * 60_000; // 5 minutes
