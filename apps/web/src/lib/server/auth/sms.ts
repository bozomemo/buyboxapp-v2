/**
 * SMS as a second factor (doc 18 §5.3), up to the provider boundary. With `SMS_PROVIDER` unset —
 * every install today — `isSmsAvailable()` is false and SMS is offered nowhere; everything below
 * is built and tested against a stand-in sender so that adding a provider is an adapter and a
 * setting, nothing more.
 *
 * Every send happens after a password has been verified (a challenge, or a signed-in user adding
 * a phone), and every send passes three caps first — per user per hour, per number per day, and
 * the whole install per Istanbul day — because SMS pumping (making us send paid messages to
 * premium numbers) is the abuse this channel invites.
 */
import { createSmsSender, type SmsSender } from '@buybox/adapters';
import { authRepo, newId, type AppDatabase } from '@buybox/db';
import {
  AUTH_SMS_CODE_TTL_MS,
  AUTH_SMS_MAX_ATTEMPTS,
  AUTH_SMS_PER_PHONE_DAILY,
  AUTH_SMS_PER_USER_HOURLY,
  AUTH_SMS_RESEND_MS,
  createLogger,
  deriveSmsCodeKey,
  digestsEqual,
  generateSmsCode,
  normalisePhone,
  smsCodeMac,
  userActor,
} from '@buybox/shared';
import { getAuthConfig, recordAuthEvent, type RequestMeta } from './config';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Europe/Istanbul has been UTC+3 all year since 2016 — no DST to follow. */
const ISTANBUL_OFFSET_MS = 3 * HOUR;

declare global {
  var __buyboxSmsSender: SmsSender | undefined;
}

/** Built once per process from `SMS_PROVIDER`; throws for a value that must stop the service (instrumentation checks it at boot). */
export function getSmsSender(): SmsSender {
  globalThis.__buyboxSmsSender ??= createSmsSender(process.env, createLogger({ name: 'sms' }));
  return globalThis.__buyboxSmsSender;
}

export function isSmsAvailable(): boolean {
  try {
    return getSmsSender().available;
  } catch {
    return false;
  }
}

function codeKey(): Buffer {
  const key = process.env.SECRET_STORE_KEY;
  if (!key) throw new Error('SECRET_STORE_KEY is required to protect SMS codes');
  return deriveSmsCodeKey(key);
}

/** Midnight in Istanbul, as epoch ms, at or before `nowMs` — where the install-wide cap resets. */
export function startOfIstanbulDay(nowMs: number): number {
  return Math.floor((nowMs + ISTANBUL_OFFSET_MS) / DAY) * DAY - ISTANBUL_OFFSET_MS;
}

export class SmsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 429 | 502 = 400,
  ) {
    super(message);
    this.name = 'SmsError';
  }
}

const TEXT = (code: string) => `BuyBox doğrulama kodunuz: ${code}. 5 dakika geçerlidir. Bu kodu kimseyle paylaşmayın.`;

/**
 * Sends one code: caps, resend spacing, a new row (replacing any live one), the message. The code
 * is stored only as an HMAC keyed with a secret that is not in the database (doc 18 §5.3).
 */
async function sendCode(
  appDb: AppDatabase,
  sender: SmsSender,
  input: {
    readonly userId: string;
    readonly phone: string;
    readonly purpose: authRepo.SmsCodePurpose;
    readonly challengeId: string | null;
    readonly actor: string;
  },
  meta: RequestMeta,
  nowMs: number,
): Promise<void> {
  if (!sender.available) throw new SmsError('SMS şu anda kullanılamıyor.', 409);

  const live = await authRepo.findLiveSmsCode(appDb, input.userId, input.purpose, nowMs);
  if (live !== undefined && nowMs - live.sentAt < AUTH_SMS_RESEND_MS) {
    throw new SmsError('Yeni kod istemeden önce bir dakika bekleyin.', 429);
  }
  if ((await authRepo.countSmsSent(appDb, { userId: input.userId }, nowMs - HOUR)) >= AUTH_SMS_PER_USER_HOURLY) {
    throw new SmsError('Bu saat için SMS sınırına ulaşıldı. Doğrulama uygulamasını veya kurtarma kodunu kullanın.', 429);
  }
  if ((await authRepo.countSmsSent(appDb, { phoneE164: input.phone }, nowMs - DAY)) >= AUTH_SMS_PER_PHONE_DAILY) {
    throw new SmsError('Bu numara için günlük SMS sınırına ulaşıldı.', 429);
  }
  if ((await authRepo.countSmsSent(appDb, {}, startOfIstanbulDay(nowMs))) >= getAuthConfig().smsDailyCap) {
    await recordAuthEvent(appDb, 'sms.capped', { userId: input.userId, actor: input.actor, meta });
    createLogger({ name: 'sms' }).error('sms.dailyCapReached', { cap: getAuthConfig().smsDailyCap });
    throw new SmsError('Kurulumun günlük SMS sınırına ulaşıldı. Doğrulama uygulamasını veya kurtarma kodunu kullanın.', 429);
  }

  const id = newId();
  const code = generateSmsCode();
  await authRepo.insertSmsCode(appDb, {
    id,
    purpose: input.purpose,
    challengeId: input.challengeId,
    userId: input.userId,
    phoneE164: input.phone,
    codeHmac: smsCodeMac(codeKey(), id, code),
    sentAt: nowMs,
    expiresAt: nowMs + AUTH_SMS_CODE_TTL_MS,
    attempts: 0,
    providerRef: null,
    state: 'sent',
  });

  const result = await sender.send(input.phone, TEXT(code));
  if (!result.ok) {
    await authRepo.updateSmsCode(appDb, id, { state: 'failed' });
    await recordAuthEvent(appDb, 'sms.failed', {
      userId: input.userId,
      actor: input.actor,
      meta,
      detail: { kind: result.error.kind, provider: sender.name },
    });
    throw new SmsError('SMS gönderilemedi. Başka bir yöntem deneyin.', 502);
  }
  await authRepo.updateSmsCode(appDb, id, { providerRef: result.value.providerRef });
  await recordAuthEvent(appDb, 'sms.sent', {
    userId: input.userId,
    actor: input.actor,
    meta,
    detail: { purpose: input.purpose, provider: sender.name },
  });
}

