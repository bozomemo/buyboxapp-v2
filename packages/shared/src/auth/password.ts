/**
 * Password hashing and policy (docs/18-authentication-and-access.md §3.2).
 *
 * scrypt from `node:crypto` — no dependency. The parameters are written into every stored hash,
 * so raising them later is a constant change here plus a rehash at each user's next sign-in,
 * never a migration.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { AUTH_PASSWORD_MAX_LENGTH, AUTH_PASSWORD_MIN_LENGTH } from './constants.js';
import { isCommonPassword } from './common-passwords.js';

export interface ScryptParams {
  readonly log2N: number;
  readonly r: number;
  readonly p: number;
}

/** doc 08 §15. ~32 MiB and tens of milliseconds per hash on a VPS core. */
export const CURRENT_SCRYPT_PARAMS: ScryptParams = { log2N: 15, r: 8, p: 1 };

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const PREFIX = 'scrypt';

function scrypt(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const N = 2 ** params.log2N;
  const options: ScryptOptions = {
    N,
    r: params.r,
    p: params.p,
    // Node's default maxmem (32 MiB) is exactly 128·N·r at our parameters and refuses them;
    // twice the requirement leaves room without letting a forged hash string ask for gigabytes.
    maxmem: 2 * 128 * N * params.r,
  };
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize('NFC'), salt, KEY_BYTES, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** `salt` is injectable for tests only; production always takes 16 fresh random bytes. */
export async function hashPassword(
  password: string,
  options: { salt?: Buffer; params?: ScryptParams } = {},
): Promise<string> {
  const params = options.params ?? CURRENT_SCRYPT_PARAMS;
  const salt = options.salt ?? randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, params);
  return [PREFIX, params.log2N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
}

interface ParsedHash {
  readonly params: ScryptParams;
  readonly salt: Buffer;
  readonly key: Buffer;
}

/**
 * Bounds on what a stored string may ask for. A hash is data read from the database; one that
 * demands N = 2^30 must be refused as corrupt, not executed.
 */
function parseHash(stored: string): ParsedHash | undefined {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return undefined;
  const [, log2NText, rText, pText, saltText, keyText] = parts as [string, string, string, string, string, string];
  const log2N = Number(log2NText);
  const r = Number(rText);
  const p = Number(pText);
  if (![log2N, r, p].every(Number.isInteger)) return undefined;
  if (log2N < 10 || log2N > 20 || r < 1 || r > 32 || p < 1 || p > 16) return undefined;
  const salt = Buffer.from(saltText, 'base64');
  const key = Buffer.from(keyText, 'base64');
  if (salt.length < 8 || key.length !== KEY_BYTES) return undefined;
  return { params: { log2N, r, p }, salt, key };
}

export interface PasswordVerification {
  readonly ok: boolean;
  /** The hash is valid but weaker than `CURRENT_SCRYPT_PARAMS`: rehash now, while the password is known. */
  readonly needsRehash: boolean;
}

export async function verifyPassword(password: string, stored: string): Promise<PasswordVerification> {
  const parsed = parseHash(stored);
  if (parsed === undefined) return { ok: false, needsRehash: false };
  const candidate = await scrypt(password, parsed.salt, parsed.params);
  const ok = timingSafeEqual(candidate, parsed.key);
  const current = CURRENT_SCRYPT_PARAMS;
  const needsRehash =
    ok &&
    (parsed.params.log2N !== current.log2N || parsed.params.r !== current.r || parsed.params.p !== current.p);
  return { ok, needsRehash };
}

let dummyHash: Promise<string> | undefined;

/**
 * doc 18 §3.2 — an unknown username costs the same scrypt as a known one, so response time does
 * not reveal which usernames exist. Always answers `false`.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64'));
  await verifyPassword(password, await dummyHash);
  return false;
}

export type PasswordPolicyViolation = 'too-short' | 'too-long' | 'same-as-username' | 'common';

export const PASSWORD_POLICY_MESSAGES: Readonly<Record<PasswordPolicyViolation, string>> = {
  'too-short': `Parola en az ${AUTH_PASSWORD_MIN_LENGTH} karakter olmalı.`,
  'too-long': `Parola en fazla ${AUTH_PASSWORD_MAX_LENGTH} karakter olabilir.`,
  'same-as-username': 'Parola kullanıcı adıyla aynı olamaz.',
  common: 'Bu parola çok yaygın; tahmin edilmesi kolay. Başka bir parola seçin.',
};

/**
 * doc 18 §3.2: length only, no composition rules. Length is counted in code points after NFC,
 * so `ş` typed as one precomposed character or as `s` + combining cedilla counts the same.
 */
export function checkPasswordPolicy(password: string, username: string): PasswordPolicyViolation | null {
  const normalised = password.normalize('NFC');
  const length = [...normalised].length;
  if (length < AUTH_PASSWORD_MIN_LENGTH) return 'too-short';
  if (length > AUTH_PASSWORD_MAX_LENGTH) return 'too-long';
  if (normalised.toLowerCase() === username.toLowerCase()) return 'same-as-username';
  if (isCommonPassword(normalised)) return 'common';
  return null;
}
