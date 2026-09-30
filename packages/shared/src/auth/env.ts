/**
 * Authentication deployment settings (docs/08-configuration-and-constants.md §15).
 *
 * Kept apart from `BootstrapEnvSchema` on purpose: that schema *requires* a database, and
 * sign-in has to work — the bootstrap page at least — before one is configured. Everything here
 * is optional with a default; setting `PUBLIC_ORIGIN` is what turns an install into a network
 * install (doc 14 §13.2).
 */
import { z } from 'zod';
import {
  AUTH_SESSION_ABSOLUTE_MS_DEFAULT,
  AUTH_SESSION_IDLE_MS_DEFAULT,
  AUTH_SMS_DAILY_CAP_DEFAULT,
  AUTH_TRUSTED_DEVICE_DAYS_DEFAULT,
} from './constants.js';

const positiveInt = (fallback: number) => z.coerce.number().int().positive().optional().default(fallback);

/**
 * An origin, not a URL: scheme, host and optional port, nothing after. `https://` only — a
 * network install serves its session cookie over TLS or not at all (R-DEP-16). A trailing slash
 * is tolerated and dropped, since it is what people paste.
 */
const PublicOrigin = z
  .string()
  .transform((value) => value.trim().replace(/\/+$/, ''))
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.origin === value;
    } catch {
      return false;
    }
  }, 'PUBLIC_ORIGIN must be an https:// origin with no path, e.g. https://fiyat.example.com.tr');

export const AuthEnvSchema = z.object({
  PUBLIC_ORIGIN: z.union([z.literal(''), PublicOrigin]).optional(),
  TRUST_PROXY: z.union([z.literal('0'), z.literal('1')]).optional().default('0'),
  AUTH_SESSION_IDLE_MS: positiveInt(AUTH_SESSION_IDLE_MS_DEFAULT),
  AUTH_SESSION_ABSOLUTE_MS: positiveInt(AUTH_SESSION_ABSOLUTE_MS_DEFAULT),
  AUTH_TRUSTED_DEVICE_DAYS: z.coerce.number().int().min(0).optional().default(AUTH_TRUSTED_DEVICE_DAYS_DEFAULT),
  AUTH_SMS_DAILY_CAP: positiveInt(AUTH_SMS_DAILY_CAP_DEFAULT),
});

export interface AuthConfig {
  /** Set ⇔ network install. */
  readonly publicOrigin: string | undefined;
  readonly networkMode: boolean;
  readonly trustProxy: boolean;
  readonly sessionIdleMs: number;
  readonly sessionAbsoluteMs: number;
  readonly trustedDeviceDays: number;
  readonly smsDailyCap: number;
}

/** Throws with the variable named when a value is set but unusable. */
export function parseAuthEnv(env: NodeJS.ProcessEnv): AuthConfig {
  const parsed = AuthEnvSchema.parse(env);
  const publicOrigin = parsed.PUBLIC_ORIGIN === '' ? undefined : parsed.PUBLIC_ORIGIN;
  return {
    publicOrigin,
    networkMode: publicOrigin !== undefined,
    trustProxy: parsed.TRUST_PROXY === '1',
    sessionIdleMs: parsed.AUTH_SESSION_IDLE_MS,
    sessionAbsoluteMs: parsed.AUTH_SESSION_ABSOLUTE_MS,
    trustedDeviceDays: parsed.AUTH_TRUSTED_DEVICE_DAYS,
    smsDailyCap: parsed.AUTH_SMS_DAILY_CAP,
  };
}

/**
 * Cookie names (doc 18 §4.1). `__Host-` only on a network install: the browser refuses such a
 * cookie unless it is Secure, and a loopback install is plain `http://127.0.0.1`.
 */
export function authCookieNames(networkMode: boolean): {
  readonly session: string;
  readonly setup: string;
  /** The second-factor challenge between password and code (doc 18 §5.1). */
  readonly mfa: string;
  /** A trusted device (doc 18 §5.1). */
  readonly device: string;
} {
  const prefix = networkMode ? '__Host-' : '';
  return {
    session: `${prefix}bb_session`,
    setup: `${prefix}bb_setup`,
    mfa: `${prefix}bb_mfa`,
    device: `${prefix}bb_device`,
  };
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * R-DEP-16 (doc 14 §13.2): what must stop the service from starting, as sentences for the log.
 * Empty means the deployment is coherent.
 *
 * - A value in `AuthEnvSchema` that is set but unusable — above all a `PUBLIC_ORIGIN` that is not
 *   an `https://` origin: a network install without TLS would serve its session cookie in clear.
 * - A network install whose service is not bound to loopback. The reverse proxy is the only
 *   thing that may listen on the network (doc 14 §4.4); `HOSTNAME` unset is not loopback, because
 *   Next then binds every interface.
 *
 * Pure: the caller decides what "refuse" means (the web process logs and exits).
 */
export function authDeploymentProblems(env: NodeJS.ProcessEnv): string[] {
  const parsed = AuthEnvSchema.safeParse(env);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => `${String(issue.path[0] ?? 'env')}: ${issue.message}`);
  }
  const problems: string[] = [];
  const networkMode = parsed.data.PUBLIC_ORIGIN !== undefined && parsed.data.PUBLIC_ORIGIN !== '';
  const hostname = (env.HOSTNAME ?? '').trim();
  if (networkMode && !LOOPBACK_HOSTS.has(hostname)) {
    problems.push(
      `HOSTNAME="${hostname}" with PUBLIC_ORIGIN set: a network install must bind 127.0.0.1 and be reached through the reverse proxy (doc 14 §4.4, §13.2).`,
    );
  }
  return problems;
}
