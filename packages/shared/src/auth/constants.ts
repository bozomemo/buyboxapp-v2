/**
 * Authentication constants that are code, not configuration (docs/08-configuration-and-constants.md
 * §15). The environment-overridable ones (`AUTH_SESSION_IDLE_MS`, …) have their defaults here
 * too, so the env schema and the code cannot disagree about what "unset" means.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const AUTH_SESSION_IDLE_MS_DEFAULT = 8 * HOUR;
export const AUTH_SESSION_ABSOLUTE_MS_DEFAULT = 7 * DAY;
export const AUTH_TRUSTED_DEVICE_DAYS_DEFAULT = 30;
/** `last_seen_at` is written at most this often, so browsing does not write on every request. */
export const AUTH_SESSION_TOUCH_INTERVAL_MS = MINUTE;

export const AUTH_LOCKOUT_ATTEMPTS = 5;
export const AUTH_LOCKOUT_WINDOW_MS = 15 * MINUTE;
export const AUTH_IP_LOCKOUT_ATTEMPTS = 20;

export const AUTH_PASSWORD_MIN_LENGTH = 10;
export const AUTH_PASSWORD_MAX_LENGTH = 128;

export const AUTH_MFA_CHALLENGE_TTL_MS = 5 * MINUTE;
/** Wrong codes of any kind allowed on one challenge before it is spent (doc 18 §5.1). */
export const AUTH_MFA_MAX_ATTEMPTS = 5;
/** An enrolment secret the user never confirmed is discarded after this. */
export const AUTH_TOTP_ENROLMENT_TTL_MS = 15 * MINUTE;

export const AUTH_SMS_CODE_TTL_MS = 5 * MINUTE;
export const AUTH_SMS_MAX_ATTEMPTS = 5;
export const AUTH_SMS_RESEND_MS = MINUTE;
export const AUTH_SMS_PER_USER_HOURLY = 5;
export const AUTH_SMS_PER_PHONE_DAILY = 10;
export const AUTH_SMS_DAILY_CAP_DEFAULT = 200;

export const AUTH_RECOVERY_CODE_COUNT = 10;

/** `app_settings` key — loopback installs only; a network install ignores it (R-AUTH-5). */
export const AUTH_MFA_REQUIRED_SETTING_KEY = 'auth.mfaRequired';

/** Secret-store key for a user's TOTP secret (doc 18 §5.2, never a database column). */
export function totpSecretKey(userId: string): string {
  return `user:${userId}:totp`;
}

/** An enrolment secret awaiting its confirming code (doc 18 §5.2); promoted or discarded. */
export function totpPendingSecretKey(userId: string): string {
  return `${totpSecretKey(userId)}:pending`;
}
