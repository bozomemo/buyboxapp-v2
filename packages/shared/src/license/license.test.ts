/**
 * Table-driven coverage of doc 13 §8's acceptance criteria (R-LIC-2, R-LIC-3, R-LIC-4,
 * R-LIC-6, R-LIC-7). Signing happens with a throwaway keypair generated per run, so the test
 * suite never needs — and must never contain — the real vendor private key.
 */
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LICENSE_GRACE_MS, isLicensedToRun, type LicenseClaims } from './claims.js';
import { signLicense, verifyLicense } from './verify.js';

const vendor = generateKeyPairSync('ed25519');
const publicKeyPem = vendor.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privateKeyPem = vendor.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const impostor = generateKeyPairSync('ed25519');
const impostorPrivateKeyPem = impostor.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const NOW = Date.parse('2026-08-23T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function claims(overrides: Partial<LicenseClaims> = {}): LicenseClaims {
  return {
    v: 1,
    id: 'LIC-0001',
    customer: 'Örnek Ticaret A.Ş.',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
    edition: 'standard',
    ...overrides,
  };
}

function token(overrides: Partial<LicenseClaims> = {}, key = privateKeyPem): string {
  return signLicense(claims(overrides), key);
}

describe('verifyLicense — rejection (R-LIC-2)', () => {
  const cases: readonly { name: string; token: string | undefined; reason: string | 'missing' }[] = [
    { name: 'no token at all', token: undefined, reason: 'missing' },
    { name: 'empty string', token: '', reason: 'missing' },
    { name: 'whitespace only', token: '   ', reason: 'missing' },
    { name: 'not three parts', token: 'BBX1.abc', reason: 'malformed' },
    { name: 'unknown format prefix', token: `BBX9.${token().split('.').slice(1).join('.')}`, reason: 'unknown-format' },
    { name: 'non-base64url payload', token: 'BBX1.not base64!.AAAA', reason: 'malformed' },
    { name: 'signed by another key', token: token({}, impostorPrivateKeyPem), reason: 'bad-signature' },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const status = verifyLicense(testCase.token, { publicKeyPem, nowMs: NOW });
      expect(status.state).toBe(testCase.reason === 'missing' ? 'missing' : 'invalid');
      if (status.state === 'invalid') expect(status.reason).toBe(testCase.reason);
      expect(isLicensedToRun(status)).toBe(false);
    });
  }

  it('rejects a payload edited after signing', () => {
    const [prefix, , signature] = token().split('.') as [string, string, string];
    const forged = Buffer.from(JSON.stringify(claims({ expiresAt: '2099-01-01T00:00:00.000Z' })), 'utf8');
    const status = verifyLicense(`${prefix}.${forged.toString('base64url')}.${signature}`, {
      publicKeyPem,
      nowMs: NOW,
    });
    expect(status).toEqual({ state: 'invalid', reason: 'bad-signature' });
  });

  it('rejects a validly signed token whose claims do not match the schema', () => {
    const status = verifyLicense(signLicense({ v: 1, id: 'x' }, privateKeyPem), {
      publicKeyPem,
      nowMs: NOW,
    });
    expect(status).toEqual({ state: 'invalid', reason: 'bad-claims' });
  });
});

describe('verifyLicense — expiry (R-LIC-3, R-LIC-4)', () => {
  const expiresAt = '2026-08-23T00:00:00.000Z';
  const expiresAtMs = Date.parse(expiresAt);

  it('is valid before expiry', () => {
    const status = verifyLicense(token({ expiresAt }), { publicKeyPem, nowMs: expiresAtMs - DAY });
    expect(status.state).toBe('valid');
    expect(isLicensedToRun(status)).toBe(true);
    if (status.state === 'valid') expect(status.daysRemaining).toBe(1);
  });

  it('is in grace, and still runs, one day after expiry', () => {
    const status = verifyLicense(token({ expiresAt }), { publicKeyPem, nowMs: expiresAtMs + DAY });
    expect(status.state).toBe('grace');
    expect(isLicensedToRun(status)).toBe(true);
    if (status.state === 'grace') expect(status.graceDaysRemaining).toBe(6);
  });

  it('is in grace on the last millisecond of the window', () => {
    const status = verifyLicense(token({ expiresAt }), {
      publicKeyPem,
      nowMs: expiresAtMs + LICENSE_GRACE_MS - 1,
    });
    expect(status.state).toBe('grace');
  });

  it('is expired, and stops, once grace elapses', () => {
    const status = verifyLicense(token({ expiresAt }), {
      publicKeyPem,
      nowMs: expiresAtMs + LICENSE_GRACE_MS,
    });
    expect(status.state).toBe('expired');
    expect(isLicensedToRun(status)).toBe(false);
  });
});

describe('verifyLicense — clock rollback (R-LIC-6)', () => {
  it('tolerates a clock moved back less than the skew tolerance', () => {
    const status = verifyLicense(token(), {
      publicKeyPem,
      nowMs: NOW,
      lastSeenMs: NOW + DAY - 1,
    });
    expect(status.state).toBe('valid');
  });

  it('rejects a clock moved back further than the tolerance', () => {
    const status = verifyLicense(token(), {
      publicKeyPem,
      nowMs: NOW,
      lastSeenMs: NOW + DAY + 1,
    });
    expect(status).toEqual({ state: 'invalid', reason: 'clock-rollback' });
  });

  it('does not trip on a fresh install with no high-water mark', () => {
    expect(verifyLicense(token(), { publicKeyPem, nowMs: NOW }).state).toBe('valid');
  });

  it('detects a rollback intended to revive an expired licence', () => {
    const expired = token({ expiresAt: '2026-01-01T00:00:00.000Z' });
    const status = verifyLicense(expired, {
      publicKeyPem,
      nowMs: Date.parse('2025-12-01T00:00:00.000Z'),
      lastSeenMs: NOW,
    });
    expect(status).toEqual({ state: 'invalid', reason: 'clock-rollback' });
  });
});

describe('verifyLicense — install binding is soft (R-LIC-7)', () => {
  it('flags a mismatch without stopping the system', () => {
    const status = verifyLicense(token({ fingerprint: 'issued-for-host-a' }), {
      publicKeyPem,
      nowMs: NOW,
      fingerprint: 'running-on-host-b',
    });
    expect(status.state).toBe('valid');
    expect(isLicensedToRun(status)).toBe(true);
    if (status.state === 'valid') expect(status.fingerprintMismatch).toBe(true);
  });

  it('does not flag a matching fingerprint', () => {
    const status = verifyLicense(token({ fingerprint: 'host-a' }), {
      publicKeyPem,
      nowMs: NOW,
      fingerprint: 'host-a',
    });
    if (status.state === 'valid') expect(status.fingerprintMismatch).toBe(false);
  });

  it('does not flag an unbound licence', () => {
    const status = verifyLicense(token(), { publicKeyPem, nowMs: NOW, fingerprint: 'host-a' });
    if (status.state === 'valid') expect(status.fingerprintMismatch).toBe(false);
  });
});
