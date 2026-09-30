/**
 * doc 18 §7.1's order of checks, before the licence and module gates.
 */
import { describe, expect, it } from 'vitest';
import { decideAccess, isAcceptableOrigin, safeNextPath, type AccessInput } from './auth-access';

const signedIn = { mustChangePassword: false };
const base: AccessInput = { pathname: '/', bootstrapMode: false, hasSetupAccess: false, session: signedIn };

describe('decideAccess', () => {
  const cases: readonly { name: string; input: Partial<AccessInput>; expected: ReturnType<typeof decideAccess> }[] = [
    // Exempt paths: always reachable, in every state.
    { name: '/login with no session', input: { pathname: '/login', session: null }, expected: { kind: 'exempt' } },
    { name: '/api/auth/login with no session', input: { pathname: '/api/auth/login', session: null }, expected: { kind: 'exempt' } },
    { name: '/api/health in bootstrap mode', input: { pathname: '/api/health', bootstrapMode: true, session: null }, expected: { kind: 'exempt' } },
    { name: '/api/metrics with no session', input: { pathname: '/api/metrics', session: null }, expected: { kind: 'exempt' } },
    { name: '/bootstrap in bootstrap mode', input: { pathname: '/bootstrap', bootstrapMode: true, session: null }, expected: { kind: 'exempt' } },
    { name: 'a path that only starts with an exempt name is not exempt', input: { pathname: '/loginx', session: null }, expected: { kind: 'redirect', to: '/login?next=%2Floginx' } },

    // Bootstrap mode.
    { name: 'bootstrap: a screen goes to /bootstrap', input: { pathname: '/listings', bootstrapMode: true, session: null }, expected: { kind: 'redirect', to: '/bootstrap' } },
    { name: 'bootstrap: /setup without the token goes to /bootstrap', input: { pathname: '/setup', bootstrapMode: true, session: null }, expected: { kind: 'redirect', to: '/bootstrap' } },
    { name: 'bootstrap: /setup with the token continues', input: { pathname: '/setup', bootstrapMode: true, hasSetupAccess: true, session: null }, expected: { kind: 'continue' } },
    { name: 'bootstrap: /api/setup/database/test with the token continues', input: { pathname: '/api/setup/database/test', bootstrapMode: true, hasSetupAccess: true, session: null }, expected: { kind: 'continue' } },
    { name: 'bootstrap: /license with the token continues', input: { pathname: '/license', bootstrapMode: true, hasSetupAccess: true, session: null }, expected: { kind: 'continue' } },
    { name: 'bootstrap: the token does not open the price controls', input: { pathname: '/api/listings/1/manual-price', bootstrapMode: true, hasSetupAccess: true, session: null }, expected: { kind: 'deny', status: 401, error: 'bootstrap_required', message: expect.any(String) as unknown as string } },
    { name: 'bootstrap: a stale session does not bypass it', input: { pathname: '/', bootstrapMode: true, session: signedIn }, expected: { kind: 'redirect', to: '/bootstrap' } },

    // Signed out.
    { name: 'no session: a screen goes to /login with next', input: { pathname: '/listings', session: null }, expected: { kind: 'redirect', to: '/login?next=%2Flistings' } },
    { name: 'no session: an API call is 401', input: { pathname: '/api/listings', session: null }, expected: { kind: 'deny', status: 401, error: 'unauthenticated', message: expect.any(String) as unknown as string } },
    { name: 'no session: /license is not exempt from sign-in any more', input: { pathname: '/license', session: null }, expected: { kind: 'redirect', to: '/login?next=%2Flicense' } },
    { name: 'no session: the setup wizard needs a session once an admin exists', input: { pathname: '/setup', session: null, hasSetupAccess: true }, expected: { kind: 'redirect', to: '/login?next=%2Fsetup' } },

    // Temporary password.
    { name: 'temporary password: a screen goes to /account/password', input: { pathname: '/listings', session: { mustChangePassword: true } }, expected: { kind: 'redirect', to: '/account/password' } },
    { name: 'temporary password: /account/password continues', input: { pathname: '/account/password', session: { mustChangePassword: true } }, expected: { kind: 'continue' } },
    { name: 'temporary password: an API call is 403', input: { pathname: '/api/kill-switch', session: { mustChangePassword: true } }, expected: { kind: 'deny', status: 403, error: 'password_change_required', message: expect.any(String) as unknown as string } },
    { name: 'temporary password: /api/auth/password is exempt', input: { pathname: '/api/auth/password', session: { mustChangePassword: true } }, expected: { kind: 'exempt' } },

    // Signed in.
    { name: 'signed in: continues to the licence gate', input: { pathname: '/listings' }, expected: { kind: 'continue' } },
    { name: 'signed in: /license continues to the licence gate', input: { pathname: '/license' }, expected: { kind: 'continue' } },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(decideAccess({ ...base, ...input })).toEqual(expected);
  });
});

describe('safeNextPath', () => {
  const cases: readonly [string | null, string][] = [
    ['/listings?marketplace=TY', '/listings?marketplace=TY'],
    [null, '/'],
    ['', '/'],
    ['listings', '/'],
    ['//evil.example/x', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example', '/'],
    ['/login?next=/x', '/'],
    ['/bootstrap', '/'],
  ];
  it.each(cases)('%j → %j', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });
});

describe('isAcceptableOrigin', () => {
  const origin = 'https://fiyat.example.com.tr';
  const cases: readonly { method: string; header: string | null; ok: boolean }[] = [
    { method: 'GET', header: null, ok: true },
    { method: 'HEAD', header: 'https://evil.example', ok: true },
    { method: 'POST', header: origin, ok: true },
    { method: 'POST', header: 'https://evil.example', ok: false },
    { method: 'POST', header: null, ok: false },
    { method: 'DELETE', header: 'http://fiyat.example.com.tr', ok: false },
    { method: 'put', header: origin, ok: true },
    { method: 'PATCH', header: 'null', ok: false },
  ];
  it.each(cases)('$method with Origin $header → $ok', ({ method, header, ok }) => {
    expect(isAcceptableOrigin(method, header, origin)).toBe(ok);
  });
});
