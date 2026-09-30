// @vitest-environment node
/**
 * doc 18 §5 against a real SQLite file and a real secret store: enrolment, the challenge, codes
 * good once, wrong codes counting toward the lockout, recovery codes, trusted devices, and the
 * rule that a required second factor cannot be removed.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authRepo, configRepo, createDb, newId, runMigrations, type AppDatabase } from '@buybox/db';
import {
  AUTH_MFA_REQUIRED_SETTING_KEY,
  FileSecretStore,
  base32Decode,
  totpCode,
  totpPendingSecretKey,
  totpSecretKey,
} from '@buybox/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MfaError,
  availableMethods,
  confirmTotpEnrolment,
  isMfaRequired,
  isTrustedDevice,
  removeTotp,
  startChallenge,
  startTotpEnrolment,
  trustDevice,
  verifyChallenge,
} from './mfa';

const NOW = Date.UTC(2026, 8, 27, 9, 0, 0);
const MINUTE = 60_000;
const meta = { ip: undefined, userAgent: 'test' };

let dir: string;
let appDb: AppDatabase;
let store: FileSecretStore;
let userId: string;
const savedEnv = { ...process.env };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-mfa-'));
  appDb = createDb(`file:${path.join(dir, 'test.db')}`, 'sqlite');
  await runMigrations(appDb);
  store = new FileSecretStore(path.join(dir, 'secrets.enc.json'), 'test-key');
}, 30_000);

afterAll(() => {
  appDb.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  userId = newId();
  await authRepo.insertUser(appDb, {
    id: userId,
    username: `u${userId.replace(/-/g, '').slice(-12)}`,
    displayName: 'Ayşe',
    role: 'price_manager',
    state: 'active',
    passwordHash: 'scrypt$15$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA',
    mustChangePassword: false,
    passwordChangedAt: NOW,
    totpEnabled: false,
    totpLastStep: null,
    totpPendingSince: null,
    phoneE164: null,
    phoneVerifiedAt: null,
    smsEnabled: false,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'cli',
    updatedBy: 'cli',
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
  globalThis.__buyboxMfaRequired = undefined;
});

async function user() {
  return (await authRepo.getUserById(appDb, userId))!;
}

/** Enrols TOTP at `NOW` and returns the secret the app would hold. */
async function enrol(): Promise<{ secret: Buffer; codes: string[] | null }> {
  const u = await user();
  await startTotpEnrolment(appDb, store, u, 'BuyBox', NOW);
  const secret = base32Decode((await store.get(totpPendingSecretKey(userId)))!)!;
  const { recoveryCodes } = await confirmTotpEnrolment(appDb, store, userId, totpCode(secret, NOW), meta, NOW);
  return { secret, codes: recoveryCodes };
}

describe('TOTP enrolment (doc 18 §5.2)', () => {
  it('turns on only after a code, moves the secret out of pending, and issues ten recovery codes', async () => {
    const { codes } = await enrol();
    const u = await user();
    expect(u).toMatchObject({ totpEnabled: true, totpPendingSince: null });
    expect(await store.get(totpPendingSecretKey(userId))).toBeUndefined();
    expect(await store.get(totpSecretKey(userId))).toBeDefined();
    expect(codes).toHaveLength(10);
    expect(await availableMethods(appDb, u)).toEqual(['totp', 'recovery']);
  });

  it('refuses a wrong code and leaves TOTP off', async () => {
    await startTotpEnrolment(appDb, store, await user(), 'BuyBox', NOW);
    await expect(confirmTotpEnrolment(appDb, store, userId, '000000', meta, NOW)).rejects.toBeInstanceOf(MfaError);
    expect((await user()).totpEnabled).toBe(false);
  });

  it('refuses an enrolment older than 15 minutes', async () => {
    await startTotpEnrolment(appDb, store, await user(), 'BuyBox', NOW);
    const secret = base32Decode((await store.get(totpPendingSecretKey(userId)))!)!;
    const later = NOW + 16 * MINUTE;
    await expect(confirmTotpEnrolment(appDb, store, userId, totpCode(secret, later), meta, later)).rejects.toThrow(/süresi doldu/);
  });
});

