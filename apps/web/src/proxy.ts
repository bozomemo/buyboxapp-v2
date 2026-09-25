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
import { getCachedModules } from '@/lib/server/modules';
import { moduleForPath } from '@/lib/module-routes';

/**
 * The licence screen itself and its API must stay reachable while unlicensed — otherwise the
 * operator has no way to paste the licence that would fix it.
 *
 * `/api/health` is exempt for a different reason (doc 14 §5.1): the installer polls it to decide
 * whether the service came up, and that happens before any licence has been pasted. Gating it
 * would make every first install report itself as failed. It exposes no business data.
 *
 * `/api/metrics` is exempt for a sharper version of the same reason (doc 16 §3): a lapsed licence
 * is exactly a moment somebody needs to see what the machine is doing, and a 402 there would
 * blank every remote dashboard at precisely that moment. Monitoring that switches itself off
 * when the news is bad is worse than no monitoring, because it is trusted. Like `/api/health` it
 * exposes no business data — counts, states and durations only, never a price (doc 16 §3.2).
 */
const EXEMPT_PREFIXES = ['/license', '/api/license', '/api/health', '/api/metrics'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  if (isLicensedToRun(await getCachedLicenseStatus())) return moduleGate(request);

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

  if (pathname.startsWith('/api/')) {
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
  // assets — which would gate the CSS of the very licence screen the gate redirects to.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
