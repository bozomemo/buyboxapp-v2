/**
 * TOTP, RFC 6238 over RFC 4226 HOTP (docs/18-authentication-and-access.md §5.2).
 *
 * Written here rather than taken from a library: it is forty lines, the RFC ships test vectors
 * (`totp.test.ts` runs them), and it keeps a dependency out of the sign-in path. HMAC-SHA-1,
 * six digits and a thirty-second step are what every mainstream authenticator app supports —
 * the "stronger" options are ignored or mishandled by enough apps that they lock people out.
 *
 * Time is passed in (`nowMs`), never read, so the drift window and the replay guard are
 * table-testable.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps accepted either side of now, for phone clock drift. */
export const TOTP_DRIFT_STEPS = 1;
export const TOTP_SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, unpadded — the form `otpauth://` URIs and manual key entry use. */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** Lenient about case, spaces and padding (people type keys by hand); strict about the alphabet. */
export function base32Decode(text: string): Buffer | undefined {
  const cleaned = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return undefined;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpSecret(): Buffer {
  return randomBytes(TOTP_SECRET_BYTES);
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** RFC 4226 §5.3, dynamic truncation. `digits` is a parameter only so the RFC's 8-digit vectors can run. */
export function hotp(secret: Buffer, counter: number, digits: number = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(message).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export function totpCode(secret: Buffer, nowMs: number, digits: number = TOTP_DIGITS): string {
  return hotp(secret, totpStep(nowMs), digits);
}

export type TotpVerification = { readonly ok: true; readonly step: number } | { readonly ok: false };

/**
 * Accepts a code for the current step ±`TOTP_DRIFT_STEPS`, **except** any step at or before
 * `lastAcceptedStep` — a code is good once (R-AUTH-6). The caller stores the returned `step` as
 * the user's new `totp_last_step`.
 *
 * Every candidate step is compared, match or not, so timing says nothing about which one hit.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  nowMs: number,
  lastAcceptedStep: number | null,
): TotpVerification {
  const typed = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(typed)) return { ok: false };
  const current = totpStep(nowMs);
  let matched: number | null = null;
  for (let step = current - TOTP_DRIFT_STEPS; step <= current + TOTP_DRIFT_STEPS; step++) {
    const expected = hotp(secret, step);
    const equal = timingSafeEqual(Buffer.from(expected), Buffer.from(typed));
    if (equal && matched === null) matched = step;
  }
  if (matched === null) return { ok: false };
  if (lastAcceptedStep !== null && matched <= lastAcceptedStep) return { ok: false };
  return { ok: true, step: matched };
}

/**
 * The URI an authenticator app reads from the QR code (Key Uri Format, as Google Authenticator
 * defined it and every app since has followed). The issuer appears twice on purpose: older apps
 * read the label prefix, newer ones the parameter.
 */
export function totpUri(options: { issuer: string; accountName: string; secret: Buffer }): string {
  const label = `${encodeURIComponent(options.issuer)}:${encodeURIComponent(options.accountName)}`;
  // Built by hand rather than with URLSearchParams, which encodes a space as `+` — and the
  // issuer, `BuyBox (<store name>)`, always has one. Not every app decodes `+` in this URI.
  const pairs: readonly (readonly [string, string])[] = [
    ['secret', base32Encode(options.secret)],
    ['issuer', options.issuer],
    ['algorithm', 'SHA1'],
    ['digits', String(TOTP_DIGITS)],
    ['period', String(TOTP_PERIOD_SECONDS)],
  ];
  const params = pairs
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `otpauth://totp/${label}?${params}`;
}
