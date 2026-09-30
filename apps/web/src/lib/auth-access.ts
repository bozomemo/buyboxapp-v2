/**
 * What `proxy.ts` does with a request before the licence and module gates (doc 18 §7.1), as a
 * pure function so every branch is table-tested (`auth-access.test.ts`) without a server.
 *
 * The proxy is the convenience layer, not the protection (doc 18 §4.2): it redirects a browser
 * without a session to `/login` so every screen behaves the same way. The per-handler check
 * (12.4) is what actually refuses a request. Both read the same session.
 */

/** Signing in, bootstrapping, and the two machine-local endpoints (doc 18 §7.3). */
const AUTH_EXEMPT_PREFIXES = ['/login', '/api/auth', '/bootstrap', '/api/bootstrap', '/api/health', '/api/metrics'];

/**
 * What the holder of the setup token may reach while the install has no administrator: the
 * database step of the wizard (a fresh checkout has no database to put a user in yet) and the
 * licence screen the wizard is gated behind (doc 13 §6). Nothing that touches prices.
 */
const BOOTSTRAP_SETUP_PREFIXES = ['/setup', '/api/setup', '/license', '/api/license'];

/** Reachable by a signed-in user who must change a temporary password first (doc 18 §3.2). */
const PASSWORD_CHANGE_PREFIXES = ['/account/password'];

/** Reachable by a signed-in user who must enrol a second factor first (doc 18 §5.1). */
const MFA_ENROLMENT_PREFIXES = ['/account/mfa-setup', '/api/account/mfa'];

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export interface AccessInput {
  readonly pathname: string;
  /** No database configured, or no active Yönetici in it (doc 18 §8.1). */
  readonly bootstrapMode: boolean;
  /** A valid setup-token cookie. Only meaningful in bootstrap mode. */
  readonly hasSetupAccess: boolean;
  readonly session: {
    readonly mustChangePassword: boolean;
    /** A second factor is required here and this user has none yet (doc 18 §5.1). */
    readonly mustEnrolMfa?: boolean;
  } | null;
}

export type AccessDecision =
  /** Exempt from sign-in **and** from the licence and module gates. */
  | { readonly kind: 'exempt' }
  /** Signed in (or setup access): go on to the licence and module gates. */
  | { readonly kind: 'continue' }
  | { readonly kind: 'redirect'; readonly to: string }
  | { readonly kind: 'deny'; readonly status: 401 | 403; readonly error: string; readonly message: string };

function isApi(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export function decideAccess(input: AccessInput): AccessDecision {
  const { pathname } = input;
  if (matchesPrefix(pathname, AUTH_EXEMPT_PREFIXES)) return { kind: 'exempt' };

  if (input.bootstrapMode) {
    if (input.hasSetupAccess && matchesPrefix(pathname, BOOTSTRAP_SETUP_PREFIXES)) return { kind: 'continue' };
    return isApi(pathname)
      ? {
          kind: 'deny',
          status: 401,
          error: 'bootstrap_required',
          message: 'Bu kurulumda henüz yönetici yok. Önce /bootstrap ekranından ilk yöneticiyi oluşturun.',
        }
      : { kind: 'redirect', to: '/bootstrap' };
  }

  if (input.session === null) {
    return isApi(pathname)
      ? { kind: 'deny', status: 401, error: 'unauthenticated', message: 'Oturum açmanız gerekiyor.' }
      : { kind: 'redirect', to: `/login?next=${encodeURIComponent(pathname)}` };
  }

  if (input.session.mustChangePassword && !matchesPrefix(pathname, PASSWORD_CHANGE_PREFIXES)) {
    return isApi(pathname)
      ? {
          kind: 'deny',
          status: 403,
          error: 'password_change_required',
          message: 'Devam etmeden önce geçici parolanızı değiştirmeniz gerekiyor.',
        }
      : { kind: 'redirect', to: '/account/password' };
  }

  // After the password, so a new user on a network install changes the temporary password
  // first and then enrols — two screens, in the order they make sense.
  if (input.session.mustEnrolMfa && !matchesPrefix(pathname, MFA_ENROLMENT_PREFIXES)) {
    return isApi(pathname)
      ? {
          kind: 'deny',
          status: 403,
          error: 'mfa_enrolment_required',
          message: 'Devam etmeden önce iki adımlı doğrulamayı kurmanız gerekiyor.',
        }
      : { kind: 'redirect', to: '/account/mfa-setup' };
  }

  return { kind: 'continue' };
}

/**
 * Where to go after signing in. Only a same-site path is accepted — `/listings?x=1`, never
 * `//evil.example` or `https://…` — or `/login?next=` becomes an open redirect.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (raw.startsWith('/login') || raw.startsWith('/bootstrap')) return '/';
  return raw;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * doc 18 §4.3 — a state-changing request must carry an `Origin` equal to ours. SameSite=Lax
 * already keeps the cookie off a cross-site POST; this is the second lock, and the one that also
 * covers the sign-in form itself (login CSRF), which has no session cookie to withhold.
 *
 * `expectedOrigin` is `PUBLIC_ORIGIN` on a network install and the request's own origin on a
 * loopback one. A missing `Origin` is refused: every browser this app supports sends one on a
 * POST, so its absence means a non-browser client, which has no business changing prices without
 * one either.
 */
export function isAcceptableOrigin(method: string, originHeader: string | null, expectedOrigin: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  return originHeader !== null && originHeader === expectedOrigin;
}
