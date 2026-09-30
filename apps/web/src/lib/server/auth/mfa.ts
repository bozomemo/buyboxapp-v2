/**
 * The second factor (doc 18 §5): the policy, the challenge between password and session, and
 * TOTP enrolment. SMS joins through `sms.ts` (12.8); recovery codes are here because they are
 * issued with the first method enrolled.
 */
import { authRepo, configRepo, newId, type AppDatabase } from '@buybox/db';
import {
  AUTH_LOCKOUT_ATTEMPTS,
  AUTH_LOCKOUT_WINDOW_MS,
  AUTH_MFA_CHALLENGE_TTL_MS,
  AUTH_MFA_MAX_ATTEMPTS,
  AUTH_MFA_REQUIRED_SETTING_KEY,
  AUTH_TOTP_ENROLMENT_TTL_MS,
  base32Decode,
  base32Encode,
  generateOpaqueToken,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hashToken,
  totpPendingSecretKey,
  totpSecretKey,
  totpUri,
  userActor,
  verifyPassword,
  verifyTotp,
  type ISecretStore,
} from '@buybox/shared';
import QRCode from 'qrcode';
import { getAuthConfig, recordAuthEvent, type RequestMeta } from './config';
import { isSmsAvailable, verifySmsLoginCode } from './sms';

// ── Policy ───────────────────────────────────────────────────────────────────────────────────

declare global {
  var __buyboxMfaRequired: { value: boolean; atMs: number } | undefined;
}
const POLICY_CACHE_MS = 30_000;

/**
 * doc 18 §5.1: a network install always requires a second factor, and no setting changes that
 * (R-AUTH-5). A loopback install requires one when `auth.mfaRequired` says so. Cached briefly
 * because the proxy asks on every request; `forgetMfaPolicy` drops it when the setting changes.
 */
export async function isMfaRequired(appDb: AppDatabase): Promise<boolean> {
  if (getAuthConfig().networkMode) return true;
  const cached = globalThis.__buyboxMfaRequired;
  const nowMs = Date.now();
  if (cached && nowMs - cached.atMs < POLICY_CACHE_MS) return cached.value;
  let value = false;
  try {
    value = (await configRepo.getAppSetting(appDb, AUTH_MFA_REQUIRED_SETTING_KEY))?.value === 'true';
  } catch {
    // An unreadable setting on a loopback install means optional — the network case never gets here.
  }
  globalThis.__buyboxMfaRequired = { value, atMs: nowMs };
  return value;
}

export function forgetMfaPolicy(): void {
  globalThis.__buyboxMfaRequired = undefined;
}

export type MfaMethod = 'totp' | 'sms' | 'recovery';

/** Methods the user can sign in with right now — SMS only while a provider is configured. */
export async function availableMethods(appDb: AppDatabase, user: authRepo.UserRow): Promise<MfaMethod[]> {
  const methods: MfaMethod[] = [];
  if (user.totpEnabled) methods.push('totp');
  if (user.smsEnabled && user.phoneVerifiedAt !== null && isSmsAvailable()) methods.push('sms');
  if (methods.length > 0 && (await authRepo.countUnusedRecoveryCodes(appDb, user.id)) > 0) methods.push('recovery');
  return methods;
}

/** Enrolled in a method that counts, whether or not its channel is up (an SMS outage is not "not enrolled"). */
export function isMfaEnrolled(user: Pick<authRepo.UserRow, 'totpEnabled' | 'smsEnabled' | 'phoneVerifiedAt'>): boolean {
  return user.totpEnabled || (user.smsEnabled && user.phoneVerifiedAt !== null);
}

// ── Challenge ────────────────────────────────────────────────────────────────────────────────

export async function startChallenge(appDb: AppDatabase, userId: string, nowMs: number = Date.now()): Promise<string> {
  const token = generateOpaqueToken();
  await authRepo.insertMfaChallenge(appDb, {
    id: newId(),
    tokenHash: hashToken(token),
    userId,
    createdAt: nowMs,
    expiresAt: nowMs + AUTH_MFA_CHALLENGE_TTL_MS,
    attempts: 0,
    consumedAt: null,
  });
  return token;
}

