/**
 * The signed-in user of the request being handled.
 *
 * Route handlers read the cookie from the `Request` they were given (`getRequestSession`), not
 * from `next/headers`: it is the same header, it works outside Next's request scope (so a handler
 * can be called directly in a test), and it makes plain which request is being vouched for.
 * Server components have no `Request` and use `getPageSession`.
 */
import { getAppDb, isBootstrapped } from '../db';
import { getCookieNames } from './config';
import { resolveSession, type SessionContext } from './session';

/** The value of one cookie from a `Cookie` header, or `undefined`. */
export function readCookie(headers: Headers, name: string): string | undefined {
  const header = headers.get('cookie');
  if (header === null) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      const raw = part.slice(index + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}

async function sessionFromToken(token: string | undefined): Promise<SessionContext | null> {
  if (!isBootstrapped()) return null;
  try {
    return await resolveSession(getAppDb(), token);
  } catch {
    // A database that cannot be read cannot vouch for anyone.
    return null;
  }
}

export async function getRequestSession(request: Request): Promise<SessionContext | null> {
  return sessionFromToken(readCookie(request.headers, getCookieNames().session));
}

export async function getPageSession(): Promise<SessionContext | null> {
  const { cookies } = await import('next/headers');
  return sessionFromToken((await cookies()).get(getCookieNames().session)?.value);
}