describe('the challenge (doc 18 §5.1)', () => {
  it('a right code signs in once; the same code on a new challenge is refused (replay)', async () => {
    const { secret } = await enrol();
    const at = NOW + 2 * MINUTE;
    const code = totpCode(secret, at);

    const first = await verifyChallenge(appDb, store, await startChallenge(appDb, userId, at), { method: 'totp', code }, meta, at);
    expect(first).toMatchObject({ kind: 'ok', userId, method: 'totp' });

    const replay = await verifyChallenge(appDb, store, await startChallenge(appDb, userId, at), { method: 'totp', code }, meta, at);
    expect(replay.kind).toBe('failed');
  });

  it('a challenge is spent after it succeeds', async () => {
    const { secret } = await enrol();
    const at = NOW + 2 * MINUTE;
    const challenge = await startChallenge(appDb, userId, at);
    expect((await verifyChallenge(appDb, store, challenge, { method: 'totp', code: totpCode(secret, at) }, meta, at)).kind).toBe('ok');
    const later = at + 60_000;
    expect((await verifyChallenge(appDb, store, challenge, { method: 'totp', code: totpCode(secret, later) }, meta, later)).kind).toBe('expired');
  });

  it('wrong codes count toward the lockout: the fifth locks the user and ends the challenge', async () => {
    await enrol();
    const challenge = await startChallenge(appDb, userId, NOW + MINUTE);
    for (let i = 0; i < 4; i++) {
      expect((await verifyChallenge(appDb, store, challenge, { method: 'totp', code: '123456' }, meta, NOW + MINUTE)).kind).toBe('failed');
    }
    expect((await verifyChallenge(appDb, store, challenge, { method: 'totp', code: '123456' }, meta, NOW + MINUTE)).kind).toBe('expired');
    expect((await user()).lockedUntil).toBeGreaterThan(NOW);
  });

  it('a method the user does not have is a wrong code, not a way in', async () => {
    await enrol();
    const challenge = await startChallenge(appDb, userId, NOW + MINUTE);
    expect((await verifyChallenge(appDb, store, challenge, { method: 'sms', code: '123456' }, meta, NOW + MINUTE)).kind).toBe('failed');
  });

  it('a recovery code signs in once and reports how many are left', async () => {
    const { codes } = await enrol();
    const at = NOW + MINUTE;
    const ok = await verifyChallenge(appDb, store, await startChallenge(appDb, userId, at), { method: 'recovery', code: codes![0]!.toLowerCase() }, meta, at);
    expect(ok).toMatchObject({ kind: 'ok', method: 'recovery', recoveryLeft: 9 });
    const again = await verifyChallenge(appDb, store, await startChallenge(appDb, userId, at), { method: 'recovery', code: codes![0]! }, meta, at);
    expect(again.kind).toBe('failed');
  });

  it('an expired challenge is refused', async () => {
    const { secret } = await enrol();
    const challenge = await startChallenge(appDb, userId, NOW);
    const later = NOW + 6 * MINUTE;
    expect((await verifyChallenge(appDb, store, challenge, { method: 'totp', code: totpCode(secret, later) }, meta, later)).kind).toBe('expired');
  });
});

describe('trusted devices (doc 18 §5.1)', () => {
  it('a remembered device is recognised for its own user only, until it expires', async () => {
    const device = (await trustDevice(appDb, userId, meta, NOW))!;
    expect(await isTrustedDevice(appDb, userId, device.token, NOW + MINUTE)).toBe(true);
    expect(await isTrustedDevice(appDb, 'someone-else', device.token, NOW + MINUTE)).toBe(false);
    expect(await isTrustedDevice(appDb, userId, device.token, NOW + device.maxAgeMs + 1)).toBe(false);
  });

  it('AUTH_TRUSTED_DEVICE_DAYS=0 removes the option', async () => {
    process.env.AUTH_TRUSTED_DEVICE_DAYS = '0';
    expect(await trustDevice(appDb, userId, meta, NOW)).toBeNull();
  });
});

describe('policy (doc 18 §5.1, R-AUTH-5)', () => {
  it('optional on loopback unless the setting says so; always required on a network install', async () => {
    expect(await isMfaRequired(appDb)).toBe(false);
    await configRepo.setAppSetting(appDb, { key: AUTH_MFA_REQUIRED_SETTING_KEY, value: 'true', updatedBy: 'test', updatedAt: NOW }, newId());
    globalThis.__buyboxMfaRequired = undefined;
    expect(await isMfaRequired(appDb)).toBe(true);
    await configRepo.setAppSetting(appDb, { key: AUTH_MFA_REQUIRED_SETTING_KEY, value: 'false', updatedBy: 'test', updatedAt: NOW }, newId());
    globalThis.__buyboxMfaRequired = undefined;
    process.env.PUBLIC_ORIGIN = 'https://fiyat.example.com.tr';
    expect(await isMfaRequired(appDb)).toBe(true);
  });

  it('the last method cannot be removed where a second factor is required, and can where it is not', async () => {
    await enrol();
    process.env.PUBLIC_ORIGIN = 'https://fiyat.example.com.tr';
    await expect(removeTotp(appDb, store, userId, meta, NOW)).rejects.toThrow(/zorunlu/);
    expect((await user()).totpEnabled).toBe(true);

    delete process.env.PUBLIC_ORIGIN;
    await removeTotp(appDb, store, userId, meta, NOW);
    expect((await user()).totpEnabled).toBe(false);
    expect(await store.get(totpSecretKey(userId))).toBeUndefined();
    expect(await authRepo.countUnusedRecoveryCodes(appDb, userId)).toBe(0);
  });
});
