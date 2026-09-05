/**
 * `TrendyolPublicPageSource` — the reporting-only competitor scraper for Trendyol
 * (api-references §1.6, doc 07 §7, `docs/trendyol-merchants-scraping-guide.md`).
 *
 * ⚠️ **This is not the control path.** Nothing here may ever gate a pricing decision. The
 * official buybox endpoint (api-references §1.4) drives repricing; this exists to build the
 * competitor history doc 10 §5.1 requires for reporting, and doc 12 Phase 7's definition of
 * done is that turning it off changes nothing about repricing.
 *
 * Every constraint doc 04 §1.5 demanded of the rewrite is enforced here rather than left to
 * the caller, because the legacy scraper's failure mode was exactly that none of them existed:
 *
 * | Legacy (doc 04 §1.5, doc 09 §22) | Here |
 * |---|---|
 * | one page load per listing per cycle, unbounded | token-bucket rate limiter |
 * | no caching | short-TTL response cache, keyed by resolved URL |
 * | `/html/body/script[1]` | marker search (guide §2) |
 * | substring to the first `}};` | balanced-brace parse (guide §2) |
 * | `merchantListings[0]` | winner joined from `merchant` + `winnerVariant` (guide §6, §7) |
 * | parser throws, listing silently skipped | typed `fetchFailed`/`parseFailed`, both recorded |
 */
import type { MarketplaceCode } from '@buybox/core';
import {
  CompetitorSourceError,
  type CompetitorPageSnapshot,
  type ICompetitorSource,
  type ProductPageRef,
} from '../../ports/competitor-source.js';
import { RateLimiter } from '../../reliability/rate-limiter.js';
import { realSleep, retryAsync } from '../../reliability/retry.js';
import type { NodeFetchInit, NodeFetchResponse } from './node-https-fetch.js';
import { createPlaywrightFetcher, type PlaywrightFetcher } from './playwright-fetch.js';
import { normalizeTrendyolPage, TrendyolPageSchemaError } from './normalize.js';
import { extractSharedProps, SharedPropsNotFoundError } from './shared-props.js';

export const TRENDYOL_PUBLIC_BASE_URL = 'https://www.trendyol.com';

/**
 * Defaults, **not** derived from any published Trendyol figure — the public site has no
 * documented quota. They are deliberately conservative: this is a reporting job with no
 * deadline, and being slow costs nothing while being aggressive risks a block and breaches
 * the "explicit business decision" condition in api-references §1.6. Recorded in doc 08.
 */
export const TRENDYOL_SCRAPE_DEFAULTS = {
  requestsPerMinute: 30,
  /** Burst allowance; a full minute's worth would defeat the point of the limit. */
  burst: 5,
  cacheTtlMs: 10 * 60_000,
  /** Abort a page load rather than hold a worker slot indefinitely. */
  requestTimeoutMs: 15_000,
  /**
   * Confirmed 2026-08-17 by direct measurement: the same URL, same headers, same rate,
   * requested repeatedly through Node's `fetch` returns 403 on roughly half of attempts and
   * 200 on the other half — alternating on immediate retry with no delay
   * (403, 200, 403, 200, 403, 200 across six consecutive tries). `curl` against the identical
   * URL never failed. This is Cloudflare's bot-management scoring the HTTP client's
   * connection/TLS fingerprint per-request, not a sustained IP block or a User-Agent check —
   * so a bounded retry recovers most of what a sustained block would not. Retried **only** on
   * 403; other statuses are not known to be flaky and are reported as-is.
   */
  retryOn403MaxAttempts: 3,
  retryOn403BaseMs: 300,
} as const;

