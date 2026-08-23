/**
 * The UI half of the licence gate (docs/13-licensing.md §6, R-LIC-1). Every route redirects to
 * `/license` unless the install is licensed or inside its grace window.
 *
 * This is Next 16's `proxy.ts`, **not** `middleware.ts`: the middleware convention is
 * deprecated and renamed as of v16, and the two must not both exist. Proxy defaults to the
 * Node.js runtime — which this needs, for `node:crypto`'s Ed25519 primitives and for the
 * database read behind the status — and setting a `runtime` config option here would throw.
 *
 * This is a *commercial* control, not a security boundary — doc 13 §1. Anyone running the
 * install can delete this file. It exists so an unlicensed copy cannot be accidentally useful,
 * and so a lapsed one says so in plain Turkish instead of failing mysteriously.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isLicensedToRun } from '@buybox/shared';
import { getCachedLicenseStatus } from '@/lib/server/license';

/**
 * The licence screen itself and its API must stay reachable while unlicensed — otherwise the
 * operator has no way to paste the licence that would fix it.
 *
 * `/api/health` is exempt for a different reason (doc 14 §5.1): the installer polls it to decide
 * whether the service came up, and that happens before any licence has been pasted. Gating it
 * would make every first install report itself as failed. It exposes no business data.
 */
const EXEMPT_PREFIXES = ['/license', '/api/license', '/api/health'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  if (isLicensedToRun(await getCachedLicenseStatus())) return NextResponse.next();

  // An API caller gets a status code it can act on rather than an HTML redirect it would parse
  // as a successful response. 402 Payment Required is the one status that means exactly this.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'unlicensed', message: 'Lisans geçersiz veya süresi dolmuş.' },
      { status: 402 },
    );
  }

  return NextResponse.redirect(new URL('/license', request.url));
}

export const config = {
  // Without a matcher, proxy runs on every request including `_next/static` and `public/`
  // assets — which would gate the CSS of the very licence screen the gate redirects to.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