export type ChallengeOutcome =
  | { readonly kind: 'ok'; readonly userId: string; readonly method: MfaMethod; readonly recoveryLeft?: number }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'expired' };

const WRONG_CODE = 'Kod hatalı veya süresi dolmuş.';

/**
 * Checks one code against an open challenge. Every wrong code counts twice: against the
 * challenge (5 and it is spent) and against the username's lockout, because a correct password
 * followed by guessed codes is still an attack (doc 18 §3.3). A code is good once, whatever the
 * method — the TOTP step, the SMS code and the recovery code are each spent atomically.
 */
export async function verifyChallenge(
  appDb: AppDatabase,
  secretStore: ISecretStore,
  challengeToken: string | undefined,
  input: { readonly method: string; readonly code: string },
  meta: RequestMeta,
  nowMs: number = Date.now(),
): Promise<ChallengeOutcome> {
  if (challengeToken === undefined) return { kind: 'expired' };
  const challenge = await authRepo.findOpenMfaChallenge(appDb, hashToken(challengeToken), nowMs);
  if (challenge === undefined || challenge.attempts >= AUTH_MFA_MAX_ATTEMPTS) return { kind: 'expired' };
  const user = await authRepo.getUserById(appDb, challenge.userId);
  if (user === undefined || user.state !== 'active' || (user.lockedUntil !== null && user.lockedUntil > nowMs)) {
    await authRepo.consumeMfaChallenge(appDb, challenge.id, nowMs);
    return { kind: 'expired' };
  }

  const methods = await availableMethods(appDb, user);
  const method = input.method as MfaMethod;
  let ok = false;
  let recoveryLeft: number | undefined;
  if (methods.includes(method)) {
    if (method === 'totp') {
      const stored = await secretStore.get(totpSecretKey(user.id));
      const secret = stored === undefined ? undefined : base32Decode(stored);
      const result = secret === undefined ? { ok: false as const } : verifyTotp(secret, input.code, nowMs, user.totpLastStep);
      ok = result.ok && (await authRepo.advanceTotpStep(appDb, user.id, result.step));
    } else if (method === 'recovery') {
      const hash = hashRecoveryCode(input.code);
      ok = hash !== undefined && (await authRepo.useRecoveryCode(appDb, user.id, hash, nowMs));
      if (ok) recoveryLeft = await authRepo.countUnusedRecoveryCodes(appDb, user.id);
    } else if (method === 'sms') {
      ok = await verifySmsLoginCode(appDb, user.id, challenge.id, input.code, nowMs);
    }
  }

  if (!ok) {
    await authRepo.incrementMfaChallengeAttempts(appDb, challenge.id);
    await authRepo.recordLoginAttempt(appDb, { id: newId(), at: nowMs, username: user.username, ip: meta.ip ?? null, succeeded: false });
    await recordAuthEvent(appDb, 'mfa.failed', { userId: user.id, actor: 'anonymous', meta, detail: { method: input.method } });
    const failures = await authRepo.countRecentFailures(appDb, { username: user.username }, nowMs - AUTH_LOCKOUT_WINDOW_MS);
    if (failures >= AUTH_LOCKOUT_ATTEMPTS) {
      await authRepo.updateUser(appDb, user.id, { lockedUntil: nowMs + AUTH_LOCKOUT_WINDOW_MS }, { nowMs, actor: 'system' });
      await authRepo.consumeMfaChallenge(appDb, challenge.id, nowMs);
      await recordAuthEvent(appDb, 'login.locked', { userId: user.id, actor: 'system', meta, detail: { failures } });
      return { kind: 'expired' };
    }
    return { kind: 'failed', message: WRONG_CODE };
  }

  // Two correct codes racing for one challenge make one session.
  if (!(await authRepo.consumeMfaChallenge(appDb, challenge.id, nowMs))) return { kind: 'expired' };
  await authRepo.recordLoginAttempt(appDb, { id: newId(), at: nowMs, username: user.username, ip: meta.ip ?? null, succeeded: true });
  await authRepo.updateUser(appDb, user.id, { lastLoginAt: nowMs }, { nowMs, actor: userActor(user.id) });
  await recordAuthEvent(appDb, method === 'recovery' ? 'recovery.used' : 'mfa.passed', {
    userId: user.id,
    actor: userActor(user.id),
    meta,
    detail: { method, ...(recoveryLeft === undefined ? {} : { recoveryLeft }) },
  });
  return { kind: 'ok', userId: user.id, method, ...(recoveryLeft === undefined ? {} : { recoveryLeft }) };
}