export interface TrendyolPublicPageSourceConfig {
  /**
   * Injectable for tests — fixture-backed, never a live call, never a real browser launch
   * (doc 10 §10, CLAUDE.md). Leaving this unset is what makes the source launch its own
   * Playwright browser (`playwright-fetch.ts`, **not** `fetch` and **not** Node's core `https` —
   * see that module's doc comment for why both were tried and dropped); a test that wants the
   * default transport instead of a fixture is a mistake, not a missing config.
   */
  readonly fetchFn?: (url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>;
  readonly baseUrl?: string;
  /**
   * Sent verbatim — this class has no compiled-in default and takes no position on what it
   * says. Doc 04 §1.5 wants a deliberate user-agent policy, not necessarily an honest one: an
   * honest agent got a 403 from Trendyol's bot detection even at a conservative request rate,
   * confirmed 2026-08-17 when the operator's own browser reached the same page without
   * incident. The product owner authorised a browser-identifying agent here (the caller passes
   * `SCRAPER_BROWSER_USER_AGENT`, api-references §1.6) — the same reporting-only exception
   * already recorded for Hepsiburada (§2.11, 2026-08-13).
   */
  readonly userAgent: string;
  readonly requestsPerMinute?: number;
  readonly burst?: number;
  readonly cacheTtlMs?: number;
  readonly requestTimeoutMs?: number;
  /** Injectable clock so cache expiry and rate limiting are testable without real waiting. */
  readonly nowMs?: () => number;
  /** Total attempts (including the first) for a response that comes back 403 — see TRENDYOL_SCRAPE_DEFAULTS. */
  readonly retryOn403MaxAttempts?: number;
  readonly retryOn403BaseMs?: number;
  /** Injectable so tests never wait on a real timer. */
  readonly sleep?: (ms: number) => Promise<void>;
}

interface CacheEntry {
  readonly snapshot: CompetitorPageSnapshot;
  readonly storedAtMs: number;
}

const RATE_LIMIT_BUCKET = 'publicPage';

/** See `buildUrl`'s doc comment — never request the public page as our own merchant. */
function stripMerchantIdParam(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete('merchantId');
  return parsed.toString();
}

export class TrendyolPublicPageSource implements ICompetitorSource {
  readonly code: MarketplaceCode = 'trendyol';

