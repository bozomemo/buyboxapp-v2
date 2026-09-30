// @vitest-environment node
/**
 * The password step against a real (SQLite) database: R-AUTH-4's lockout, one failure shape for
 * every kind of failure, and the rehash on weaker stored parameters (doc 18 §3.2–§3.3).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authRepo, createDb, newId, runMigrations, type AppDatabase } from '@buybox/db';
import { hashPassword } from '@buybox/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resolveSession, createSession } from './session';
import { attemptPasswordLogin } from './login';

const PASSWORD = 'mavi-kapı-yedi-kez';
const FAST = { log2N: 10, r: 8, p: 1 };
const NOW = Date.UTC(2026, 8, 27, 9, 0, 0);
const MINUTE = 60_000;

let dir: string;
let appDb: AppDatabase;
let fastHash: string;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-login-'));
  appDb = createDb(`file:${path.join(dir, 'test.db')}`, 'sqlite');
  await runMigrations(appDb);
  fastHash = await hashPassword(PASSWORD, { params: FAST });
}, 30_000);

afterAll(() => {
  appDb.close();
  rmSync(dir, { recursive: true, force: true });
});

let userId: string;
let username: string;

beforeEach(async () => {
  userId = newId();
  username = `u${userId.replace(/-/g, '').slice(-12)}`;
  await authRepo.insertUser(appDb, {
    id: userId,
    username,
    displayName: 'Ayşe',
    role: 'price_manager',
    state: 'active',
    passwordHash: fastHash,
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

const meta = { ip: undefined, userAgent: 'test' };
const login = (password: string, at: number, name = username) =>
  attemptPasswordLogin(appDb, { username: name, password }, meta, at);

describe('attemptPasswordLogin', () => {
  it('signs in with the right password, and rehashes weaker stored parameters', async () => {
    expect(await login(PASSWORD, NOW)).toEqual({ kind: 'ok', userId, mustChangePassword: false });
    const user = await authRepo.getUserById(appDb, userId);
    expect(user?.passwordHash.startsWith('scrypt$15$')).toBe(true);
    expect(user?.lastLoginAt).toBe(NOW);
  });

  it('accepts the username in any case and with spaces around it', async () => {
    expect((await login(PASSWORD, NOW, `  ${username.toUpperCase()} `)).kind).toBe('ok');
  });

  it('fails the same way for an unknown user and a wrong password', async () => {
    expect(await login(PASSWORD, NOW, 'nobody-here')).toEqual({ kind: 'failed' });
    expect(await login('wrong-password-1', NOW)).toEqual({ kind: 'failed' });
  });

  it('locks the username on the fifth wrong password, even against the right one', async () => {
    for (let i = 0; i < 4; i++) expect((await login(`wrong-${i}-password`, NOW + i)).kind).toBe('failed');
    expect((await authRepo.getUserById(appDb, userId))?.lockedUntil).toBeNull();
    expect((await login('wrong-4-password', NOW + 4)).kind).toBe('failed');
    expect((await authRepo.getUserById(appDb, userId))?.lockedUntil).toBe(NOW + 4 + 15 * MINUTE);

    expect((await login(PASSWORD, NOW + 5)).kind).toBe('failed');
    // After the lock expires, the right password works and clears it.
    expect((await login(PASSWORD, NOW + 16 * MINUTE)).kind).toBe('ok');
    expect((await authRepo.getUserById(appDb, userId))?.lockedUntil).toBeNull();

    const events = await authRepo.listAuthEvents(appDb, { userId });
    expect(events.map((e) => e.event)).toContain('login.locked');
    expect(events.some((e) => (e.detail ?? '').includes(PASSWORD))).toBe(false);
  });

  it('a success resets the count', async () => {
    for (let i = 0; i < 4; i++) await login(`wrong-${i}-password`, NOW + i);
    expect((await login(PASSWORD, NOW + 10)).kind).toBe('ok');
    for (let i = 0; i < 4; i++) await login(`wrong-${i}-password`, NOW + 20 + i);
    expect((await authRepo.getUserById(appDb, userId))?.lockedUntil).toBeNull();
  });

  it('refuses a disabled user with the right password', async () => {
    await authRepo.updateUser(appDb, userId, { state: 'disabled' }, { nowMs: NOW, actor: 'cli' });
    expect((await login(PASSWORD, NOW)).kind).toBe('failed');
    const [event] = await authRepo.listAuthEvents(appDb, { userId, event: 'login.failed' });
    expect(JSON.parse(event?.detail ?? '{}')).toMatchObject({ reason: 'disabled' });
  });

  it('reports a temporary password so the client can send the user to change it', async () => {
    await authRepo.updateUser(appDb, userId, { mustChangePassword: true }, { nowMs: NOW, actor: 'cli' });
    expect(await login(PASSWORD, NOW)).toEqual({ kind: 'ok', userId, mustChangePassword: true });
  });
});

describe('sessions', () => {
  it('a session resolves until the user is disabled, then is deleted on sight', async () => {
    const { token } = await createSession(appDb, userId, meta, NOW);
    expect((await resolveSession(appDb, token, NOW + MINUTE))?.user.id).toBe(userId);
    await authRepo.updateUser(appDb, userId, { state: 'disabled' }, { nowMs: NOW, actor: 'cli' });
    expect(await resolveSession(appDb, token, NOW + 2 * MINUTE)).toBeNull();
    expect(await authRepo.listSessionsForUser(appDb, userId)).toHaveLength(0);
  });

  it('an idle session expires', async () => {
    const { token } = await createSession(appDb, userId, meta, NOW);
    expect(await resolveSession(appDb, token, NOW + 8 * 60 * MINUTE)).toBeNull();
  });

  it('an unknown or empty token is no session', async () => {
    expect(await resolveSession(appDb, 'not-a-token', NOW)).toBeNull();
    expect(await resolveSession(appDb, undefined, NOW)).toBeNull();
  });
});