// ── TOTP enrolment ───────────────────────────────────────────────────────────────────────────

export class MfaError extends Error {
  constructor(message: string, readonly status: 400 | 409 = 400) {
    super(message);
    this.name = 'MfaError';
  }
}

/**
 * Step 1: a fresh secret, parked under the pending key until a code from the user's app proves
 * they scanned it (doc 18 §5.2). Returns the key as text and the QR as SVG, rendered here on the
 * server so no QR library reaches the browser.
 */
export async function startTotpEnrolment(
  appDb: AppDatabase,
  secretStore: ISecretStore,
  user: { readonly id: string; readonly username: string },
  issuer: string,
  nowMs: number = Date.now(),
): Promise<{ readonly secret: string; readonly qrSvg: string }> {
  const secret = generateTotpSecret();
  const encoded = base32Encode(secret);
  await secretStore.set(totpPendingSecretKey(user.id), encoded);
  await authRepo.updateUser(appDb, user.id, { totpPendingSince: nowMs }, { nowMs, actor: userActor(user.id) });
  const uri = totpUri({ issuer, accountName: user.username, secret });
  const qrSvg = await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  return { secret: encoded.replace(/(.{4})(?=.)/g, '$1 '), qrSvg };
}

/**
 * Step 2: the code from the app. On success the pending secret becomes the secret, TOTP is on,
 * and — when this is the user's first method — ten recovery codes are issued and returned, the
 * only time they are ever shown (doc 18 §5.4).
 */
export async function confirmTotpEnrolment(
  appDb: AppDatabase,
  secretStore: ISecretStore,
  userId: string,
  code: string,
  meta: RequestMeta,
  nowMs: number = Date.now(),
): Promise<{ readonly recoveryCodes: string[] | null }> {
  const user = await authRepo.getUserById(appDb, userId);
  const pending = await secretStore.get(totpPendingSecretKey(userId));
  if (user === undefined || pending === undefined || user.totpPendingSince === null) {
    throw new MfaError('Kurulum başlatılmamış. Baştan başlayın.', 409);
  }
  if (nowMs - user.totpPendingSince > AUTH_TOTP_ENROLMENT_TTL_MS) {
    await secretStore.delete(totpPendingSecretKey(userId));
    await authRepo.updateUser(appDb, userId, { totpPendingSince: null }, { nowMs, actor: userActor(userId) });
    throw new MfaError('Kurulumun süresi doldu. Baştan başlayın.', 409);
  }
  const result = verifyTotp(base32Decode(pending)!, code, nowMs, null);
  if (!result.ok) throw new MfaError('Kod doğrulanamadı. Uygulamadaki güncel kodu girin; telefonun saatinin doğru olduğundan emin olun.');

  const firstMethod = !isMfaEnrolled(user);
  await secretStore.set(totpSecretKey(userId), pending);
  await secretStore.delete(totpPendingSecretKey(userId));
  await authRepo.updateUser(
    appDb,
    userId,
    { totpEnabled: true, totpLastStep: result.step, totpPendingSince: null },
    { nowMs, actor: userActor(userId) },
  );
  await recordAuthEvent(appDb, 'mfa.enrolled', { userId, actor: userActor(userId), meta, detail: { method: 'totp' } });
  return { recoveryCodes: firstMethod ? await issueRecoveryCodes(appDb, userId, nowMs) : null };
}

export async function issueRecoveryCodes(appDb: AppDatabase, userId: string, nowMs: number = Date.now()): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await authRepo.replaceRecoveryCodes(
    appDb,
    userId,
    codes.map((code) => ({ id: newId(), userId, codeHash: hashRecoveryCode(code)!, createdAt: nowMs, usedAt: null })),
  );
  return codes;
}

