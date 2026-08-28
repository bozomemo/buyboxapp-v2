/**
 * A `fetch`-shaped HTTP client backed by a real headless Chromium (Playwright) — the default
 * `fetchFn` for `TrendyolPublicPageSource` since 2026-08-17.
 *
 * Replaces `node-https-fetch.ts`. That module's own doc comment records why it didn't hold up:
 * Cloudflare's bot management is fingerprinting the TLS ClientHello, and every Node-native HTTP
 * client (`fetch`/undici, Node's core `https`) shares Node's OpenSSL TLS stack and gets scored
 * the same regardless of headers. Measured 2026-08-17: 10/10 consecutive product pages that had
 * been failing ~100% of the time through any Node HTTP client returned 200 through this module.
 * A real browser's TLS handshake and JS execution are what Trendyol's bot management is actually
 * built to accept — this is the "browser impersonation" exception already authorised for this
 * source (CLAUDE.md, api-references §1.6, 2026-08-17) taken literally, rather than approximated
 * via headers on a non-browser client.
 *
 * One browser and one page are launched lazily on first use and reused for the fetcher's whole
 * lifetime — but a browser that dies under a long run is replaced rather than poisoning every
 * later fetch; see `getSession`.
 *
 * `TrendyolPublicPageSource`'s own rate limiter already serialises calls to a handful
 * per minute (doc 08 §12), so a page pool would add resource cost and complexity for no
 * throughput benefit — every call awaits the previous one's navigation to finish regardless.
 * Callers must call `close()` when done (worker shutdown) or the browser process leaks.
 */
import { chromium, type Browser, type Page } from 'playwright';
import type { NodeFetchInit, NodeFetchResponse } from './node-https-fetch.js';

export interface PlaywrightFetcher {
  readonly fetch: (url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>;
  readonly close: () => Promise<void>;
}

/** The one browser and page this fetcher reuses for its lifetime. */
export interface PlaywrightSession {
  readonly browser: Browser;
  readonly page: Page;
}

/**
 * How a session is obtained. Injectable **only** so the crash-recovery path in `getSession` can
 * be exercised without killing a real Chromium out from under a test; production always uses
 * `launchChromium`.
 */
export type PlaywrightLauncher = (userAgent: string | undefined) => Promise<PlaywrightSession>;

const DEFAULT_TIMEOUT_MS = 15_000;

async function launchChromium(userAgent: string | undefined): Promise<PlaywrightSession> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(userAgent ? { userAgent } : {});
  return { browser, page };
}

/** Launches nothing until the first `fetch()` call — a source that's never invoked never pays for a browser. */
export function createPlaywrightFetcher(
  launch: PlaywrightLauncher = launchChromium,
): PlaywrightFetcher {
  let session: Promise<PlaywrightSession> | undefined;
  let disposed = false;

  function getSession(userAgent: string | undefined): Promise<PlaywrightSession> {
    // `close()` is the caller saying it is finished (worker shutdown). A straggler fetch after
    // that must fail, never quietly launch a browser nobody is left to close.
    if (disposed) {
      return Promise.reject(new Error('Trendyol Playwright fetcher has been closed'));
    }
    if (session) {
      const existing = session;
      return existing.then((live) => {
        if (live.browser.isConnected() && !live.page.isClosed()) return live;
        // A browser that launched successfully and *later died* is not a launch failure, and
        // caching it as one is what the check below would otherwise do. Measured on the live
        // install 2026-08-28: Chromium disappeared after ~1,400 navigations on the shared page
        // and every fetch for the rest of the run threw `Target page, context or browser has
        // been closed` — 2,700 tracked products in a row, each still spending a rate-limit
        // token and writing a failure row, with only a worker restart able to clear it.
        //
        // Relaunching is safe because this fetcher holds no state worth preserving: no cookies
        // are relied on, and the caller's own cache and rate limiter live in the source. The
        // dead browser is disposed on a detached promise — it is already gone, and awaiting its
        // `close()` would only delay the replacement.
        if (session === existing) session = undefined;
        void live.browser.close().catch(() => undefined);
        return getSession(userAgent);
      });
    }
    // Deliberate: a failed launch (e.g. missing OS-level Chromium libraries, doc 10 §1) is
    // cached, not retried per call — every `fetch()` after that fails fast with the same error
    // rather than re-attempting an expensive, likely-still-broken launch on each scrape. That is
    // why the liveness check above only reaches a *resolved* session: a rejected one propagates
    // its rejection and stays cached, exactly as before. Each failure still reaches
    // `ICompetitorSource.fetchProductOffers`'s catch and is recorded as an ordinary
    // `fetchFailed` (doc 07 §7: never escalates); a fresh worker restart is what clears a launch
    // failure, same as every other config problem this source depends on.
    session = launch(userAgent);
    return session;
  }

  return {
    async fetch(url, init) {
      const userAgent = init.headers['User-Agent'] ?? init.headers['user-agent'];
      const { page } = await getSession(userAgent);
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: init.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      if (response === null) {
        throw new Error(`Trendyol public page navigation to ${url} produced no response`);
      }
      const status = response.status();
      // `page.content()` (DOM-serialised), not `response.text()` (raw network body via CDP).
      // Measured 2026-08-17: awaiting `response.text()` on a page reused for a later navigation
      // makes that *later* navigation's own `timeout` stop being enforced — it hangs indefinitely
      // instead of throwing, reproduced deterministically with a local test server. `page.content()`
      // carries no such issue and the shared page is reused for the fetcher's whole lifetime, so
      // this was a real production hazard on the very first hung/slow request after any success.
      // Doc 07 §7's inline `__envoy__SHARED_PROPS` script is a DOM text node either way, so the
      // parser sees the same content it would have from the raw response.
      const body = await page.content();
      return {
        ok: status >= 200 && status < 300,
        status,
        url: response.url(),
        text: async () => body,
      };
    },
    async close() {
      disposed = true;
      const existing = session;
      session = undefined;
      if (!existing) return;
      // `catch`, not a bare await: a cached *launch failure* has no browser to close, and
      // shutdown must not be the place that finally rethrows it.
      const live = await existing.catch(() => undefined);
      await live?.browser.close();
    },
  };
}
