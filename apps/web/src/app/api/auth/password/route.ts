/**
 * Change one's own password (doc 18 §3.2). Also how a temporary password set by an
 * administrator is replaced, which is why the proxy lets a `must_change_password` user reach it.
 *
 * Other sessions are revoked; this one gets a new token, so a token captured before the change
 * is worthless after it (doc 18 §4.1).
 */
import { NextResponse } from 'next/server';
import { authRepo } from '@buybox/db';
import {
  PASSWORD_POLICY_MESSAGES,
  checkPasswordPolicy,
  hashPassword,
  userActor,
  verifyPassword,
} from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';
import { cookieOptions, getCookieNames, recordAuthEvent, requestMeta } from '@/lib/server/auth/config';
import { getRequestSession } from '@/lib/server/auth/current';
import { createSession } from '@/lib/server/auth/session';
import { readJsonObject } from '@/lib/server/request-body';

export async function POST(request: Request) {
  const current = await getRequestSession(request);
  if (current === null) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  }
  const body = await readJsonObject(request);
  if (body === null || typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') {
    return NextResponse.json({ error: 'Mevcut ve yeni parola gerekli.' }, { status: 400 });
  }

  const appDb = getAppDb();
  const user = await authRepo.getUserById(appDb, current.user.id);
  if (user === undefined) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  }
  if (!(await verifyPassword(body.currentPassword, user.passwordHash)).ok) {
    return NextResponse.json({ error: 'wrong_password', message: 'Mevcut parola hatalı.' }, { status: 400 });
  }
  const violation = checkPasswordPolicy(body.newPassword, user.username);
  if (violation !== null) {
    return NextResponse.json({ error: violation, message: PASSWORD_POLICY_MESSAGES[violation] }, { status: 400 });
  }
  if (body.newPassword === body.currentPassword) {
    return NextResponse.json(
      { error: 'same_password', message: 'Yeni parola mevcut paroladan farklı olmalı.' },
      { status: 400 },
    );
  }

  const nowMs = Date.now();
  const actor = userActor(user.id);
  await authRepo.updateUser(
    appDb,
    user.id,
    { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false, passwordChangedAt: nowMs },
    { nowMs, actor },
  );
  // Every session goes, this one included, and this browser gets a fresh one. Trusted devices
  // go too (doc 18 §5.1): a device remembered before the change is not vouched for after it.
  await authRepo.deleteSessionsForUser(appDb, user.id);
  await authRepo.deleteTrustedDevices(appDb, user.id);
  const meta = requestMeta(request.headers);
  const { token, maxAgeMs } = await createSession(appDb, user.id, meta, nowMs);
  await recordAuthEvent(appDb, 'password.changed', { userId: user.id, actor, meta });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(getCookieNames().session, token, cookieOptions(maxAgeMs));
  return response;
}
