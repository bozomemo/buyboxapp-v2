/**
 * The web process's view of the auth deployment settings (doc 08 §15), plus the small helpers
 * every auth route needs: cookie options, the request's address and user agent, and recording a
 * sign-in log row.
 */
import { authRepo, newId, type AppDatabase } from '@buybox/db';
import { authCookieNames, clientAddress, parseAuthEnv, type AuthConfig } from '@buybox/shared';

export function getAuthConfig(): AuthConfig {
  return parseAuthEnv(process.env);
}

export function getCookieNames(): ReturnType<typeof authCookieNames> {
  return authCookieNames(getAuthConfig().networkMode);
}

export interface CookieOptions {
  readonly httpOnly: true;
  readonly sameSite: 'lax' | 'strict';
  readonly secure: boolean;
  readonly path: '/';
  readonly maxAge?: number;
}

/**
 * doc 18 §4.1. `Secure` exactly when the cookie is `__Host-` prefixed, i.e. on a network
 * install; a loopback install is plain HTTP and a Secure cookie would never come back.
 * `maxAge` in seconds, as the cookie API takes it. The session cookie itself carries the
 * absolute lifetime so a closed browser does not outlive the server-side row by accident, and
 * the row is still the authority: an expired row with a live cookie is signed out.
 */
export function cookieOptions(maxAgeMs?: number, sameSite: 'lax' | 'strict' = 'lax'): CookieOptions {
  const secure = getAuthConfig().networkMode;
  return {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    ...(maxAgeMs === undefined ? {} : { maxAge: Math.floor(maxAgeMs / 1000) }),
  };
}

export interface RequestMeta {
  /** `undefined` unless behind our own proxy (doc 18 §3.3). */
  readonly ip: string | undefined;
  /** Shortened: a label for humans on `/account` and the sign-in log, not a fingerprint. */
  readonly userAgent: string | null;
}

const USER_AGENT_MAX = 200;

export function requestMeta(headers: Headers): RequestMeta {
  const ua = headers.get('user-agent');
  return {
    ip: clientAddress(headers.get('x-forwarded-for'), getAuthConfig().trustProxy),
    userAgent: ua === null ? null : ua.slice(0, USER_AGENT_MAX),
  };
}

/**
 * Writes a sign-in log row. Never throws: a log write that fails must not turn a successful
 * sign-in into an error, nor a refused one into a crash. `detail` is for ids and role names —
 * callers must never put a password, code or token in it (R-AUTH-3).
 */
export async function recordAuthEvent(
  appDb: AppDatabase,
  event: authRepo.AuthEventName,
  options: {
    readonly userId: string | null;
    readonly actor: string;
    readonly meta: RequestMeta;
    readonly detail?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  try {
    await authRepo.recordAuthEvent(appDb, {
      id: newId(),
      at: Date.now(),
      event,
      userId: options.userId,
      actor: options.actor,
      ip: options.meta.ip ?? null,
      userAgent: options.meta.userAgent,
      detail: options.detail === undefined ? null : JSON.stringify(options.detail),
    });
  } catch {
    // Deliberately swallowed; see the doc comment.
  }
}
