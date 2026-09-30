// @vitest-environment node
/**
 * doc 18 §5.3 against a real SQLite file, with a stand-in sender that records what a phone would
 * receive: enrolment, sign-in by SMS, one code at a time, the caps, and the rule that SMS is
 * offered only while a provider exists (R-AUTH-8, R-AUTH-9).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SmsSender } from '@buybox/adapters';
import { authRepo, createDb, newId, runMigrations, type AppDatabase } from '@buybox/db';
import { FileSecretStore, ok } from '@buybox/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { availableMethods, startChallenge, verifyChallenge } from './mfa';
import { SmsError, confirmPhoneEnrolment, isSmsAvailable, sendLoginCode, startOfIstanbulDay, startPhoneEnrolment } from './sms';

const NOW = Date.UTC(2026, 8, 27, 9, 0, 0);
const MINUTE = 60_000;
const meta = { ip: undefined, userAgent: 'test' };

class RecordingSender implements SmsSender {
  readonly name = 'recording';
  readonly available = true;
  readonly sent: { to: string; text: string }[] = [];
  async send(to: string, text: string) {
    this.sent.push({ to, text });
    return ok({ providerRef: `ref-${this.sent.length}` });
  }
  lastCode(): string {
    return /(\d{6})/.exec(this.sent.at(-1)!.text)![1]!;
  }
}

let dir: string;
let appDb: AppDatabase;
let store: FileSecretStore;
let sender: RecordingSender;
let userId: string;
const savedEnv = { ...process.env };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-sms-'));
  appDb = createDb(`file:${path.join(dir, 'test.db')}`, 'sqlite');
  await runMigrations(appDb);
  store = new FileSecretStore(path.join(dir, 'secrets.enc.json'), 'test-key');
  process.env.SECRET_STORE_KEY = 'test-key';
}, 30_000);

afterAll(() => {
  appDb.close();
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...savedEnv };
});

beforeEach(async () => {
  sender = new RecordingSender();
  globalThis.__buyboxSmsSender = sender;
  userId = newId();
  await authRepo.insertUser(appDb, {
    id: userId,
    username: `u${userId.replace(/-/g, '').slice(-12)}`,
    displayName: 'Ayşe',
    role: 'viewer',
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
  globalThis.__buyboxSmsSender = undefined;
  process.env.SECRET_STORE_KEY = 'test-key';
});

async function user() {
  return (await authRepo.getUserById(appDb, userId))!;
}

/** A unique mobile number per test, so the per-number daily cap of one test never reaches another. */
function phone(): string {
  return `053${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
}

async function enrol(at = NOW): Promise<void> {
  await startPhoneEnrolment(appDb, sender, userId, phone(), meta, at);
  await confirmPhoneEnrolment(appDb, userId, sender.lastCode(), meta, at + MINUTE);
}

describe('availability (R-AUTH-8)', () => {
  it('no provider → SMS is not available and not a sign-in method even for a user who had it', async () => {
    await enrol();
    globalThis.__buyboxSmsSender = undefined;
    delete process.env.SMS_PROVIDER;
    expect(isSmsAvailable()).toBe(false);
    expect(await availableMethods(appDb, await user())).toEqual([]);
  });
});

describe('enrolment', () => {
  it('stores the number unverified, turns SMS on only when the code comes back', async () => {
    const { phone: stored } = await startPhoneEnrolment(appDb, sender, userId, '0532 111 22 33', meta, NOW);
    expect(stored).toBe('+905321112233');
    expect(sender.sent[0]).toMatchObject({ to: '+905321112233' });
    expect(sender.sent[0]!.text).toMatch(/^BuyBox doğrulama kodunuz: \d{6}\. 5 dakika geçerlidir\./);
    expect(await user()).toMatchObject({ phoneE164: '+905321112233', phoneVerifiedAt: null, smsEnabled: false });

    await expect(confirmPhoneEnrolment(appDb, userId, '000000', meta, NOW + MINUTE)).rejects.toBeInstanceOf(SmsError);
    const { firstMethod } = await confirmPhoneEnrolment(appDb, userId, sender.lastCode(), meta, NOW + MINUTE);
    expect(firstMethod).toBe(true);
    expect(await user()).toMatchObject({ smsEnabled: true, phoneVerifiedAt: NOW + MINUTE });
  });

  it('refuses a number that is not a mobile, and sends nothing', async () => {
    await expect(startPhoneEnrolment(appDb, sender, userId, '0212 123 45 67', meta, NOW)).rejects.toThrow(/geçersiz/);
    expect(sender.sent).toHaveLength(0);
  });

  it('a code stops working after five wrong tries', async () => {
    await startPhoneEnrolment(appDb, sender, userId, phone(), meta, NOW);
    const right = sender.lastCode();
    for (let i = 0; i < 5; i++) await expect(confirmPhoneEnrolment(appDb, userId, '000000', meta, NOW)).rejects.toThrow();
    await expect(confirmPhoneEnrolment(appDb, userId, right, meta, NOW)).rejects.toThrow();
  });
});

describe('sign-in by SMS', () => {
  it('sends a code for the challenge and signs in with it, once', async () => {
    await enrol();
    const at = NOW + 10 * MINUTE;
    expect(await availableMethods(appDb, await user())).toEqual(['sms']);
    const token = await startChallenge(appDb, userId, at);
    const challenge = (await authRepo.findOpenMfaChallenge(appDb, (await import('@buybox/shared')).hashToken(token), at))!;
    await sendLoginCode(appDb, sender, await user(), challenge.id, meta, at);
    const code = sender.lastCode();
    expect(await verifyChallenge(appDb, store, token, { method: 'sms', code }, meta, at)).toMatchObject({ kind: 'ok', method: 'sms' });
    // The same code on a new challenge: the code was bound to the first one, and is spent.
    const again = await startChallenge(appDb, userId, at);
    expect((await verifyChallenge(appDb, store, again, { method: 'sms', code }, meta, at)).kind).toBe('failed');
  });

  it('a resend within a minute is refused; after it, the new code replaces the old', async () => {
    await enrol();
    const at = NOW + 10 * MINUTE;
    const token = await startChallenge(appDb, userId, at);
    const { hashToken } = await import('@buybox/shared');
    const challenge = (await authRepo.findOpenMfaChallenge(appDb, hashToken(token), at))!;
    await sendLoginCode(appDb, sender, await user(), challenge.id, meta, at);
    const first = sender.lastCode();
    await expect(sendLoginCode(appDb, sender, await user(), challenge.id, meta, at + 30_000)).rejects.toThrow(/bir dakika/);
    await sendLoginCode(appDb, sender, await user(), challenge.id, meta, at + 61_000);
    const second = sender.lastCode();
    if (first !== second) {
      expect((await verifyChallenge(appDb, store, token, { method: 'sms', code: first }, meta, at + 62_000)).kind).toBe('failed');
    }
    expect((await verifyChallenge(appDb, store, token, { method: 'sms', code: second }, meta, at + 62_000)).kind).toBe('ok');
  });
});

describe('caps (R-AUTH-9)', () => {
  it('five per user per hour, then refused', async () => {
    await enrol(NOW - 2 * 60 * MINUTE);
    const at = NOW;
    const { hashToken } = await import('@buybox/shared');
    for (let i = 0; i < 5; i++) {
      const t = at + i * 61_000;
      const token = await startChallenge(appDb, userId, t);
      const challenge = (await authRepo.findOpenMfaChallenge(appDb, hashToken(token), t))!;
      await sendLoginCode(appDb, sender, await user(), challenge.id, meta, t);
    }
    const t = at + 6 * 61_000;
    const token = await startChallenge(appDb, userId, t);
    const challenge = (await authRepo.findOpenMfaChallenge(appDb, hashToken(token), t))!;
    await expect(sendLoginCode(appDb, sender, await user(), challenge.id, meta, t)).rejects.toThrow(/saat/);
  });

  it('the install-wide daily cap refuses everyone and is logged', async () => {
    process.env.AUTH_SMS_DAILY_CAP = String(
      (await authRepo.countSmsSent(appDb, {}, startOfIstanbulDay(NOW))) + 1,
    );
    try {
      await startPhoneEnrolment(appDb, sender, userId, phone(), meta, NOW);
      await expect(startPhoneEnrolment(appDb, sender, userId, phone(), meta, NOW + 2 * MINUTE)).rejects.toThrow(/günlük SMS sınırına/);
      expect((await authRepo.listAuthEvents(appDb, { userId, event: 'sms.capped' })).length).toBe(1);
    } finally {
      delete process.env.AUTH_SMS_DAILY_CAP;
    }
  });

  it('the day turns at midnight Istanbul, not UTC', () => {
    const istanbulMidnight = Date.UTC(2026, 8, 26, 21, 0, 0); // 27 Sep 00:00 +03:00
    expect(startOfIstanbulDay(istanbulMidnight + 1)).toBe(istanbulMidnight);
    expect(startOfIstanbulDay(istanbulMidnight - 1)).toBe(istanbulMidnight - 24 * 60 * MINUTE);
  });
});

describe('the stored code', () => {
  it('is not the code: only an HMAC keyed outside the database is kept', async () => {
    await startPhoneEnrolment(appDb, sender, userId, phone(), meta, NOW);
    const code = sender.lastCode();
    const row = (await authRepo.findLiveSmsCode(appDb, userId, 'enrol', NOW))!;
    expect(row.codeHmac).not.toContain(code);
    expect(row.codeHmac).toMatch(/^[0-9a-f]{64}$/);
    // With a different server key the stored MAC no longer matches the right code.
    process.env.SECRET_STORE_KEY = 'a-different-key';
    await expect(confirmPhoneEnrolment(appDb, userId, code, meta, NOW)).rejects.toThrow();
  });
});
