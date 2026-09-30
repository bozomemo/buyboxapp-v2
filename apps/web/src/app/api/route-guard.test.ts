// @vitest-environment node
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, runMigrations } from '@buybox/db';
import { hasPermission, type Permission, type Role } from '@buybox/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { routePermission } from '@/lib/server/auth/guard';
import { ensureSetupToken, forgetAdminCache, readSetupToken } from '@/lib/server/auth/bootstrap';
import { signIn } from '@/lib/server/auth/test-auth';

/**
 * R-AUTH-2 and R-AUTH-10 (doc 18 §7.2, §6.2), over every route file there is — walked, not
 * listed, so the route added next month is held to this without anyone remembering to add it.
 *
 * 1. Every exported method is wrapped in `withPermission`, unless its route is one of the few
 *    that authenticate themselves (sign-in, bootstrap) or are machine-local (health, metrics).
 * 2. Reads need `view`; nothing that writes needs only `view`.
 * 3. The handler, not the proxy, refuses: no session → 401; a role without the permission → 403,
 *    for every role and every guarded export. Requests go straight to the handler here — there
 *    is no proxy in front of them — which is exactly the case this has to hold for.
 * 4. With no administrator, everything guarded is refused except the setup routes, which the
 *    setup token opens.
 */
const API_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const SELF_AUTHENTICATING = new Set([
  'auth/login',
  'auth/logout',
  'auth/me',
  'auth/password',
  'auth/mfa',
  'auth/mfa/sms',
  'bootstrap',
  'bootstrap/verify',
  'bootstrap/admin',
  'health',
  'metrics',
]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === 'route.ts' ? [full] : [];
  });
}

interface Export {
  readonly route: string;
  readonly method: (typeof METHODS)[number];
  readonly handler: (request: Request, context: unknown) => Promise<Response>;
  readonly permission: Permission | undefined;
}

const exportsByRoute: Export[] = [];
let dir: string;
const cookies: Partial<Record<Role, string>> = {};
const savedEnv = { ...process.env };

function useDatabase(file: string): void {
  process.env.DATABASE_URL = `file:${file}`;
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  forgetAdminCache();
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-route-guard-'));
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  process.env.BUYBOX_DATA_DIR = dir;
  for (const name of ['users.db', 'empty.db']) {
    const db = createDb(`file:${path.join(dir, name)}`, 'sqlite');
    await runMigrations(db);
    if (name === 'users.db') {
      for (const role of ['admin', 'price_manager', 'viewer'] as const) cookies[role] = await signIn(db, role);
    }
    db.close();
  }
  useDatabase(path.join(dir, 'users.db'));

  for (const file of routeFiles(API_DIR)) {
    const route = path.relative(API_DIR, path.dirname(file)).replace(/\\/g, '/');
    const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
    for (const method of METHODS) {
      const handler = mod[method];
      if (typeof handler !== 'function') continue;
      exportsByRoute.push({
        route,
        method,
        handler: handler as Export['handler'],
        permission: routePermission(handler),
      });
    }
  }
}, 60_000);

afterAll(() => {
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  forgetAdminCache();
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

function call(e: Export, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== undefined) headers.cookie = cookie;
  const init: RequestInit = e.method === 'GET' ? { headers } : { method: e.method, headers, body: '{}' };
  return e.handler(new Request('http://localhost/api/x?id=x&cardId=x', init), {
    params: Promise.resolve({ id: 'x', marketplace: 'trendyol', ref: 'x', code: 'x' }),
  });
}

const guarded = () => exportsByRoute.filter((e) => e.permission !== undefined);

/**
 * The only departures from "reads need view, writes need more", each for a stated reason:
 * - the user list, the sign-in log and the second-factor policy are read with `users.manage`:
 *   the first two hold personal data — names, addresses, user agents (doc 18 §10) — and the third
 *   belongs to the screen that sets it;
 * - `POST /api/account` ends *one's own* sessions and devices, and `POST /api/account/mfa`
 *   enrols *one's own* second factor — both things every role must be able to do, and both
 *   routes scope every query to the caller.
 */
const RESTRICTED_READS = new Set(['users', 'users/activity', 'users/policy']);
const SELF_SERVICE_WRITES = new Set(['account', 'account/mfa']);

describe('every route export is guarded (R-AUTH-2)', () => {
  it('finds the routes', () => {
    expect(exportsByRoute.length).toBeGreaterThan(120);
  });

  it('wraps every export outside the self-authenticating routes', () => {
    const unguarded = exportsByRoute
      .filter((e) => e.permission === undefined && !SELF_AUTHENTICATING.has(e.route))
      .map((e) => `${e.method} ${e.route}`);
    expect(unguarded).toEqual([]);
  });

  it('reads need view (setup excepted); writes never need only view', () => {
    const wrong = guarded().flatMap((e) => {
      const setup = e.route === 'setup' || e.route.startsWith('setup/');
      if (e.method === 'GET' && !setup && e.permission !== 'view' && !RESTRICTED_READS.has(e.route)) {
        return [`${e.method} ${e.route}: ${e.permission}`];
      }
      if (e.method !== 'GET' && e.permission === 'view' && !SELF_SERVICE_WRITES.has(e.route)) {
        return [`${e.method} ${e.route}: view`];
      }
      return [];
    });
    expect(wrong).toEqual([]);
  });
});

describe('the handler refuses (R-AUTH-1, R-AUTH-10)', () => {
  it('401 without a session, on every guarded export', async () => {
    const statuses = await Promise.all(guarded().map(async (e) => `${e.method} ${e.route} ${(await call(e)).status}`));
    expect(statuses.filter((s) => !s.endsWith(' 401'))).toEqual([]);
  });

  for (const role of ['viewer', 'price_manager'] as const) {
    it(`403 for a ${role} on every export their role does not grant`, async () => {
      const refused = guarded().filter((e) => !hasPermission(role, e.permission!));
      expect(refused.length).toBeGreaterThan(0);
      const statuses = await Promise.all(
        refused.map(async (e) => `${e.method} ${e.route} ${(await call(e, cookies[role])).status}`),
      );
      expect(statuses.filter((s) => !s.endsWith(' 403'))).toEqual([]);
    });
  }

  it('a viewer cannot write anything at all', () => {
    const viewerWrites = guarded().filter(
      (e) => e.method !== 'GET' && hasPermission('viewer', e.permission!) && !SELF_SERVICE_WRITES.has(e.route),
    );
    expect(viewerWrites.map((e) => `${e.method} ${e.route}`)).toEqual([]);
  });
});

describe('bootstrap mode (doc 18 §8.1)', () => {
  it('refuses everything guarded, and the setup token opens only the setup and licence routes', async () => {
    useDatabase(path.join(dir, 'empty.db'));
    try {
      await ensureSetupToken({ regenerate: true });
      const token = await readSetupToken();
      const setupCookie = `bb_setup=${token}`;
      const opened = new Set<string>();
      for (const e of guarded()) {
        expect((await call(e)).status, `${e.method} ${e.route} with no token`).toBe(401);
        // Past the guard is all this asks. A handler that then throws on the empty test body got
        // past it too — that is a validation question for the route, not an access one.
        const status = await call(e, setupCookie).then(
          (response) => response.status,
          () => 500,
        );
        if (status !== 401) opened.add(e.route.split('/')[0]!);
      }
      expect([...opened].sort()).toEqual(['license', 'setup']);
    } finally {
      useDatabase(path.join(dir, 'users.db'));
    }
  });
});
