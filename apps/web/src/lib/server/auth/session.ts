/**
 * Sessions (doc 18 §4). The cookie carries a random token; the database carries its SHA-256.
 * Liveness is decided by the pure rules in `@buybox/shared` against the row, never by the
 * cookie's own expiry — a cookie is only a claim.
 */
import { authRepo, newId, type AppDatabase } from '@buybox/db';
import {
  generateOpaqueToken,
  hashToken,
  isSessionLive,
  shouldTouchSession,
  type Role,
} from '@buybox/shared';
import { getAuthConfig, type RequestMeta } from './config';

export interface SessionUser {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: Role;
  readonly mustChangePassword: boolean;
  /** Has a second factor enrolled (doc 18 §5.1); where one is required and this is false, enrolment comes first. */
  readonly mfaEnrolled: boolean;
}

export interface SessionContext {
  readonly sessionId: string;
  readonly user: SessionUser;
}

/**
 * The session a cookie value names, if it is live and its user is active. Touches
 * `last_seen_at` at most once a minute. An expired row is deleted on sight rather than left for
 * the nightly prune, so a stolen cookie for it stops being worth a database lookup.
 */
export async function resolveSession(
  appDb: AppDatabase,
  token: string | undefined,
  nowMs: number = Date.now(),
): Promise<SessionContext | null> {
  if (token === undefined || token === '') return null;
  const found = await authRepo.getSessionWithUser(appDb, hashToken(token));
  if (found === undefined) return null;
  const { session, user } = found;

  if (!isSessionLive(session, nowMs, getAuthConfig().sessionIdleMs) || user.state !== 'active') {
    await authRepo.deleteSession(appDb, session.id, user.id);
    return null;
  }
  if (shouldTouchSession(session, nowMs)) await authRepo.touchSession(appDb, session.id, nowMs);

  return {
    sessionId: session.id,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      mfaEnrolled: user.totpEnabled || (user.smsEnabled && user.phoneVerifiedAt !== null),
    },
  };
}

/** Creates a session and returns the cookie token. The caller sets the cookie. */
export async function createSession(
  appDb: AppDatabase,
  userId: string,
  meta: RequestMeta,
  nowMs: number = Date.now(),
): Promise<{ readonly token: string; readonly maxAgeMs: number }> {
  const token = generateOpaqueToken();
  const maxAgeMs = getAuthConfig().sessionAbsoluteMs;
  await authRepo.insertSession(appDb, {
    id: newId(),
    tokenHash: hashToken(token),
    userId,
    createdAt: nowMs,
    lastSeenAt: nowMs,
    expiresAt: nowMs + maxAgeMs,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent,
  });
  return { token, maxAgeMs };
}
