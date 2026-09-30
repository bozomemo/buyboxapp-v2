/**
 * The users screen's list and _Yeni kullanıcı_ (doc 06 §10.4, doc 18 §3). `users.manage` only.
 * Never returns a password hash, a phone number or anything from the secret store.
 */
import { NextResponse } from 'next/server';
import { getAppDb } from '@/lib/server/db';
import { requestMeta } from '@/lib/server/auth/config';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';
import { createUser, listUserSummaries, UserActionError } from '@/lib/server/auth/users';
import { readJsonObject } from '@/lib/server/request-body';

export const dynamic = 'force-dynamic';

async function getHandler() {
  return NextResponse.json({ users: await listUserSummaries(getAppDb()) });
}

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const body = await readJsonObject(request);
  if (body === null) {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi: bir JSON nesnesi bekleniyordu.' }, { status: 400 });
  }
  try {
    const user = await createUser(
      getAppDb(),
      {
        username: body.username,
        displayName: body.displayName,
        role: body.role,
        temporaryPassword: body.temporaryPassword,
        phone: body.phone,
      },
      auth,
      requestMeta(request.headers),
    );
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof UserActionError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export const GET = withPermission('users.manage', getHandler);
export const POST = withPermission('users.manage', postHandler);
