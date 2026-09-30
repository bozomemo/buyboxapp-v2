/**
 * Session lifetime rules (docs/18-authentication-and-access.md §4.1). Pure: the clock is passed in.
 */
import { AUTH_SESSION_TOUCH_INTERVAL_MS } from './constants.js';

export interface SessionTimes {
  readonly lastSeenAt: number;
  /** The absolute limit, fixed at sign-in. */
  readonly expiresAt: number;
}

/** Live until the absolute limit **and** not idle past `idleMs` — whichever comes first. */
export function isSessionLive(session: SessionTimes, nowMs: number, idleMs: number): boolean {
  return nowMs < session.expiresAt && nowMs - session.lastSeenAt < idleMs;
}

/** Write `last_seen_at` at most once per interval, so browsing the grids does not write per request. */
export function shouldTouchSession(session: SessionTimes, nowMs: number): boolean {
  return nowMs - session.lastSeenAt >= AUTH_SESSION_TOUCH_INTERVAL_MS;
}

/**
 * doc 18 §3.3 — `X-Forwarded-For` is honoured only behind our own proxy, and then only its
 * **last** entry: that is the one Caddy appended. Everything before it is whatever the client
 * chose to send. Returns `undefined` when the address is unknown, which callers treat as
 * "skip the per-address limit" — never as `127.0.0.1`, which would lock out everyone at once.
 */
export function clientAddress(forwardedFor: string | null, trustProxy: boolean): string | undefined {
  if (!trustProxy || forwardedFor === null) return undefined;
  const entries = forwardedFor.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '');
  return entries.at(-1);
}
