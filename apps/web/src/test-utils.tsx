import { afterEach, vi } from 'vitest';

/**
 * Shared helpers for screen smoke tests (plan doc 15 §6, Phase 1c).
 *
 * Every client screen fetches in a `useEffect` on mount, and several read `next/navigation`
 * hooks (`usePathname`, `useSearchParams`) that throw outside a router. Both are traps stated in
 * the plan, and both are one-hour mistakes if a test author has to rediscover them. This module
 * exists so the 25 screens after the dashboard reference test do not each reinvent the fix.
 */

// --- fetch ------------------------------------------------------------------------------------

/** One canned outcome for a request whose pathname (query string ignored) matches a route key. */
export interface StubbedRoute {
  /** HTTP status. Defaults to 200. */
  status?: number;
  /** JSON body returned by `res.json()`. Ignored when `reject` or `pending` is set. */
  body?: unknown;
  /** Never resolves. Use to assert a screen's loading state. */
  pending?: boolean;
  /** Rejects the fetch itself (network failure), not a non-2xx response. */
  reject?: unknown;
}

function toResponse(route: StubbedRoute): Response {
  const status = route.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => route.body,
  } as Response;
}

/**
 * Installs `globalThis.fetch` for the current test. Screens fetch on mount (trap #2 in doc 15
 * §6) — an unstubbed test hits the real network and hangs or fails obscurely, so this must run
 * before the screen is rendered.
 *
 * Routes match on pathname only (origin and query string stripped), so one entry for
 * `/api/dashboard` also answers `/api/dashboard?x=1`. A request to a path with no matching route
 * rejects loudly rather than hanging, so a missing stub fails fast instead of timing out.
 */
export function stubFetch(routes: Record<string, StubbedRoute>): void {
  const impl = (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = (url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] ?? url) as string;
    const route = routes[path];
    if (!route) return Promise.reject(new Error(`stubFetch: no route registered for ${path}`));
    if (route.pending) return new Promise<Response>(() => {});
    if (route.reject !== undefined) return Promise.reject(route.reject);
    return Promise.resolve(toResponse(route));
  };
  vi.stubGlobal('fetch', vi.fn(impl));
}

// --- next/navigation ----------------------------------------------------------------------------

/**
 * Mutable state read by a test file's own `vi.mock('next/navigation', ...)` factory.
 *
 * Vitest only lets a mock factory close over identifiers whose name starts with `mock` — it is
 * how the hoisting transform tells a mock-safe reference apart from one that would be a
 * temporal-dead-zone error — which is why this is named `mockNavigation` and not something
 * friendlier. Usage in a test file:
 *
 * ```ts
 * import { mockNavigation } from '@/test-utils';
 * vi.mock('next/navigation', () => ({
 *   usePathname: () => mockNavigation.pathname,
 *   useSearchParams: () => mockNavigation.searchParams,
 *   useRouter: () => mockNavigation.router,
 * }));
 * ```
 */
export const mockNavigation = {
  pathname: '/',
  searchParams: new URLSearchParams(),
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() },
};

function resetMockNavigation(): void {
  mockNavigation.pathname = '/';
  mockNavigation.searchParams = new URLSearchParams();
  mockNavigation.router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() };
}

// --- cleanup ------------------------------------------------------------------------------------

/** Every test that imports this module gets a clean `fetch` stub and navigation state next test. */
afterEach(() => {
  vi.unstubAllGlobals();
  resetMockNavigation();
});