/** Removing a method or reissuing codes asks for the password again: a walked-away-from browser must not be enough. */
export async function confirmPassword(appDb: AppDatabase, userId: string, password: unknown): Promise<void> {
  const user = await authRepo.getUserById(appDb, userId);
  if (user === undefined || typeof password !== 'string' || !(await verifyPassword(password, user.passwordHash)).ok) {
    throw new MfaError('Parola hatalı.');
  }
}

export async function removeTotp(
  appDb: AppDatabase,
  secretStore: ISecretStore,
  userId: string,
  meta: RequestMeta,
  nowMs: number = Date.now(),
): Promise<void> {
  const user = await authRepo.getUserById(appDb, userId);
  if (user === undefined || !user.totpEnabled) return;
  const stillEnrolled = isMfaEnrolled({ ...user, totpEnabled: false });
  if (!stillEnrolled && (await isMfaRequired(appDb))) {
    throw new MfaError('İki adımlı doğrulama bu kurulumda zorunlu; son yöntemi kaldıramazsınız. Önce başka bir yöntem kurun.', 409);
  }
  await authRepo.updateUser(appDb, userId, { totpEnabled: false, totpLastStep: null }, { nowMs, actor: userActor(userId) });
  await secretStore.delete(totpSecretKey(userId));
  if (!stillEnrolled) {
    await authRepo.deleteRecoveryCodes(appDb, userId);
    await authRepo.deleteTrustedDevices(appDb, userId);
  }
  await recordAuthEvent(appDb, 'mfa.removed', { userId, actor: userActor(userId), meta, detail: { method: 'totp' } });
}

// ── Trusted devices (doc 18 §5.1) ────────────────────────────────────────────────────────────

/** Skips the second factor — never the password — for `AUTH_TRUSTED_DEVICE_DAYS`. */
export async function trustDevice(
  appDb: AppDatabase,
  userId: string,
  meta: RequestMeta,
  nowMs: number = Date.now(),
): Promise<{ readonly token: string; readonly maxAgeMs: number } | null> {
  const days = getAuthConfig().trustedDeviceDays;
  if (days <= 0) return null;
  const token = generateOpaqueToken();
  const maxAgeMs = days * 24 * 60 * 60 * 1000;
  await authRepo.insertTrustedDevice(appDb, {
    id: newId(),
    tokenHash: hashToken(token),
    userId,
    createdAt: nowMs,
    expiresAt: nowMs + maxAgeMs,
    lastUsedAt: nowMs,
    label: meta.userAgent,
  });
  return { token, maxAgeMs };
}

export async function isTrustedDevice(
  appDb: AppDatabase,
  userId: string,
  token: string | undefined,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (token === undefined || token === '' || getAuthConfig().trustedDeviceDays <= 0) return false;
  const device = await authRepo.findTrustedDevice(appDb, userId, hashToken(token), nowMs);
  if (device === undefined) return false;
  await authRepo.touchTrustedDevice(appDb, device.id, nowMs);
  return true;
}

/**
 * Removes SMS as a method (doc 18 §5.3). The phone number goes with it: it was held only to
 * deliver codes (doc 18 §10). Same last-method rule as `removeTotp`.
 */
export async function removeSms(appDb: AppDatabase, userId: string, meta: RequestMeta, nowMs: number = Date.now()): Promise<void> {
  const user = await authRepo.getUserById(appDb, userId);
  if (user === undefined || (!user.smsEnabled && user.phoneE164 === null)) return;
  const stillEnrolled = user.totpEnabled;
  if (!stillEnrolled && isMfaEnrolled(user) && (await isMfaRequired(appDb))) {
    throw new MfaError('İki adımlı doğrulama bu kurulumda zorunlu; son yöntemi kaldıramazsınız. Önce başka bir yöntem kurun.', 409);
  }
  await authRepo.updateUser(
    appDb,
    userId,
    { smsEnabled: false, phoneE164: null, phoneVerifiedAt: null },
    { nowMs, actor: userActor(userId) },
  );
  if (!stillEnrolled) {
    await authRepo.deleteRecoveryCodes(appDb, userId);
    await authRepo.deleteTrustedDevices(appDb, userId);
  }
  await recordAuthEvent(appDb, 'mfa.removed', { userId, actor: userActor(userId), meta, detail: { method: 'sms' } });
}
