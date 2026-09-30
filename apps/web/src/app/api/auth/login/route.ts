/**
 * Sign in with a username and password (doc 18 §3, §4, §5.1). Exempt from the proxy's session
 * check — it is how a session is made — but not from its Origin check (login CSRF, §4.3).
 *
 * After a correct password, one of three things:
 * - the user has a second factor and this browser is a trusted device → a session;
 * - the user has a second factor → a challenge cookie, and `next: 'mfa'`; no session yet;
 * - the user has none → a session. Where one is required, the proxy then admits that session to
 *   nothing but enrolment (doc 18 §5.1).
 */
import { NextResponse } from 'next/server';
import { authRepo } from '@buybox/db';
import { AUTH_MFA_CHALLENGE_TTL_MS } from '@buybox/shared';
import { isBootstrapped, getAppDb } from '@/lib/server/db';
import { cookieOptions, getCookieNames, requestMeta } from '@/lib/server/auth/config';
import { readCookie } from '@/lib/server/auth/current';
import { attemptPasswordLogin, LOGIN_FAILED_MESSAGE } from '@/lib/server/auth/login';
import { availableMethods, isTrustedDevice, startChallenge } from '@/lib/server/auth/mfa';
import { createSession } from '@/lib/server/auth/session';
import { readJsonObject } from '@/lib/server/request-body';

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (body === null || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'Kullanıcı adı ve parola gerekli.' }, { status: 400 });
  }
  if (!isBootstrapped()) {
    return NextResponse.json({ error: 'Kurulum tamamlanmadı.', code: 'bootstrap_required' }, { status: 409 });
  }

  const appDb = getAppDb();
  const meta = requestMeta(request.headers);
  const outcome = await attemptPasswordLogin(appDb, { username: body.username, password: body.password }, meta);
  if (outcome.kind === 'failed') {
    return NextResponse.json({ error: LOGIN_FAILED_MESSAGE, code: 'login_failed' }, { status: 401 });
  }

  const names = getCookieNames();
  const user = await authRepo.getUserById(appDb, outcome.userId);
  const methods = user === undefined ? [] : await availableMethods(appDb, user);
  const trusted = await isTrustedDevice(appDb, outcome.userId, readCookie(request.headers, names.device));

  if (methods.length > 0 && !trusted) {
    const challenge = await startChallenge(appDb, outcome.userId);
    const response = NextResponse.json({ ok: true, next: 'mfa', methods });
    response.cookies.set(names.mfa, challenge, cookieOptions(AUTH_MFA_CHALLENGE_TTL_MS, 'strict'));
    return response;
  }

  const { token, maxAgeMs } = await createSession(appDb, outcome.userId, meta);
  const response = NextResponse.json({ ok: true, mustChangePassword: outcome.mustChangePassword });
  response.cookies.set(names.session, token, cookieOptions(maxAgeMs));
  return response;
}
