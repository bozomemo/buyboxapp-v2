/**
 * Whether a second factor is required for everyone (doc 18 §5.1). On a network install it always
 * is and this route refuses to say otherwise (R-AUTH-5); on a loopback install it is the
 * `auth.mfaRequired` setting. `users.manage` only.
 */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { AUTH_MFA_REQUIRED_SETTING_KEY } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';
import { getAuthConfig } from '@/lib/server/auth/config';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';
import { forgetMfaPolicy, isMfaRequired } from '@/lib/server/auth/mfa';
import { readJsonObject } from '@/lib/server/request-body';

export const dynamic = 'force-dynamic';

async function getHandler() {
  return NextResponse.json({ networkMode: getAuthConfig().networkMode, mfaRequired: await isMfaRequired(getAppDb()) });
}

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const body = await readJsonObject(request);
  if (body === null || typeof body.mfaRequired !== 'boolean') {
    return NextResponse.json({ error: '`mfaRequired` true ya da false olmalı.' }, { status: 400 });
  }
  if (getAuthConfig().networkMode && !body.mfaRequired) {
    return NextResponse.json(
      { error: 'Ağ üzerinden erişilen kurulumda iki adımlı doğrulama her zaman zorunludur.' },
      { status: 409 },
    );
  }
  await configRepo.setAppSetting(
    getAppDb(),
    { key: AUTH_MFA_REQUIRED_SETTING_KEY, value: String(body.mfaRequired), updatedBy: auth.actor, updatedAt: Date.now() },
    newId(),
  );
  forgetMfaPolicy();
  return NextResponse.json({ mfaRequired: body.mfaRequired });
}

export const GET = withPermission('users.manage', getHandler);
export const POST = withPermission('users.manage', postHandler);
