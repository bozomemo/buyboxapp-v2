/**
 * Licensing (docs/13-licensing.md). A commercial control, not a security boundary — read §1 of
 * that document before extending anything here, especially before adding anti-tamper measures
 * it deliberately rules out.
 */

/** doc 13 §3 — the `app_settings` row holding the pasted token. Signed public data, not a secret. */
export const LICENSE_TOKEN_SETTING_KEY = 'license.token';

/** doc 13 §4.3 — the monotonic high-water mark used to detect a wound-back clock. */
export const LICENSE_LAST_SEEN_SETTING_KEY = 'license.lastSeenAt';

/** doc 13 §3 — environment override, which takes precedence over the stored row. */
export const LICENSE_TOKEN_ENV_VAR = 'LICENSE_TOKEN';

/** doc 13 §6 — how long the web middleware may reuse a computed status before re-reading. */
export const LICENSE_CACHE_TTL_MS = 60_000;

export type {
  LicenseClaims,
  LicenseInvalidReason,
  LicenseStatus,
  EvaluateClaimsOptions,
} from './claims.js';
export {
  CLOCK_SKEW_TOLERANCE_MS,
  LICENSE_GRACE_MS,
  LicenseClaimsSchema,
  evaluateClaims,
  isLicensedToRun,
} from './claims.js';
export type { VerifyLicenseOptions } from './verify.js';
export { LICENSE_TOKEN_PREFIX, base64UrlEncode, signLicense, verifyLicense } from './verify.js';
export { LICENSE_PUBLIC_KEY_PEM, resolveLicensePublicKey } from './public-key.js';
