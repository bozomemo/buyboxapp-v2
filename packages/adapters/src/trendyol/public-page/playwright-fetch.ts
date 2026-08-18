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
 * lifetime. `TrendyolPublicPageSource`'s own rate limiter already serialises calls to a handful
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

const DEFAULT_TIMEOUT_MS = 15_000;

/** Launches nothing until the first `fetch()` call — a source that's never invoked never pays for a browser. */
export function createPlaywrightFetcher(): PlaywrightFetcher {
  let session: Promise<{ browser: Browser; page: Page }> | undefined;

  function getSession(userAgent: string | undefined): Promise<{ browser: Browser; page: Page }> {
    if (!session) {
      session = (async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage(userAgent ? { userAgent } : {});
        return { browser, page };
      })();
    }
    // Deliberate: a failed launch (e.g. missing OS-level Chromium libraries, doc 10 §1) is
    // cached, not retried per call — every `fetch()` after that fails fast with the same error
    // rather than re-attempting an expensive, likely-still-broken launch on each scrape. Each
    // failure still reaches `ICompetitorSource.fetchProductOffers`'s catch and is recorded as an
    // ordinary `fetchFailed` (doc 07 §7: never escalates); a fresh worker restart is what clears
    // a launch failure, same as every other config problem this source depends on.
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
      if (!session) return;
      const { browser } = await session;
      await browser.close();
    },
  };
}
