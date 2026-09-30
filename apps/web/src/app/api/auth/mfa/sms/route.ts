/**
 * Send the sign-in code by SMS for the open challenge (doc 18 §5.3). The challenge cookie is the
 * proof that a password was verified — without it nothing is sent, which is what keeps an
 * anonymous caller from making the install send paid messages (R-AUTH-9).
 */
import { NextResponse } from 'next/server';
import { authRepo } from '@buybox/db';
import { AUTH_MFA_MAX_ATTEMPTS, hashToken } from '@buybox/shared';
import { getAppDb, isBootstrapped } from '@/lib/server/db';
import { getCookieNames, requestMeta } from '@/lib/server/auth/config';
import { readCookie } from '@/lib/server/auth/current';
import { SmsError, getSmsSender, sendLoginCode } from '@/lib/server/auth/sms';

const EXPIRED = 'Doğrulama süresi doldu. Yeniden giriş yapın.';

export async function POST(request: Request) {
  if (!isBootstrapped()) return NextResponse.json({ error: EXPIRED, code: 'challenge_expired' }, { status: 401 });
  const appDb = getAppDb();
  const token = readCookie(request.headers, getCookieNames().mfa);
  const challenge = token === undefined ? undefined : await authRepo.findOpenMfaChallenge(appDb, hashToken(token), Date.now());
  const user = challenge === undefined ? undefined : await authRepo.getUserById(appDb, challenge.userId);
  if (challenge === undefined || user === undefined || challenge.attempts >= AUTH_MFA_MAX_ATTEMPTS) {
    return NextResponse.json({ error: EXPIRED, code: 'challenge_expired' }, { status: 401 });
  }
  try {
    await sendLoginCode(appDb, getSmsSender(), user, challenge.id, requestMeta(request.headers));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SmsError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
