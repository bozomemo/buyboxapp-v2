/**
 * Creates the first Yönetici (doc 18 §8.1). Needs setup access, a configured database, and an
 * install with no active administrator — the last re-checked here, not trusted from the proxy,
 * so two browsers racing through bootstrap cannot both create one from the same token.
 *
 * On success the token file is deleted, setup access is cleared, and the new administrator is
 * signed in.
 */
import { NextResponse } from 'next/server';
import { authRepo, newId } from '@buybox/db';
import {
  PASSWORD_POLICY_MESSAGES,
  checkPasswordPolicy,
  hashPassword,
  normaliseUsername,
  userActor,
} from '@buybox/shared';
import { getAppDb, isBootstrapped } from '@/lib/server/db';
import { cookieOptions, getCookieNames, recordAuthEvent, requestMeta } from '@/lib/server/auth/config';
import { readCookie } from '@/lib/server/auth/current';
import { deleteSetupToken, isBootstrapMode, isValidSetupToken } from '@/lib/server/auth/bootstrap';
import { createSession } from '@/lib/server/auth/session';
import { readJsonObject } from '@/lib/server/request-body';

declare global {
  var __buyboxBootstrapBusy: boolean | undefined;
}

/**
 * One creation at a time. The web app is one process (doc 10 §1.1), so an in-process flag is a
 * real lock here: the second of two racing requests waits for nothing — it is refused, and then
 * finds the install already has its administrator.
 */
export async function POST(request: Request) {
  if (globalThis.__buyboxBootstrapBusy) {
    return NextResponse.json({ error: 'busy', message: 'İlk yönetici şu anda oluşturuluyor.' }, { status: 409 });
  }
  globalThis.__buyboxBootstrapBusy = true;
  try {
    return await createFirstAdmin(request);
  } finally {
    globalThis.__buyboxBootstrapBusy = false;
  }
}

async function createFirstAdmin(request: Request): Promise<NextResponse> {
  const names = getCookieNames();
  if (!(await isValidSetupToken(readCookie(request.headers, names.setup)))) {
    return NextResponse.json({ error: 'setup_access_required', message: 'Önce kurulum anahtarını girin.' }, { status: 401 });
  }
  if (!isBootstrapped()) {
    return NextResponse.json(
      { error: 'database_required', message: 'Önce kurulum sihirbazında veritabanını yapılandırın.' },
      { status: 409 },
    );
  }
  if (!(await isBootstrapMode())) {
    return NextResponse.json({ error: 'not_bootstrap', message: 'Bu kurulumda zaten bir yönetici var.' }, { status: 409 });
  }

  const body = await readJsonObject(request);
  if (
    body === null ||
    typeof body.username !== 'string' ||
    typeof body.displayName !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return NextResponse.json({ error: 'Kullanıcı adı, ad soyad ve parola gerekli.' }, { status: 400 });
  }
  const username = normaliseUsername(body.username);
  if (username === undefined) {
    return NextResponse.json(
      {
        error: 'invalid_username',
        message: 'Kullanıcı adı 3-32 karakter olmalı ve yalnızca küçük harf (a-z, Türkçe harf olmadan), rakam, nokta (.), alt çizgi (_) ve tire (-) içerebilir.',
      },
      { status: 400 },
    );
  }
  const displayName = body.displayName.trim();
  if (displayName === '' || displayName.length > 100) {
    return NextResponse.json({ error: 'invalid_display_name', message: 'Ad soyad gerekli (en fazla 100 karakter).' }, { status: 400 });
  }
  const violation = checkPasswordPolicy(body.password, username);
  if (violation !== null) {
    return NextResponse.json({ error: violation, message: PASSWORD_POLICY_MESSAGES[violation] }, { status: 400 });
  }

  const appDb = getAppDb();
  const nowMs = Date.now();
  const id = newId();
  try {
    await authRepo.insertUser(appDb, {
      id,
      username,
      displayName,
      role: 'admin',
      state: 'active',
      passwordHash: await hashPassword(body.password),
      mustChangePassword: false,
      passwordChangedAt: nowMs,
      totpEnabled: false,
      totpLastStep: null,
      totpPendingSince: null,
      phoneE164: null,
      phoneVerifiedAt: null,
      smsEnabled: false,
      lockedUntil: null,
      lastLoginAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
      createdBy: userActor(id),
      updatedBy: userActor(id),
    });
  } catch (error) {
    if (error instanceof authRepo.UsernameTakenError) {
      // A disabled user with this name exists: the install was bootstrapped before, and every
      // administrator has since been disabled. The name stays theirs (users are never deleted).
      return NextResponse.json({ error: 'username_taken', message: error.message }, { status: 409 });
    }
    throw error;
  }

  await deleteSetupToken();
  const meta = requestMeta(request.headers);
  await recordAuthEvent(appDb, 'bootstrap.completed', { userId: id, actor: userActor(id), meta, detail: { username } });
  const { token, maxAgeMs } = await createSession(appDb, id, meta, nowMs);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(names.session, token, cookieOptions(maxAgeMs));
  response.cookies.set(names.setup, '', cookieOptions(0, 'strict'));
  return response;
}
