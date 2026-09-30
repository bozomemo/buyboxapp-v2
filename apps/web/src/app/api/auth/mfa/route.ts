/**
 * The second step of signing in (doc 18 §5.1): a code against the challenge the password step
 * issued. `{ method: 'totp' | 'sms' | 'recovery', code, rememberDevice? }`.
 *
 * Exempt from the proxy's session check (there is no session yet — that is the point) but not
 * from the Origin check. The challenge cookie is the only credential, and it is good for five
 * minutes and five wrong codes.
 */
import { NextResponse } from 'next/server';
import { getAppDb, isBootstrapped } from '@/lib/server/db';
import { getSecretStore } from '@/lib/server/secrets';
import { cookieOptions, getAuthConfig, getCookieNames, requestMeta } from '@/lib/server/auth/config';
import { readCookie } from '@/lib/server/auth/current';
import { availableMethods, trustDevice, verifyChallenge } from '@/lib/server/auth/mfa';
import { authRepo } from '@buybox/db';
import { AUTH_MFA_MAX_ATTEMPTS, hashToken, maskPhone } from '@buybox/shared';
import { createSession } from '@/lib/server/auth/session';
import { readJsonObject } from '@/lib/server/request-body';

const EXPIRED = 'Doğrulama süresi doldu. Yeniden giriş yapın.';

/**
 * What the challenge screen offers (doc 06 §10.1): the user's methods, the last two digits of
 * their phone for SMS, and whether this install offers "remember this device". Nothing about
 * who the user is beyond that — the page is reachable with only a challenge cookie.
 */
export async function GET(request: Request) {
  if (!isBootstrapped()) return NextResponse.json({ error: EXPIRED, code: 'challenge_expired' }, { status: 401 });
  const appDb = getAppDb();
  const token = readCookie(request.headers, getCookieNames().mfa);
  const challenge = token === undefined ? undefined : await authRepo.findOpenMfaChallenge(appDb, hashToken(token), Date.now());
  const user = challenge === undefined ? undefined : await authRepo.getUserById(appDb, challenge.userId);
  if (challenge === undefined || user === undefined || challenge.attempts >= AUTH_MFA_MAX_ATTEMPTS) {
    return NextResponse.json({ error: EXPIRED, code: 'challenge_expired' }, { status: 401 });
  }
  return NextResponse.json({
    methods: await availableMethods(appDb, user),
    phoneHint: user.phoneE164 === null ? null : maskPhone(user.phoneE164),
    canRememberDevice: getAuthConfig().trustedDeviceDays > 0,
    rememberDays: getAuthConfig().trustedDeviceDays,
  });
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (body === null || typeof body.method !== 'string' || typeof body.code !== 'string') {
    return NextResponse.json({ error: 'Yöntem ve kod gerekli.' }, { status: 400 });
  }
  if (!isBootstrapped()) return NextResponse.json({ error: EXPIRED, code: 'challenge_expired' }, { status: 401 });

  const names = getCookieNames();
  const appDb = getAppDb();
  const meta = requestMeta(request.headers);
  const outcome = await verifyChallenge(
    appDb,
    getSecretStore(),
    readCookie(request.headers, names.mfa),
    { method: body.method, code: body.code },
    meta,
  );

  if (outcome.kind === 'expired') {
    const response = NextResponse.json({ error: EXPIRED, code: 'challenge_expired' }, { status: 401 });
    response.cookies.set(names.mfa, '', cookieOptions(0, 'strict'));
    return response;
  }
  if (outcome.kind === 'failed') {
    return NextResponse.json({ error: outcome.message, code: 'wrong_code' }, { status: 401 });
  }

  const { token, maxAgeMs } = await createSession(appDb, outcome.userId, meta);
  const response = NextResponse.json({
    ok: true,
    ...(outcome.recoveryLeft === undefined ? {} : { recoveryCodesLeft: outcome.recoveryLeft }),
  });
  response.cookies.set(names.session, token, cookieOptions(maxAgeMs));
  response.cookies.set(names.mfa, '', cookieOptions(0, 'strict'));
  if (body.rememberDevice === true) {
    const device = await trustDevice(appDb, outcome.userId, meta);
    if (device !== null) response.cookies.set(names.device, device.token, cookieOptions(device.maxAgeMs));
  }
  return response;
}
