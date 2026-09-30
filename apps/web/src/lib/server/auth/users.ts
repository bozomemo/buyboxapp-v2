/**
 * User management (doc 18 §3, §6.3, §8.2; doc 06 §10.4). Every action writes a sign-in log row
 * and goes through the last-administrator rule before it touches anything.
 */
import { authRepo, newId, type AppDatabase } from '@buybox/db';
import {
  PASSWORD_POLICY_MESSAGES,
  ROLE_LABELS,
  checkPasswordPolicy,
  checkUserChange,
  hashPassword,
  isRole,
  normalisePhone,
  normaliseUsername,
  totpPendingSecretKey,
  totpSecretKey,
  type ISecretStore,
  type Role,
  type UserState,
} from '@buybox/shared';
import { recordAuthEvent, type RequestMeta } from './config';
import type { AuthContext } from './guard';

export interface UserSummary {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: Role;
  readonly roleLabel: string;
  readonly state: UserState;
  readonly totpEnabled: boolean;
  readonly smsEnabled: boolean;
  readonly phoneVerified: boolean;
  readonly mustChangePassword: boolean;
  readonly lockedUntil: number | null;
  readonly lastLoginAt: number | null;
  readonly createdAt: number;
}

export async function listUserSummaries(appDb: AppDatabase, nowMs: number = Date.now()): Promise<UserSummary[]> {
  return (await authRepo.listUsers(appDb)).map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    roleLabel: ROLE_LABELS[u.role],
    state: u.state,
    totpEnabled: u.totpEnabled,
    smsEnabled: u.smsEnabled,
    phoneVerified: u.phoneVerifiedAt !== null,
    mustChangePassword: u.mustChangePassword,
    lockedUntil: u.lockedUntil !== null && u.lockedUntil > nowMs ? u.lockedUntil : null,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  }));
}

/** A refusal a form can show: the Turkish sentence and the field it is about, if any. */
export class UserActionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = 'UserActionError';
  }
}

function checkTemporaryPassword(password: unknown, username: string): string {
  if (typeof password !== 'string') throw new UserActionError('Geçici parola gerekli.');
  const violation = checkPasswordPolicy(password, username);
  if (violation !== null) throw new UserActionError(PASSWORD_POLICY_MESSAGES[violation]);
  return password;
}

export interface CreateUserInput {
  readonly username: unknown;
  readonly displayName: unknown;
  readonly role: unknown;
  readonly temporaryPassword: unknown;
  readonly phone?: unknown;
}

/**
 * doc 06 §10.4 _Yeni kullanıcı_. The password is temporary by definition: the user replaces it
 * at their first sign-in (doc 18 §3.2), so the administrator never knows a password in use. A
 * phone number may be given but is never marked verified — the user verifies it themselves.
 */
export async function createUser(
  appDb: AppDatabase,
  input: CreateUserInput,
  auth: AuthContext,
  meta: RequestMeta,
): Promise<UserSummary> {
  const username = typeof input.username === 'string' ? normaliseUsername(input.username) : undefined;
  if (username === undefined) {
    throw new UserActionError('Kullanıcı adı 3-32 karakter olmalı ve yalnızca küçük harf (a-z, Türkçe harf olmadan), rakam, nokta (.), alt çizgi (_) ve tire (-) içerebilir.');
  }
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  if (displayName === '' || displayName.length > 100) throw new UserActionError('Ad soyad gerekli (en fazla 100 karakter).');
  if (!isRole(input.role)) throw new UserActionError('Geçersiz rol.');
  const password = checkTemporaryPassword(input.temporaryPassword, username);
  let phone: string | null = null;
  if (typeof input.phone === 'string' && input.phone.trim() !== '') {
    phone = normalisePhone(input.phone) ?? null;
    if (phone === null) throw new UserActionError('Telefon numarası geçersiz. Örnek: 0532 123 45 67');
  }

  const nowMs = Date.now();
  const id = newId();
  try {
    await authRepo.insertUser(appDb, {
      id,
      username,
      displayName,
      role: input.role,
      state: 'active',
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      passwordChangedAt: nowMs,
      totpEnabled: false,
      totpLastStep: null,
      totpPendingSince: null,
      phoneE164: phone,
      phoneVerifiedAt: null,
      smsEnabled: false,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: nowMs,
      updatedAt: nowMs,
      createdBy: auth.actor,
      updatedBy: auth.actor,
    });
  } catch (error) {
    if (error instanceof authRepo.UsernameTakenError) throw new UserActionError(error.message, 409);
    throw error;
  }
  await recordAuthEvent(appDb, 'user.created', {
    userId: id,
    actor: auth.actor,
    meta,
    detail: { username, role: input.role },
  });
  const created = (await listUserSummaries(appDb, nowMs)).find((u) => u.id === id);
  return created!;
}

export type UserAction =
  | { readonly action: 'setRole'; readonly role: unknown }
  | { readonly action: 'disable' }
  | { readonly action: 'enable' }
  | { readonly action: 'resetPassword'; readonly temporaryPassword: unknown }
  | { readonly action: 'resetMfa' }
  | { readonly action: 'unlock' };