  private readonly fetchFn: (url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>;
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly cacheTtlMs: number;
  private readonly requestTimeoutMs: number;
  private readonly nowMs: () => number;
  private readonly rateLimiter: RateLimiter;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly retryOn403MaxAttempts: number;
  private readonly retryOn403BaseMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  /**
   * Only set when `config.fetchFn` was omitted — a test that injects its own `fetchFn` must
   * never pay for (or need) a real browser launch. Owns the browser's lifetime; `close()`
   * disposes it.
   */
  private readonly ownedFetcher: PlaywrightFetcher | undefined;

  constructor(config: TrendyolPublicPageSourceConfig) {
    if (config.fetchFn) {
      this.fetchFn = config.fetchFn;
      this.ownedFetcher = undefined;
    } else {
      this.ownedFetcher = createPlaywrightFetcher();
      this.fetchFn = this.ownedFetcher.fetch;
    }
    this.baseUrl = config.baseUrl ?? TRENDYOL_PUBLIC_BASE_URL;
    this.userAgent = config.userAgent;
    this.cacheTtlMs = config.cacheTtlMs ?? TRENDYOL_SCRAPE_DEFAULTS.cacheTtlMs;
    this.requestTimeoutMs = config.requestTimeoutMs ?? TRENDYOL_SCRAPE_DEFAULTS.requestTimeoutMs;
    this.nowMs = config.nowMs ?? (() => Date.now());
    this.retryOn403MaxAttempts =
      config.retryOn403MaxAttempts ?? TRENDYOL_SCRAPE_DEFAULTS.retryOn403MaxAttempts;
    this.retryOn403BaseMs = config.retryOn403BaseMs ?? TRENDYOL_SCRAPE_DEFAULTS.retryOn403BaseMs;
    this.sleep = config.sleep ?? realSleep;
    const perMinute = config.requestsPerMinute ?? TRENDYOL_SCRAPE_DEFAULTS.requestsPerMinute;
    this.rateLimiter = new RateLimiter({
      [RATE_LIMIT_BUCKET]: {
        capacity: config.burst ?? TRENDYOL_SCRAPE_DEFAULTS.burst,
        refillPerMs: perMinute / 60_000,
      },
    });
  }

  /**
   * doc 04 §1.5: `https://www.trendyol.com/marka/urun-p-{contentId}` reaches the product page
   * and redirects to its canonical slug. A `productUrl` from the product filter (§1.4) is
   * preferred when the import captured one — it is the marketplace's own canonical link.
   *
   * That captured `productUrl` carries `merchantId=<our own seller id>` in its query string
   * (mapping.ts's field comment). Confirmed empirically 2026-08-17: fetching the *public* page
   * with our own `merchantId` present in the query is not neutral — the embedded state comes
   * back with our own offer as the winner on every row, regardless of the real buybox order
   * (the official buybox endpoint, api-references §1.4, reported rank 8 for the same product
   * at the same time). This looks like Trendyol's own "preview as seller X" mode rather than
   * the neutral public page. Reporting-only code must never source rank from a request shaped
   * like a seller's own preview, so `merchantId` is always stripped before the fetch;
   * `filterOverPriceListings` and any other query param are left as Trendyol supplied them.
   */
  buildUrl(ref: ProductPageRef): string {
    if (ref.url !== null && ref.url.trim() !== '') {
      const absolute = ref.url.startsWith('http')
        ? ref.url
        : `${this.baseUrl}${ref.url.startsWith('/') ? '' : '/'}${ref.url}`;
      return stripMerchantIdParam(absolute);
    }
    if (ref.contentId !== null && ref.contentId.trim() !== '') {
      return `${this.baseUrl}/marka/urun-p-${encodeURIComponent(ref.contentId)}`;
    }
    throw new CompetitorSourceError(
      'Trendyol product page ref has neither a url nor a contentId',
      'fetchFailed',
    );
  }

  private async waitForToken(): Promise<void> {
    for (;;) {
      const result = this.rateLimiter.tryAcquire(RATE_LIMIT_BUCKET, this.nowMs());
      if (result.allowed) return;
      await realSleep(result.retryAfterMs);
    }
  }

  private readCache(url: string): CompetitorPageSnapshot | undefined {
    const entry = this.cache.get(url);
    if (!entry) return undefined;
    if (this.nowMs() - entry.storedAtMs >= this.cacheTtlMs) {
      this.cache.delete(url);
      return undefined;
    }
    return { ...entry.snapshot, fromCache: true };
  }

  async fetchProductOffers(ref: ProductPageRef): Promise<CompetitorPageSnapshot> {
    const url = this.buildUrl(ref);

    // doc 07 §7: "identical requests within a short window are served from cache". Several
    // listings (variants of one product, or a bundle and its single) share a product page.
    const cached = this.readCache(url);
    if (cached) return cached;

    let html: string;
    let fetchedUrl = url;
    try {
      // Each attempt — including retries — waits for its own token: a retry is still a real
      // request against the rate budget the operator configured (doc 08 §12).
      const oneAttempt = async (): Promise<{ readonly html: string; readonly fetchedUrl: string }> => {
        await this.waitForToken();
        const response = await this.fetchFn(url, {
          headers: { 'User-Agent': this.userAgent, Accept: 'text/html' },
          redirect: 'follow',
          signal: AbortSignal.timeout(this.requestTimeoutMs),
          timeoutMs: this.requestTimeoutMs,
        });
        if (!response.ok) {
          throw new CompetitorSourceError(
            `Trendyol public page ${response.status} for ${url}`,
            'fetchFailed',
            undefined,
            response.status,
          );
        }
        // The final URL after redirects is the canonical product link (doc 04 §1.5).
        return { html: await response.text(), fetchedUrl: response.url !== '' ? response.url : url };
      };
      const result = await retryAsync(oneAttempt, {
        maxAttempts: this.retryOn403MaxAttempts,
        baseMs: this.retryOn403BaseMs,
        factor: 2,
        maxDelayMs: 5_000,
        sleep: this.sleep,
        // See TRENDYOL_SCRAPE_DEFAULTS.retryOn403MaxAttempts: only 403 is known to be flaky
        // per-request rather than a real, sustained rejection.
        isRetryable: (error) => error instanceof CompetitorSourceError && error.httpStatus === 403,
      });
      html = result.html;
      fetchedUrl = result.fetchedUrl;
    } catch (error) {
      if (error instanceof CompetitorSourceError) throw error;
      throw new CompetitorSourceError(
        `Trendyol public page fetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
        'fetchFailed',
        error,
      );
    }

    let normalized;
    try {
      normalized = normalizeTrendyolPage(extractSharedProps(html));
    } catch (error) {
      if (error instanceof SharedPropsNotFoundError || error instanceof TrendyolPageSchemaError) {
        throw new CompetitorSourceError(
          `Trendyol public page parse failed for ${fetchedUrl}: ${error.message}`,
          'parseFailed',
          error,
        );
      }
      throw new CompetitorSourceError(
        `Trendyol public page parse failed for ${fetchedUrl}: ${error instanceof Error ? error.message : String(error)}`,
        'parseFailed',
        error,
      );
    }

    const snapshot: CompetitorPageSnapshot = {
      marketplaceCode: this.code,
      productRef: ref,
      fetchedUrl,
      observedAt: new Date(this.nowMs()),
      offers: normalized.offers,
      product: normalized.product,
      diagnostics: normalized.diagnostics,
      fromCache: false,
    };
    this.cache.set(url, { snapshot, storedAtMs: this.nowMs() });
    return snapshot;
  }

  /** Closes the owned Playwright browser, if this instance launched one. Worker shutdown only. */
  async close(): Promise<void> {
    await this.ownedFetcher?.close();
  }
}
