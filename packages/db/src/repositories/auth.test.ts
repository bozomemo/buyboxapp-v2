/**
 * Auth storage (doc 05 §7a, doc 18) on all three dialects.
 *
 * The rules are tested without a database in `packages/shared/src/auth/`. What is tested here is
 * what only a database can get wrong: the conditional updates that make a TOTP step, a challenge
 * and a recovery code good exactly once; the lockout count resetting after a success; the
 * "resend replaces" rule; and scoping every delete to its user.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { pruneHistory, DEFAULT_RETENTION_WINDOWS } from '../prune-history.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as authRepo from './auth.js';

const NOW = Date.UTC(2026, 8, 27, 9, 0, 0);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function userRow(overrides: Partial<authRepo.UserRow> = {}): authRepo.UserRow {
  return {
    id: newId(),
    username: 'ayse',
    displayName: 'Ayşe Yılmaz',
    role: 'admin',
    state: 'active',
    passwordHash: 'scrypt$15$8$1$c2FsdA==$aGFzaA==',
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
    ...overrides,
  };
}

async function addUser(appDb: AppDatabase, overrides: Partial<authRepo.UserRow> = {}): Promise<authRepo.UserRow> {
  const row = userRow(overrides);
  await authRepo.insertUser(appDb, row);
  return row;
}

function sessionRow(userId: string, overrides: Partial<authRepo.SessionRow> = {}): authRepo.SessionRow {
  return {
    id: newId(),
    tokenHash: newId(),
    userId,
    createdAt: NOW,
    lastSeenAt: NOW,
    expiresAt: NOW + 7 * DAY,
    ip: '203.0.113.9',
    userAgent: 'Firefox',
    ...overrides,
  };
}

for (const dialect of ALL_DIALECTS) {
  // 30 s per test, as in the other repository suites: a fresh MySQL database migrates slowly.
  describe(`auth storage (${dialect})`, { timeout: 30_000 }, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('bootstrap mode: no active admin until one exists, and a disabled admin does not count', async () => {
      db = await createTestDb(dialect);
      expect(await authRepo.hasActiveAdmin(db.appDb)).toBe(false);
      await addUser(db.appDb, { username: 'eski', state: 'disabled' });
      await addUser(db.appDb, { username: 'izleyici', role: 'viewer' });
      expect(await authRepo.hasActiveAdmin(db.appDb)).toBe(false);
      await addUser(db.appDb, { username: 'yonetici' });
      expect(await authRepo.hasActiveAdmin(db.appDb)).toBe(true);
    });

    it('refuses a second user with the same username', async () => {
      db = await createTestDb(dialect);
      await addUser(db.appDb, { username: 'ayse' });
      await expect(addUser(db.appDb, { username: 'ayse' })).rejects.toBeInstanceOf(authRepo.UsernameTakenError);
    });

    it('refuses an unknown role or state', async () => {
      db = await createTestDb(dialect);
      await expect(addUser(db.appDb, { role: 'root' as never })).rejects.toThrow(/role/);
      const user = await addUser(db.appDb);
      await expect(
        authRepo.updateUser(db.appDb, user.id, { state: 'deleted' as never }, { nowMs: NOW, actor: 'cli' }),
      ).rejects.toThrow(/state/);
    });

    it('updates a user and records who did it', async () => {
      db = await createTestDb(dialect);
      const user = await addUser(db.appDb);
      await authRepo.updateUser(db.appDb, user.id, { role: 'price_manager', lockedUntil: NOW + MINUTE }, { nowMs: NOW + 1, actor: 'user:x' });
      const read = await authRepo.getUserById(db.appDb, user.id);
      expect(read).toMatchObject({ role: 'price_manager', lockedUntil: NOW + MINUTE, updatedAt: NOW + 1, updatedBy: 'user:x' });
      expect(read?.mustChangePassword).toBe(false);
    });

    it('TOTP step advances once: a replayed or older step loses', async () => {
      db = await createTestDb(dialect);
      const user = await addUser(db.appDb);
      expect(await authRepo.advanceTotpStep(db.appDb, user.id, 100)).toBe(true);
      expect(await authRepo.advanceTotpStep(db.appDb, user.id, 100)).toBe(false);
      expect(await authRepo.advanceTotpStep(db.appDb, user.id, 99)).toBe(false);
      expect(await authRepo.advanceTotpStep(db.appDb, user.id, 101)).toBe(true);
      expect((await authRepo.getUserById(db.appDb, user.id))?.totpLastStep).toBe(101);
    });

    it('reads a session together with its user, and revokes all but one', async () => {
      db = await createTestDb(dialect);
      const user = await addUser(db.appDb);
      const keep = sessionRow(user.id);
      const other = sessionRow(user.id);
      await authRepo.insertSession(db.appDb, keep);
      await authRepo.insertSession(db.appDb, other);

      const found = await authRepo.getSessionWithUser(db.appDb, keep.tokenHash);
      expect(found?.session.id).toBe(keep.id);
      expect(found?.user.username).toBe('ayse');
      expect(await authRepo.getSessionWithUser(db.appDb, 'no-such-hash')).toBeUndefined();

      await authRepo.touchSession(db.appDb, keep.id, NOW + MINUTE);
      expect((await authRepo.getSessionWithUser(db.appDb, keep.tokenHash))?.session.lastSeenAt).toBe(NOW + MINUTE);

      await authRepo.deleteSessionsForUser(db.appDb, user.id, { exceptSessionId: keep.id });
      expect((await authRepo.listSessionsForUser(db.appDb, user.id)).map((s) => s.id)).toEqual([keep.id]);
    });

    it("cannot end another user's session or device", async () => {
      db = await createTestDb(dialect);
      const ayse = await addUser(db.appDb, { username: 'ayse' });
      const mehmet = await addUser(db.appDb, { username: 'mehmet' });
      const session = sessionRow(mehmet.id);
      await authRepo.insertSession(db.appDb, session);
      const device: authRepo.TrustedDeviceRow = {
        id: newId(), tokenHash: newId(), userId: mehmet.id, createdAt: NOW, expiresAt: NOW + 30 * DAY, lastUsedAt: null, label: 'Chrome',
      };
      await authRepo.insertTrustedDevice(db.appDb, device);

      await authRepo.deleteSession(db.appDb, session.id, ayse.id);
      await authRepo.deleteTrustedDevices(db.appDb, ayse.id, device.id);
      expect(await authRepo.listSessionsForUser(db.appDb, mehmet.id)).toHaveLength(1);
      expect(await authRepo.listTrustedDevices(db.appDb, mehmet.id)).toHaveLength(1);
    });

    it('a trusted device counts only for its own user and only until it expires', async () => {
      db = await createTestDb(dialect);
      const ayse = await addUser(db.appDb, { username: 'ayse' });
      const mehmet = await addUser(db.appDb, { username: 'mehmet' });
      const device: authRepo.TrustedDeviceRow = {
        id: newId(), tokenHash: 'device-hash', userId: ayse.id, createdAt: NOW, expiresAt: NOW + DAY, lastUsedAt: null, label: null,
      };
      await authRepo.insertTrustedDevice(db.appDb, device);
      expect(await authRepo.findTrustedDevice(db.appDb, ayse.id, 'device-hash', NOW)).toBeDefined();
      expect(await authRepo.findTrustedDevice(db.appDb, mehmet.id, 'device-hash', NOW)).toBeUndefined();
      expect(await authRepo.findTrustedDevice(db.appDb, ayse.id, 'device-hash', NOW + DAY + 1)).toBeUndefined();
    });

    it('a challenge is found only while open, and is consumed exactly once', async () => {
      db = await createTestDb(dialect);
      const user = await addUser(db.appDb);
      const challenge: authRepo.MfaChallengeRow = {
        id: newId(), tokenHash: 'challenge-hash', userId: user.id, createdAt: NOW, expiresAt: NOW + 5 * MINUTE, attempts: 0, consumedAt: null,
      };
      await authRepo.insertMfaChallenge(db.appDb, challenge);
      await authRepo.incrementMfaChallengeAttempts(db.appDb, challenge.id);
      expect((await authRepo.findOpenMfaChallenge(db.appDb, 'challenge-hash', NOW))?.attempts).toBe(1);
      expect(await authRepo.findOpenMfaChallenge(db.appDb, 'challenge-hash', NOW + 5 * MINUTE + 1)).toBeUndefined();

      expect(await authRepo.consumeMfaChallenge(db.appDb, challenge.id, NOW)).toBe(true);
      expect(await authRepo.consumeMfaChallenge(db.appDb, challenge.id, NOW)).toBe(false);
      expect(await authRepo.findOpenMfaChallenge(db.appDb, 'challenge-hash', NOW)).toBeUndefined();
    });

    it('an SMS resend replaces the live code, and the caps count every send', async () => {
      db = await createTestDb(dialect);
      const user = await addUser(db.appDb, { phoneE164: '+905321234567' });
      const code = (sentAt: number): authRepo.SmsCodeRow => ({
        id: newId(), purpose: 'login', challengeId: null, userId: user.id, phoneE164: '+905321234567',
        codeHmac: newId(), sentAt, expiresAt: sentAt + 5 * MINUTE, attempts: 0, providerRef: null, state: 'sent',
      });
      const first = code(NOW);
      const second = code(NOW + MINUTE);
      await authRepo.insertSmsCode(db.appDb, first);
      await authRepo.insertSmsCode(db.appDb, second);

      expect((await authRepo.findLiveSmsCode(db.appDb, user.id, 'login', NOW + MINUTE))?.id).toBe(second.id);
      expect(await authRepo.countSmsSent(db.appDb, { userId: user.id }, NOW - 1)).toBe(2);
      expect(await authRepo.countSmsSent(db.appDb, { phoneE164: '+905321234567' }, NOW + 1)).toBe(1);
      expect(await authRepo.countSmsSent(db.appDb, {}, NOW - 1)).toBe(2);

      await authRepo.updateSmsCode(db.appDb, second.id, { state: 'used' });
      expect(await authRepo.findLiveSmsCode(db.appDb, user.id, 'login', NOW + MINUTE)).toBeUndefined();
    });

    it('a recovery code is good once, and regenerating drops the old set', async () => {
      db = await createTestDb(dialect);
      const user = await addUser(db.appDb);
      const set = (hashes: string[]) =>
        hashes.map((codeHash) => ({ id: newId(), userId: user.id, codeHash, createdAt: NOW, usedAt: null }));
      await authRepo.replaceRecoveryCodes(db.appDb, user.id, set(['a', 'b', 'c']));
      expect(await authRepo.useRecoveryCode(db.appDb, user.id, 'b', NOW)).toBe(true);
      expect(await authRepo.useRecoveryCode(db.appDb, user.id, 'b', NOW)).toBe(false);
      expect(await authRepo.countUnusedRecoveryCodes(db.appDb, user.id)).toBe(2);

      await authRepo.replaceRecoveryCodes(db.appDb, user.id, set(['x', 'y']));
      expect(await authRepo.useRecoveryCode(db.appDb, user.id, 'a', NOW)).toBe(false);
      expect(await authRepo.countUnusedRecoveryCodes(db.appDb, user.id)).toBe(2);
    });

    it('counts failures in the window and after the last success only', async () => {
      db = await createTestDb(dialect);
      const attempt = (at: number, succeeded: boolean, username = 'ayse', ip: string | null = '203.0.113.9') =>
        authRepo.recordLoginAttempt(db!.appDb, { id: newId(), at, username, ip, succeeded });

      await attempt(NOW - 20 * MINUTE, false); // outside the 15-minute window
      await attempt(NOW - 10 * MINUTE, false);
      await attempt(NOW - 9 * MINUTE, true); // resets
      await attempt(NOW - 8 * MINUTE, false);
      await attempt(NOW - 7 * MINUTE, false);
      await attempt(NOW - 6 * MINUTE, false, 'mehmet');

      const windowStart = NOW - 15 * MINUTE;
      expect(await authRepo.countRecentFailures(db.appDb, { username: 'ayse' }, windowStart)).toBe(2);
      expect(await authRepo.countRecentFailures(db.appDb, { username: 'mehmet' }, windowStart)).toBe(1);
      expect(await authRepo.countRecentFailures(db.appDb, { ip: '203.0.113.9' }, windowStart)).toBe(3);

      // Unlocking forgets them; another user's are untouched.
      await authRepo.clearLoginFailures(db.appDb, 'ayse');
      expect(await authRepo.countRecentFailures(db.appDb, { username: 'ayse' }, windowStart)).toBe(0);
      expect(await authRepo.countRecentFailures(db.appDb, { username: 'mehmet' }, windowStart)).toBe(1);

      // What was typed may be long; it is stored truncated and still counted.
      const long = 'x'.repeat(300);
      await attempt(NOW, false, long);
      expect(await authRepo.countRecentFailures(db.appDb, { username: long }, windowStart)).toBe(1);
    });

    it('lists the sign-in log newest first, filtered', async () => {
      db = await createTestDb(dialect);
      const event = (at: number, name: authRepo.AuthEventName, userId: string | null) =>
        authRepo.recordAuthEvent(db!.appDb, { id: newId(), at, event: name, userId, actor: 'anonymous', ip: null, userAgent: null, detail: null });
      await event(NOW - 3, 'login.failed', null);
      await event(NOW - 2, 'login.succeeded', 'u1');
      await event(NOW - 1, 'logout', 'u1');

      expect((await authRepo.listAuthEvents(db.appDb)).map((e) => e.event)).toEqual(['logout', 'login.succeeded', 'login.failed']);
      expect((await authRepo.listAuthEvents(db.appDb, { userId: 'u1', event: 'logout' })).map((e) => e.at)).toEqual([NOW - 1]);
      expect(await authRepo.listAuthEvents(db.appDb, { fromMs: NOW - 2, toMs: NOW - 1 })).toHaveLength(1);
    });

    it('prunes expired working state and keeps a year of the sign-in log', async () => {
      db = await createTestDb(dialect);
      const user = await addUser(db.appDb);
      await authRepo.insertSession(db.appDb, sessionRow(user.id, { expiresAt: NOW - 1 }));
      const live = sessionRow(user.id);
      await authRepo.insertSession(db.appDb, live);
      await authRepo.recordLoginAttempt(db.appDb, { id: newId(), at: NOW - 2 * DAY, username: 'ayse', ip: null, succeeded: false });
      const logRow = (at: number) =>
        authRepo.recordAuthEvent(db!.appDb, { id: newId(), at, event: 'login.succeeded', userId: user.id, actor: 'anonymous', ip: null, userAgent: null, detail: null });
      await logRow(NOW - 366 * DAY);
      await logRow(NOW - 364 * DAY);

      await pruneHistory(db.appDb, DEFAULT_RETENTION_WINDOWS, NOW);

      expect((await authRepo.listSessionsForUser(db.appDb, user.id)).map((s) => s.id)).toEqual([live.id]);
      expect(await authRepo.countRecentFailures(db.appDb, { username: 'ayse' }, 0)).toBe(0);
      expect(await authRepo.listAuthEvents(db.appDb)).toHaveLength(1);
    });
  });
}
