/**
 * Licence token parsing and Ed25519 signature verification (docs/13-licensing.md §2, §4).
 *
 * `node:crypto` is a deterministic computation here, not I/O — same bytes in, same verdict
 * out, no network, no clock, no filesystem. That is why this can sit alongside the pure claim
 * evaluation in `claims.ts` rather than behind a port.
 */
import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import {
  evaluateClaims,
  LicenseClaimsSchema,
  type EvaluateClaimsOptions,
  type LicenseStatus,
} from './claims.js';

/** doc 13 §2 — the format version prefix. An unrecognised prefix is rejected, never guessed at. */
export const LICENSE_TOKEN_PREFIX = 'BBX1';

function base64UrlDecode(value: string): Buffer | undefined {
  // Reject anything outside the base64url alphabet up front: Buffer.from is lenient and would
  // silently drop stray characters, turning a corrupted paste into a "bad signature" rather
  // than the "malformed" it actually is.
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  return Buffer.from(value, 'base64url');
}

export function base64UrlEncode(value: Buffer): string {
  return value.toString('base64url');
}

export interface VerifyLicenseOptions extends EvaluateClaimsOptions {
  /** PEM-encoded Ed25519 public key; defaults to the compiled-in vendor key. */
  readonly publicKeyPem: string;
}

/**
 * The single entry point both enforcement points use (doc 13 §6). Returns a status rather than
 * throwing: every failure mode is a state the UI has to render and the scheduler has to act
 * on, so none of them is exceptional.
 *
 * `undefined`/empty token is `missing`, not `invalid` — an install that was never licensed and
 * one holding a corrupted licence need different messages, even though both are stopped.
 */
export function verifyLicense(
  token: string | undefined,
  options: VerifyLicenseOptions,
): LicenseStatus {
  if (token === undefined || token.trim() === '') return { state: 'missing' };

  const parts = token.trim().split('.');
  if (parts.length !== 3) return { state: 'invalid', reason: 'malformed' };
  const [prefix, payloadPart, signaturePart] = parts as [string, string, string];
  if (prefix !== LICENSE_TOKEN_PREFIX) return { state: 'invalid', reason: 'unknown-format' };

  const payloadBytes = base64UrlDecode(payloadPart);
  const signatureBytes = base64UrlDecode(signaturePart);
  if (!payloadBytes || !signatureBytes) return { state: 'invalid', reason: 'malformed' };

  let signatureOk: boolean;
  try {
    // Ed25519 takes `null` as the digest algorithm — it hashes internally.
    signatureOk = cryptoVerify(
      null,
      payloadBytes,
      createPublicKey(options.publicKeyPem),
      signatureBytes,
    );
  } catch {
    // A malformed public key or a signature of the wrong length throws rather than returning
    // false. Both mean the same thing to the operator, and both must stop the system.
    signatureOk = false;
  }
  if (!signatureOk) return { state: 'invalid', reason: 'bad-signature' };

  let rawClaims: unknown;
  try {
    rawClaims = JSON.parse(payloadBytes.toString('utf8'));
  } catch {
    return { state: 'invalid', reason: 'bad-claims' };
  }

  const parsed = LicenseClaimsSchema.safeParse(rawClaims);
  if (!parsed.success) return { state: 'invalid', reason: 'bad-claims' };
  // A signature can only be forged with the private key, but a *validly signed* token issued by
  // an older tool could still carry an unparseable date. Guard it rather than letting NaN
  // comparisons silently read as "expired".
  if (Number.isNaN(Date.parse(parsed.data.expiresAt))) {
    return { state: 'invalid', reason: 'bad-claims' };
  }

  return evaluateClaims(parsed.data, options);
}

/**
 * Vendor-side signing, kept next to the verifier so the two can never disagree about what
 * bytes are signed. Used only by `scripts/issue-license.mjs`; no install ever calls it,
 * because no install holds the private key.
 */
export function signLicense(claims: unknown, privateKeyPem: string): string {
  const payloadBytes = Buffer.from(JSON.stringify(claims), 'utf8');
  const signatureBytes = cryptoSign(null, payloadBytes, createPrivateKey(privateKeyPem));
  return `${LICENSE_TOKEN_PREFIX}.${base64UrlEncode(payloadBytes)}.${base64UrlEncode(signatureBytes)}`;
}
