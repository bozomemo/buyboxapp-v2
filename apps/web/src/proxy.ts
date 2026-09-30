/**
 * Every request's first stop, in doc 18 §7.1's order:
 *
 * 1. the Origin check on state-changing requests (doc 18 §4.3);
 * 2. sign-in — bootstrap mode, session, temporary password (`decideAccess`, doc 18 §7);
 * 3. the licence gate (docs/13-licensing.md §6, R-LIC-1);
 * 4. the module gate (doc 17 §1.3).
 *
 * This is Next 16's `proxy.ts`, **not** `middleware.ts`: the middleware convention is
 * deprecated and renamed as of v16, and the two must not both exist. Proxy defaults to the
 * Node.js runtime — which this needs, for `node:crypto` and for the database reads behind the
 * session and the licence — and setting a `runtime` config option here would throw.
 *
 * **Sign-in here is the convenience layer, not the protection** (doc 18 §4.2). It makes every
 * screen redirect the same way; the handlers re-check the session and the permission themselves
 * (12.4), because a bug of the CVE-2025-29927 kind — one header that skips the proxy entirely —
 * must not be enough to change a price. The licence gate remains a commercial control, not a
 * security boundary (doc 13 §1).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isLicensedToRun } from '@buybox/shared';
import { decideAccess, isAcceptableOrigin } from '@/lib/auth-access';
import { getCachedLicenseStatus } from '@/lib/server/license';
import { getCachedModules } from '@/lib/server/modules';
import { getAppDb } from '@/lib/server/db';
import { getAuthConfig, getCookieNames } from '@/lib/server/auth/config';
import { isBootstrapMode, isValidSetupToken } from '@/lib/server/auth/bootstrap';
import { resolveSession } from '@/lib/server/auth/session';
import { isMfaRequired } from '@/lib/server/auth/mfa';
import { moduleForPath } from '@/lib/module-routes';

/**
 * Exempt from the **licence** gate. The licence screen and its API must stay reachable while
 * unlicensed — otherwise there is no way to paste the licence that would fix it — but since
 * 2026-09-27 they are *not* exempt from sign-in (doc 13 §6, doc 18 §7.1): entering a licence is
 * an administrator's act, not a stranger's.
 *
 * `/api/health` is exempt for a different reason (doc 14 §5.1): the installer polls it to decide
 * whether the service came up, and that happens before any licence has been pasted. Gating it
 * would make every first install report itself as failed. It exposes no business data.
 *
 * `/api/metrics` is exempt for a sharper version of the same reason (doc 16 §3): a lapsed licence
 * is exactly a moment somebody needs to see what the machine is doing, and a 402 there would
 * blank every remote dashboard at precisely that moment. Like `/api/health` it exposes no
 * business data. On a server neither is reachable from outside: the reverse proxy does not
 * forward them (doc 14 §13.2).
 *
 * `/account/password` for the reason doc 18 §7.1 gives for sign-in as a whole — a lapsed licence
 * must never lock anyone out of their own account — and for a concrete one: a user holding a
 * temporary password is sent here by the sign-in check and would otherwise be sent to
 * `/license` by this one, which sends them back here. (The sign-in screens themselves never
 * reach this gate; they are exempt one step earlier.)
 */
const LICENSE_EXEMPT_PREFIXES = ['/license', '/api/license', '/account/password', '/account/mfa-setup', '/api/account/mfa'];

function isApi(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const config = getAuthConfig();

  if (!isAcceptableOrigin(request.method, request.headers.get('origin'), config.publicOrigin ?? request.nextUrl.origin)) {
    return NextResponse.json(
      { error: 'İstek bu uygulamanın kendi sayfasından gelmedi.', code: 'bad_origin' },
      { status: 403 },
    );
  }

  const names = getCookieNames();
  const bootstrapMode = await isBootstrapMode();
  const hasSetupAccess = bootstrapMode && (await isValidSetupToken(request.cookies.get(names.setup)?.value));
  const session = bootstrapMode
    ? null
    : await resolveSession(getAppDb(), request.cookies.get(names.session)?.value).catch(() => null);

  const mustEnrolMfa =
    session !== null && !session.user.mfaEnrolled && (await isMfaRequired(getAppDb()).catch(() => true));
  const decision = decideAccess({
    pathname,
    bootstrapMode,
    hasSetupAccess,
    session: session === null ? null : { mustChangePassword: session.user.mustChangePassword, mustEnrolMfa },
  });

  switch (decision.kind) {
    case 'exempt':
      return NextResponse.next();
    case 'redirect':
      return NextResponse.redirect(new URL(decision.to, request.url));
    case 'deny':
      // Same shape as the handlers' refusals (`guard.ts`): the sentence in `error`, which every
      // screen already shows, and the reason in `code`.
      return NextResponse.json({ error: decision.message, code: decision.error }, { status: decision.status });
    case 'continue':
      return licenceGate(request);
  }
}

async function licenceGate(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (LICENSE_EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  if (isLicensedToRun(await getCachedLicenseStatus())) return moduleGate(request);

  // An API caller gets a status code it can act on rather than an HTML redirect it would parse
  // as a successful response. 402 Payment Required is the one status that means exactly this.
  if (isApi(pathname)) {
    return NextResponse.json(
      { error: 'unlicensed', message: 'Lisans geçersiz veya süresi dolmuş.' },
      { status: 402 },
    );
  }

  return NextResponse.redirect(new URL('/license', request.url));
}

/**
 * The module gate (doc 17 §1.3), applied only once the licence gate has passed.
 *
 * A disabled module's API routes answer **409, reads included** — a page gone while its API still
 * writes would be the worst half-open state. Its screens redirect to the modules settings page,
 * which names what was disabled and is where it is switched back on; a redirect to the dashboard
 * would leave the operator wondering where the screen went.
 */
async function moduleGate(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const module = moduleForPath(pathname);
  if (module === null) return NextResponse.next();
  if ((await getCachedModules())[module]) return NextResponse.next();

  if (isApi(pathname)) {
    return NextResponse.json(
      {
        error: 'module_disabled',
        module,
        message: 'Bu özellik kapalı bir modüle ait. Ayarlar > Modüller ekranından açılabilir.',
      },
      { status: 409 },
    );
  }
  const target = new URL('/settings/modules', request.url);
  target.searchParams.set('disabled', module);
  return NextResponse.redirect(target);
}

export const config = {
  // Without a matcher, proxy runs on every request including `_next/static` and `public/`
  // assets — which would gate the CSS of the very sign-in screen the gate redirects to.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