/** Checks a code against the user's live code for `purpose`; spends it on success, counts a miss. */
async function checkCode(
  appDb: AppDatabase,
  userId: string,
  purpose: authRepo.SmsCodePurpose,
  challengeId: string | null,
  code: string,
  nowMs: number,
): Promise<boolean> {
  const live = await authRepo.findLiveSmsCode(appDb, userId, purpose, nowMs);
  if (live === undefined || live.challengeId !== challengeId || live.attempts >= AUTH_SMS_MAX_ATTEMPTS) return false;
  const typed = code.replace(/\s/g, '');
  const ok = /^\d{6}$/.test(typed) && digestsEqual(smsCodeMac(codeKey(), live.id, typed), live.codeHmac);
  if (ok) {
    await authRepo.updateSmsCode(appDb, live.id, { state: 'used' });
    return true;
  }
  const attempts = live.attempts + 1;
  await authRepo.updateSmsCode(appDb, live.id, { attempts, ...(attempts >= AUTH_SMS_MAX_ATTEMPTS ? { state: 'expired' as const } : {}) });
  return false;
}

// ── Sign-in ──────────────────────────────────────────────────────────────────────────────────

/** Sends the sign-in code for an open challenge (the password is already verified). */
export async function sendLoginCode(
  appDb: AppDatabase,
  sender: SmsSender,
  user: authRepo.UserRow,
  challengeId: string,
  meta: RequestMeta,
  nowMs: number = Date.now(),
): Promise<void> {
  if (!user.smsEnabled || user.phoneE164 === null || user.phoneVerifiedAt === null) {
    throw new SmsError('Bu hesapta SMS doğrulaması kurulu değil.', 409);
  }
  await sendCode(appDb, sender, { userId: user.id, phone: user.phoneE164, purpose: 'login', challengeId, actor: 'anonymous' }, meta, nowMs);
}

export async function verifySmsLoginCode(
  appDb: AppDatabase,
  userId: string,
  challengeId: string,
  code: string,
  nowMs: number,
): Promise<boolean> {
  return checkCode(appDb, userId, 'login', challengeId, code, nowMs);
}

// ── Enrolment ────────────────────────────────────────────────────────────────────────────────

/**
 * Step 1: the number the user typed, and a code sent to it. The number is stored at once but not
 * verified, and SMS stays off until the code comes back (doc 18 §5.3) — so a mistyped number
 * never becomes a way in, or a way to message a stranger more than once.
 */
export async function startPhoneEnrolment(
  appDb: AppDatabase,
  sender: SmsSender,
  userId: string,
  rawPhone: unknown,
  meta: RequestMeta,
  nowMs: number = Date.now(),
): Promise<{ readonly phone: string }> {
  const phone = typeof rawPhone === 'string' ? normalisePhone(rawPhone) : undefined;
  if (phone === undefined) throw new SmsError('Telefon numarası geçersiz. Örnek: 0532 123 45 67');
  const actor = userActor(userId);
  await authRepo.updateUser(appDb, userId, { phoneE164: phone, phoneVerifiedAt: null, smsEnabled: false }, { nowMs, actor });
  await sendCode(appDb, sender, { userId, phone, purpose: 'enrol', challengeId: null, actor }, meta, nowMs);
  return { phone };
}

/** Step 2: the code. Returns whether this was the user's first method (the caller then issues recovery codes). */
export async function confirmPhoneEnrolment(
  appDb: AppDatabase,
  userId: string,
  code: string,
  meta: RequestMeta,
  nowMs: number = Date.now(),
): Promise<{ readonly firstMethod: boolean }> {
  const user = await authRepo.getUserById(appDb, userId);
  if (user === undefined || user.phoneE164 === null) throw new SmsError('Önce telefon numarası girin.', 409);
  if (!(await checkCode(appDb, userId, 'enrol', null, code, nowMs))) {
    throw new SmsError('Kod hatalı veya süresi dolmuş.');
  }
  const firstMethod = !user.totpEnabled && !(user.smsEnabled && user.phoneVerifiedAt !== null);
  const actor = userActor(userId);
  await authRepo.updateUser(appDb, userId, { phoneVerifiedAt: nowMs, smsEnabled: true }, { nowMs, actor });
  await recordAuthEvent(appDb, 'mfa.enrolled', { userId, actor, meta, detail: { method: 'sms' } });
  return { firstMethod };
}
