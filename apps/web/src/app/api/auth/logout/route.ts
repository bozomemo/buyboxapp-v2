/** Sign out: deletes the session row, not only the cookie (doc 18 §4.1). */
import { NextResponse } from 'next/server';
import { authRepo } from '@buybox/db';
import { userActor } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';
import { cookieOptions, getCookieNames, recordAuthEvent, requestMeta } from '@/lib/server/auth/config';
import { getRequestSession } from '@/lib/server/auth/current';

export async function POST(request: Request) {
  const current = await getRequestSession(request);
  if (current !== null) {
    const appDb = getAppDb();
    await authRepo.deleteSession(appDb, current.sessionId, current.user.id);
    await recordAuthEvent(appDb, 'logout', {
      userId: current.user.id,
      actor: userActor(current.user.id),
      meta: requestMeta(request.headers),
    });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getCookieNames().session, '', cookieOptions(0));
  return response;
}
