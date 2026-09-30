/**
 * The protection (doc 18 §7.2). Every API route export is wrapped in `withPermission`; every page
 * calls `requirePermission`. The proxy's redirect in front of them is the convenience; this is
 * what refuses a request, and it re-reads the session itself so a request that never passed
 * through the proxy (CVE-2025-29927's class of bug) is refused all the same.
 *
 * `route-guard.test.ts` imports every route file and fails when an exported method is not wrapped,
 * so the next route added cannot quietly be the unprotected one (R-AUTH-2).
 */
import { hasPermission, userActor, type Permission } from '@buybox/shared';
import { NextResponse } from 'next/server';
import { getCookieNames } from './config';
import { isBootstrapMode, isValidSetupToken } from './bootstrap';
import { getRequestSession, readCookie } from './current';
import { isMfaRequired } from './mfa';
import { getAppDb } from '../db';
import type { SessionUser } from './session';

/** Actor for what the holder of the setup token does before any administrator exists. */
export const BOOTSTRAP_ACTOR = 'bootstrap';

export interface AuthContext {
  /** `null` only for setup-token access in bootstrap mode (`allowSetupAccess`). */
  readonly user: SessionUser | null;
  /** The session making the request; `null` with `user`. */
  readonly sessionId: string | null;
  /** What to write into `changed_by` / `updated_by` / `requested_by` (doc 18 §9.1). */
  readonly actor: string;
  /** For a handler whose second decision depends on the body — releasing a kill switch. */
  can(permission: Permission): boolean;
}

export interface GuardOptions {
  /**
   * Also admit the setup token while the install has no administrator — the setup wizard and the
   * licence screen only (doc 18 §8.1). Anyone so admitted can do everything these routes do;
   * that is what holding the token means.
   */
  readonly allowSetupAccess?: boolean;
  /**
   * Admit a user who must enrol a second factor and has not yet — the enrolment routes only
   * (doc 18 §5.1). Everyone else is refused until they have one.
   */
  readonly allowDuringEnrolment?: boolean;
}

export const PERMISSION_MARKER = Symbol.for('buybox.routePermission');

export type RouteHandler<C> = (request: Request, context: C, auth: AuthContext) => Response | Promise<Response>;
export type GuardedRoute<C> = ((request: Request, context: C) => Promise<Response>) & {
  readonly [PERMISSION_MARKER]: Permission;
};

/**
 * `error` carries the Turkish sentence, `code` the machine-readable reason. Every screen written
 * before sign-in existed shows `data.error` to the operator, so this way a refused click says
 * why in words on all of them, with no per-screen change.
 */
function deny(status: 401 | 403, code: string, message: string): Response {
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * Resolves who is asking and whether they may. `null` context means refused, with the response
 * to send. Shared by routes and pages so the two cannot disagree.
 */
async function authorise(
  request: Request,
  permission: Permission,
  options: GuardOptions,
): Promise<{ auth: AuthContext } | { refusal: Response }> {
  if (await isBootstrapMode()) {
    if (options.allowSetupAccess && (await isValidSetupToken(readCookie(request.headers, getCookieNames().setup)))) {
      return { auth: { user: null, sessionId: null, actor: BOOTSTRAP_ACTOR, can: () => true } };
    }
    return {
      refusal: deny(401, 'bootstrap_required', 'Bu kurulumda henüz yönetici yok. Önce /bootstrap ekranından ilk yöneticiyi oluşturun.'),
    };
  }

  const session = await getRequestSession(request);
  if (session === null) return { refusal: deny(401, 'unauthenticated', 'Oturum açmanız gerekiyor.') };
  const { user } = session;
  if (user.mustChangePassword) {
    return {
      refusal: deny(403, 'password_change_required', 'Devam etmeden önce geçici parolanızı değiştirmeniz gerekiyor.'),
    };
  }
  if (!user.mfaEnrolled && !options.allowDuringEnrolment && (await isMfaRequired(getAppDb()).catch(() => true))) {
    return {
      refusal: deny(403, 'mfa_enrolment_required', 'Devam etmeden önce iki adımlı doğrulamayı kurmanız gerekiyor.'),
    };
  }
  if (!hasPermission(user.role, permission)) {
    return { refusal: deny(403, 'forbidden', 'Bu işlem için yetkiniz yok.') };
  }
  return {
    auth: { user, sessionId: session.sessionId, actor: userActor(user.id), can: (p) => hasPermission(user.role, p) },
  };
}

export function withPermission<C = unknown>(
  permission: Permission,
  handler: RouteHandler<C>,
  options: GuardOptions = {},
): GuardedRoute<C> {
  const guarded = async (request: Request, context: C): Promise<Response> => {
    const result = await authorise(request, permission, options);
    if ('refusal' in result) return result.refusal;
    return handler(request, context, result.auth);
  };
  return Object.assign(guarded, { [PERMISSION_MARKER]: permission });
}

/** The permission a guarded export requires, or `undefined` for one that is not guarded. */
export function routePermission(value: unknown): Permission | undefined {
  if (typeof value !== 'function') return undefined;
  return (value as unknown as Record<symbol, Permission | undefined>)[PERMISSION_MARKER];
}

/**
 * doc 18 §6.1 — engaging a stop control needs `automation.stop` (the route's own permission);
 * **releasing** one sends prices to the marketplaces again and needs `prices.manage` as well.
 * Returns the refusal to send, or `null` when the change may go ahead.
 */
export function refuseRelease(auth: AuthContext, engaged: boolean): Response | null {
  if (engaged || auth.can('prices.manage')) return null;
  return deny(403, 'forbidden', 'Otomasyonu yeniden başlatmak için fiyat yönetimi yetkisi gerekir.');
}
