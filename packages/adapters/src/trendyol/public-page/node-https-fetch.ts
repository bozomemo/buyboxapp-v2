/**
 * A `fetch`-shaped HTTP client backed by Node's core `http`/`https` modules — was briefly
 * `TrendyolPublicPageSource`'s default `fetchFn` (2026-08-17) in place of the platform `fetch`
 * (undici), on the theory that Cloudflare was scoring undici's connection handling specifically.
 *
 * **That theory did not hold.** Re-measured later the same day, live, against the exact URLs
 * that were failing: this module's `https.request` also returned 403 consistently — 0/3, even
 * with a full realistic browser header set — while `curl` on the same machine kept succeeding.
 * The difference turned out to be `curl`'s TLS backend (Schannel on Windows) versus Node's
 * (OpenSSL, used by **both** `fetch` and this module identically) — Cloudflare is fingerprinting
 * the TLS ClientHello, not the HTTP layer, so no Node-native HTTP client was ever going to pass
 * reliably. See `playwright-fetch.ts`, the module that replaced this as the default: a real
 * headless browser has a real browser TLS/JS fingerprint, which is what actually clears the
 * check. Kept here as an injectable alternative and for its test coverage, not as production's
 * transport.
 *
 * Protocol-agnostic (dispatches on the URL's scheme) purely so this is unit-testable against a
 * plain local `http` server (doc 10 §10: never a live call in a test) — every real call this
 * source makes is `https:`.
 */
import * as http from 'node:http';
import * as https from 'node:https';

export interface NodeFetchInit {
  readonly headers: Record<string, string>;
  readonly redirect?: 'follow';
  readonly signal?: AbortSignal;
  /**
   * Alternative to `signal` for transports (playwright-fetch.ts) whose native navigation
   * timeout takes a plain number rather than an `AbortSignal`. This module ignores it — it
   * already honours `signal`.
   */
  readonly timeoutMs?: number;
}

export interface NodeFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly url: string;
  text(): Promise<string>;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

export function nodeHttpsFetch(url: string, init: NodeFetchInit): Promise<NodeFetchResponse> {
  return followRedirects(url, init, MAX_REDIRECTS);
}

function followRedirects(url: string, init: NodeFetchInit, redirectsLeft: number): Promise<NodeFetchResponse> {
  return new Promise((resolve, reject) => {
    if (init.signal?.aborted) {
      reject(new Error('The operation was aborted'));
      return;
    }
    const requestFn = new URL(url).protocol === 'http:' ? http.request : https.request;
    const req = requestFn(url, { method: 'GET', headers: init.headers }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (REDIRECT_STATUSES.has(status) && location !== undefined && redirectsLeft > 0) {
        res.resume();
        const next = new URL(location, url).toString();
        resolve(followRedirects(next, init, redirectsLeft - 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({ ok: status >= 200 && status < 300, status, url, text: async () => body });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (init.signal) {
      const onAbort = (): void => {
        req.destroy(new Error('The operation was aborted'));
      };
      init.signal.addEventListener('abort', onAbort, { once: true });
      req.on('close', () => init.signal?.removeEventListener('abort', onAbort));
    }
    req.end();
  });
}
