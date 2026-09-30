/**
 * Opaque tokens and one-time codes (docs/18-authentication-and-access.md §4.1, §5.3, §5.4, §8.1).
 *
 * The rule throughout: the browser (or the user) holds the value, the database holds only a
 * hash of it. A copy of the database therefore contains no usable session, device, challenge
 * or code.
 */
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { base32Encode } from './totp.js';
import { AUTH_RECOVERY_CODE_COUNT } from './constants.js';

/** Session, trusted-device and challenge cookies: 32 random bytes, base64url. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256, hex. A plain hash suffices — no salt, no stretching — because every value hashed
 * here carries at least 50 random bits: there is no dictionary to precompute.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests (or any two same-alphabet strings). */
export function digestsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// ── Recovery codes (§5.4) ──────────────────────────────────────────────────────────────────

const RECOVERY_CODE_LENGTH = 10;

/** 10 base32 characters = 50 bits, shown as `ABCDE-FGHIJ`. */
export function generateRecoveryCodes(count: number = AUTH_RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  while (codes.length < count) {
    const raw = base32Encode(randomBytes(7)).slice(0, RECOVERY_CODE_LENGTH);
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    if (!codes.includes(formatted)) codes.push(formatted);
  }
  return codes;
}

/**
 * What the user typed, reduced to the stored form: hyphens and spaces dropped, upper-cased.
 * `undefined` when it cannot be a recovery code at all, so the caller need not hash garbage.
 * `toUpperCase` (not `toLocaleUpperCase`) — a Turkish locale would turn `i` into `İ`.
 */
export function normaliseRecoveryCode(input: string): string | undefined {
  const cleaned = input.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z2-7]{10}$/.test(cleaned) ? cleaned : undefined;
}

export function hashRecoveryCode(code: string): string | undefined {
  const normalised = normaliseRecoveryCode(code);
  return normalised === undefined ? undefined : hashToken(normalised);
}

// ── Setup token (§8.1) ─────────────────────────────────────────────────────────────────────

/** 20 bytes, base32 — typed or pasted by a person from a file, so no ambiguous punctuation. */
export function generateSetupToken(): string {
  return base32Encode(randomBytes(20));
}

export function setupTokensEqual(expected: string, typed: string): boolean {
  const clean = (value: string) => value.replace(/\s/g, '').toUpperCase();
  return digestsEqual(hashToken(clean(expected)), hashToken(clean(typed)));
}

// ── SMS codes (§5.3) ───────────────────────────────────────────────────────────────────────

export function generateSmsCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * The key the SMS-code MAC uses, derived from `SECRET_STORE_KEY` — a secret that is **not** in
 * the database. That is the whole point: a six-digit code has a million values, so a digest
 * keyed with anything stored beside it can be brute-forced from a leaked row in a second.
 * The derivation label keeps this key distinct from the secret store's own.
 */
export function deriveSmsCodeKey(secretStoreKey: string): Buffer {
  return createHmac('sha256', secretStoreKey).update('buybox/auth/sms-code/v1').digest();
}

/** Bound to the `sms_codes` row id, so a code's MAC is useless against any other row. */
export function smsCodeMac(key: Buffer, rowId: string, code: string): string {
  return createHmac('sha256', key).update(`${rowId}:${code}`).digest('hex');
}