const REFUSALS = {
  'last-admin': 'Bu değişiklik kurulumu etkin bir Yönetici olmadan bırakır. Önce başka bir kullanıcıyı Yönetici yapın.',
  'self-disable': 'Kendi hesabınızı devre dışı bırakamazsınız; bunu başka bir Yönetici yapmalı.',
} as const;

/**
 * One administrative action on one user (doc 06 §10.4). Every path that ends someone's access
 * — disable, password reset, second-factor reset — revokes their sessions and trusted devices
 * in the same call, so the change takes effect on their very next request.
 */
export async function applyUserAction(
  appDb: AppDatabase,
  secretStore: ISecretStore | null,
  userId: string,
  body: UserAction,
  auth: AuthContext,
  meta: RequestMeta,
): Promise<void> {
  const user = await authRepo.getUserById(appDb, userId);
  if (user === undefined) throw new UserActionError('Kullanıcı bulunamadı.', 404);
  const nowMs = Date.now();
  const audit = { nowMs, actor: auth.actor };
  const actorUserId = auth.user?.id ?? null;
  const guard = async (change: { role?: Role; state?: UserState }) => {
    const refusal = checkUserChange(await authRepo.listUsers(appDb), { userId, ...change }, actorUserId);
    if (refusal !== null) throw new UserActionError(REFUSALS[refusal], 409);
  };
  const revokeAccess = async () => {
    await authRepo.deleteSessionsForUser(appDb, userId);
    await authRepo.deleteTrustedDevices(appDb, userId);
  };

  switch (body.action) {
    case 'setRole': {
      if (!isRole(body.role)) throw new UserActionError('Geçersiz rol.');
      if (body.role === user.role) return;
      await guard({ role: body.role });
      await authRepo.updateUser(appDb, userId, { role: body.role }, audit);
      await recordAuthEvent(appDb, 'user.role_changed', {
        userId,
        actor: auth.actor,
        meta,
        detail: { from: user.role, to: body.role },
      });
      return;
    }
    case 'disable': {
      if (user.state === 'disabled') return;
      await guard({ state: 'disabled' });
      // The phone number serves no audit purpose, so it goes with the access (doc 18 §10).
      await authRepo.updateUser(
        appDb,
        userId,
        { state: 'disabled', phoneE164: null, phoneVerifiedAt: null, smsEnabled: false },
        audit,
      );
      await revokeAccess();
      await recordAuthEvent(appDb, 'user.disabled', { userId, actor: auth.actor, meta });
      return;
    }
    case 'enable': {
      if (user.state === 'active') return;
      await authRepo.updateUser(appDb, userId, { state: 'active' }, audit);
      await recordAuthEvent(appDb, 'user.enabled', { userId, actor: auth.actor, meta });
      return;
    }
    case 'resetPassword': {
      const password = checkTemporaryPassword(body.temporaryPassword, user.username);
      await authRepo.updateUser(
        appDb,
        userId,
        {
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
          passwordChangedAt: nowMs,
          lockedUntil: null,
        },
        audit,
      );
      await authRepo.clearLoginFailures(appDb, user.username);
      await revokeAccess();
      await recordAuthEvent(appDb, 'password.reset', { userId, actor: auth.actor, meta });
      return;
    }
    case 'resetMfa': {
      await authRepo.updateUser(
        appDb,
        userId,
        { totpEnabled: false, totpLastStep: null, totpPendingSince: null, smsEnabled: false },
        audit,
      );
      await authRepo.deleteRecoveryCodes(appDb, userId);
      await revokeAccess();
      if (secretStore !== null) {
        await secretStore.delete(totpSecretKey(userId));
        await secretStore.delete(totpPendingSecretKey(userId));
      }
      await recordAuthEvent(appDb, 'mfa.removed', { userId, actor: auth.actor, meta, detail: { by: 'admin' } });
      return;
    }
    case 'unlock': {
      await authRepo.updateUser(appDb, userId, { lockedUntil: null }, audit);
      await authRepo.clearLoginFailures(appDb, user.username);
      await recordAuthEvent(appDb, 'user.unlocked', { userId, actor: auth.actor, meta });
      return;
    }
  }
}

/**
 * doc 18 §8.2 — a database switch to a target with no active Yönetici carries the acting
 * administrator (and the session they are using) into it, so the operator is not dropped into
 * bootstrap mode halfway through configuring. Nothing else about users is copied. The TOTP
 * secret needs no copying: the secret store is outside the database.
 *
 * Returns whether anything was copied.
 */
export async function carryAdministratorForward(
  source: AppDatabase,
  target: AppDatabase,
  auth: AuthContext,
): Promise<boolean> {
  if (auth.user === null || auth.sessionId === null || auth.user.role !== 'admin') return false;
  if (await authRepo.hasActiveAdmin(target)) return false;
  const user = await authRepo.getUserById(source, auth.user.id);
  if (user === undefined) return false;
  if ((await authRepo.getUserByUsername(target, user.username)) !== undefined) return false;

  await authRepo.insertUser(target, user);
  const session = (await authRepo.listSessionsForUser(source, user.id)).find((s) => s.id === auth.sessionId);
  if (session !== undefined) await authRepo.insertSession(target, session);
  return true;
}
