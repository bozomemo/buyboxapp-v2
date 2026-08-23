/**
 * Licence claims and the pure evaluation of them (docs/13-licensing.md §2.1, §4).
 *
 * Nothing here does I/O or reads a clock: `evaluateClaims` takes `nowMs` as an input, exactly
 * like the domain core's pricing functions, so every state transition below is table-testable
 * with no fake timers.
 */
import { z } from 'zod';

/** doc 13 §4.1 — a renewal that lands a day late must not be an outage during the trading day. */
export const LICENSE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * doc 13 §4.3 — how far the system clock may legitimately move backwards before it is treated
 * as a rollback. NTP corrections, a daylight-saving misconfiguration and a VM snapshot restore
 * all move a clock backwards, and none of them should stop a customer's repricing.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export const LicenseClaimsSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1),
  customer: z.string().min(1),
  issuedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  edition: z.enum(['standard', 'trial']),
  marketplaces: z.array(z.string().min(1)).optional(),
  maxListings: z.number().int().positive().optional(),
  fingerprint: z.string().min(1).optional(),
});

export type LicenseClaims = z.infer<typeof LicenseClaimsSchema>;

/** Why a licence is not usable. Kept as a closed union so the UI can translate each case. */
export type LicenseInvalidReason =
  | 'malformed' // not three dot-separated parts, or part 2/3 is not base64url
  | 'unknown-format' // prefix is not `BBX1`
  | 'bad-signature' // signed by some other key, or the payload was edited
  | 'bad-claims' // signature good but the payload does not match the schema
  | 'clock-rollback'; // doc 13 §4.3

export type LicenseStatus =
  | { readonly state: 'valid'; readonly claims: LicenseClaims; readonly expiresAtMs: number; readonly daysRemaining: number; readonly fingerprintMismatch: boolean }
  | { readonly state: 'grace'; readonly claims: LicenseClaims; readonly expiresAtMs: number; readonly graceEndsAtMs: number; readonly graceDaysRemaining: number; readonly fingerprintMismatch: boolean }
  | { readonly state: 'expired'; readonly claims: LicenseClaims; readonly expiresAtMs: number }
  | { readonly state: 'invalid'; readonly reason: LicenseInvalidReason }
  | { readonly state: 'missing' };

/**
 * **The fail-closed rule** (doc 13 §4), the licensing counterpart of `isKillSwitchEngaged`:
 * only an affirmative `valid` or `grace` lets the system run. Every other outcome — no token,
 * a truncated paste, a corrupted row, an expired licence past grace — means stopped. Callers
 * must never re-derive this by testing individual states, so that a state added later is
 * stopped by default rather than accidentally permitted.
 */
export function isLicensedToRun(status: LicenseStatus): boolean {
  return status.state === 'valid' || status.state === 'grace';
}

/** Whole days, rounded up, so "expires in 4 hours" reads as 1 day rather than 0. */
function daysCeil(ms: number): number {
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export interface EvaluateClaimsOptions {
  readonly nowMs: number;
  readonly graceMs?: number;
  /**
   * The monotonic high-water mark of previously observed times (doc 13 §4.3). Omit on the very
   * first evaluation of a fresh install, where there is nothing to compare against yet.
   */
  readonly lastSeenMs?: number;
  readonly clockSkewToleranceMs?: number;
  /** This install's fingerprint, compared against `claims.fingerprint` when that is present. */
  readonly fingerprint?: string;
}

/**
 * Turns verified claims into a status. Signature verification happens before this
 * (`verify.ts`); by the time claims reach here they are known to be authentic, so everything
 * this function decides is about *time* and *binding*.
 */
export function evaluateClaims(claims: LicenseClaims, options: EvaluateClaimsOptions): LicenseStatus {
  const {
    nowMs,
    graceMs = LICENSE_GRACE_MS,
    lastSeenMs,
    clockSkewToleranceMs = CLOCK_SKEW_TOLERANCE_MS,
    fingerprint,
  } = options;

  // Checked before expiry: a rolled-back clock would otherwise make an expired licence look
  // valid, which is the whole point of winding it back.
  if (lastSeenMs !== undefined && nowMs < lastSeenMs - clockSkewToleranceMs) {
    return { state: 'invalid', reason: 'clock-rollback' };
  }

  const expiresAtMs = Date.parse(claims.expiresAt);
  // doc 13 §5: binding is soft. A mismatch rides along on the status as a warning and never
  // changes which state we land in — a server migration must not become an outage.
  const fingerprintMismatch =
    claims.fingerprint !== undefined && fingerprint !== undefined && claims.fingerprint !== fingerprint;

  if (nowMs < expiresAtMs) {
    return {
      state: 'valid',
      claims,
      expiresAtMs,
      daysRemaining: daysCeil(expiresAtMs - nowMs),
      fingerprintMismatch,
    };
  }

  const graceEndsAtMs = expiresAtMs + graceMs;
  if (nowMs < graceEndsAtMs) {
    return {
      state: 'grace',
      claims,
      expiresAtMs,
      graceEndsAtMs,
      graceDaysRemaining: daysCeil(graceEndsAtMs - nowMs),
      fingerprintMismatch,
    };
  }

  return { state: 'expired', claims, expiresAtMs };
}
