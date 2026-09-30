/**
 * Test support: a real user and a real session in the test's own database, so route tests go
 * through the same guard production does instead of around it. Imported only by `*.test.ts`.
 */
import { authRepo, newId, type AppDatabase } from '@buybox/db';
import { authCookieNames, type Role } from '@buybox/shared';
import { createSession } from './session';

/** Creates an active user with `role` and a session for them; returns the `Cookie` header value. */
export async function signIn(appDb: AppDatabase, role: Role = 'admin'): Promise<string> {
  const id = newId();
  const now = Date.now();
  await authRepo.insertUser(appDb, {
    id,
    username: `test-${role}-${id.slice(-8)}`.replace(/_/g, '-'),
    displayName: `Test ${role}`,
    role,
    state: 'active',
    // Never verified in these tests: they sign in by session, not by password.
    passwordHash: 'scrypt$15$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA',
    mustChangePassword: false,
    passwordChangedAt: now,
    totpEnabled: false,
    totpLastStep: null,
    totpPendingSince: null,
    phoneE164: null,
    phoneVerifiedAt: null,
    smsEnabled: false,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    createdBy: 'cli',
    updatedBy: 'cli',
  });
  const { token } = await createSession(appDb, id, { ip: undefined, userAgent: 'test' }, now);
  return `${authCookieNames(false).session}=${token}`;
}

/** The same request with `cookie` added. */
export function withCookie(request: Request, cookie: string): Request {
  const headers = new Headers(request.headers);
  headers.set('cookie', cookie);
  return new Request(request, { headers });
}

/** A GET to `url` carrying `cookie` — for handlers the old tests called with no request at all. */
export function getRequest(url: string, cookie: string): Request {
  return new Request(url, { headers: { cookie } });
}

/** The second argument Next passes a route handler. */
export function routeContext<P extends Record<string, string>>(params: P = {} as P): { params: Promise<P> } {
  return { params: Promise.resolve(params) };
}
