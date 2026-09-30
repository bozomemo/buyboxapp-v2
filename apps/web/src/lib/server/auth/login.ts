/**
 * The password step of signing in (doc 18 §3.2, §3.3).
 *
 * One outcome is visible to the caller for every kind of failure — unknown user, wrong
 * password, locked, disabled — and every one of them costs the same scrypt, so neither the
 * message nor the timing says which it was. The difference is kept in the sign-in log, where an
 * administrator can see it.
 *
 * The second factor (12.7) slots in after `verifyPassword` succeeds: a user with a method
 * enrolled gets a challenge instead of a session. Until 12.7 no user can have one enrolled.
 */
import { authRepo, newId, type AppDatabase } from '@buybox/db';
import {
  AUTH_IP_LOCKOUT_ATTEMPTS,
  AUTH_LOCKOUT_ATTEMPTS,
  AUTH_LOCKOUT_WINDOW_MS,
  AUTH_PASSWORD_MAX_LENGTH,
  hashPassword,
  normaliseUsername,
  userActor,
  verifyAgainstDummy,
  verifyPassword,
} from '@buybox/shared';
import { recordAuthEvent, type RequestMeta } from './config';

export const LOGIN_FAILED_MESSAGE = 'Kullanıcı adı veya parola hatalı.';

export type LoginOutcome =
  | { readonly kind: 'ok'; readonly userId: string; readonly mustChangePassword: boolean }
  | { readonly kind: 'failed' };

export async function attemptPasswordLogin(
  appDb: AppDatabase,
  input: { readonly username: string; readonly password: string },
  meta: RequestMeta,
  nowMs: number = Date.now(),
): Promise<LoginOutcome> {
  const typedUsername = input.username.trim().toLowerCase();
  // Over-long input is refused before hashing it, but still after the same scrypt cost, so a
  // length probe learns nothing either.
  const password = input.password.length > AUTH_PASSWORD_MAX_LENGTH * 4 ? '' : input.password;
  const username = normaliseUsername(input.username);
  const user = username === undefined ? undefined : await authRepo.getUserByUsername(appDb, username);

  const windowStart = nowMs - AUTH_LOCKOUT_WINDOW_MS;
  const ipBlocked =
    meta.ip !== undefined &&
    (await authRepo.countRecentFailures(appDb, { ip: meta.ip }, windowStart)) >= AUTH_IP_LOCKOUT_ATTEMPTS;
  const userLocked = user?.lockedUntil != null && user.lockedUntil > nowMs;

  let passwordOk = false;
  let needsRehash = false;
  if (user === undefined || password === '') {
    await verifyAgainstDummy(password || 'x');
  } else {
    ({ ok: passwordOk, needsRehash } = await verifyPassword(password, user.passwordHash));
  }

  const succeeded =
    user !== undefined && passwordOk && user.state === 'active' && !userLocked && !ipBlocked;

  await authRepo.recordLoginAttempt(appDb, {
    id: newId(),
    at: nowMs,
    username: typedUsername,
    ip: meta.ip ?? null,
    succeeded,
  });

  if (!succeeded) {
    const reason =
      user === undefined
        ? 'unknown_user'
        : ipBlocked
          ? 'address_blocked'
          : userLocked
            ? 'locked'
            : user.state !== 'active'
              ? 'disabled'
              : 'wrong_password';
    await recordAuthEvent(appDb, 'login.failed', {
      userId: user?.id ?? null,
      actor: 'anonymous',
      meta,
      detail: { reason, username: typedUsername.slice(0, 64) },
    });

    // Lock on the attempt that reaches the limit. Counted after this attempt was recorded, so
    // the fifth wrong password is the one that locks.
    if (user !== undefined && !userLocked && reason === 'wrong_password') {
      const failures = await authRepo.countRecentFailures(appDb, { username: user.username }, windowStart);
      if (failures >= AUTH_LOCKOUT_ATTEMPTS) {
        await authRepo.updateUser(
          appDb,
          user.id,
          { lockedUntil: nowMs + AUTH_LOCKOUT_WINDOW_MS },
          { nowMs, actor: 'system' },
        );
        await recordAuthEvent(appDb, 'login.locked', {
          userId: user.id,
          actor: 'system',
          meta,
          detail: { failures },
        });
      }
    }
    return { kind: 'failed' };
  }

  // Past this point the password is known to be right, which is the only moment it can be
  // rehashed under stronger parameters.
  const patch: authRepo.UserPatch = { lastLoginAt: nowMs, lockedUntil: null };
  const finalPatch = needsRehash ? { ...patch, passwordHash: await hashPassword(password) } : patch;
  await authRepo.updateUser(appDb, user.id, finalPatch, { nowMs, actor: userActor(user.id) });
  await recordAuthEvent(appDb, 'login.succeeded', { userId: user.id, actor: userActor(user.id), meta });
  return { kind: 'ok', userId: user.id, mustChangePassword: user.mustChangePassword };
}
