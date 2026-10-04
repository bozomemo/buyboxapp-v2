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
import {
  ADAPTIVE_RATE_DEFAULTS,
  AdaptiveRateController,
  parseRetryAfterMs,
  type AdaptiveRateChange,
  type AdaptiveRateConfig,
} from '../../reliability/adaptive-rate.js';
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
  /**
   * Abort a page load rather than hold a worker slot indefinitely.
   *
   * Raised from 15 s on 2026-09-11. 15 s was chosen against a developer machine on a fast link;
   * on the operator's production box `page.goto: Timeout 15000ms exceeded` was the single most
   * common recurring entry in the event log — steadily, on ordinary products, outside any of the
   * crash windows — which is a machine that cannot render a heavy SPA to `domcontentloaded` that
   * fast, not a marketplace that refuses to answer. A reporting job with no deadline should wait
   * rather than file a failure and spend the slot again next hour.
   *
   * Operator-overridable since the same date (`getScrapeRateLimit`, doc 08 §12), because the
   * right value is a property of the machine and nothing in this repository can know it.
   */
  requestTimeoutMs: 30_000,
  /**
   * Confirmed 2026-08-17 by direct measurement: the same URL, same headers, same rate,
   * requested repeatedly through Node's `fetch` returns 403 on roughly half of attempts and
   * 200 on the other half — alternating on immediate retry with no delay
   * (403, 200, 403, 200, 403, 200 across six consecutive tries). `curl` against the identical
   * URL never failed. This is Cloudflare's bot-management scoring the HTTP client's
   * connection/TLS fingerprint per-request, not a sustained IP block or a User-Agent check —
   * so a bounded retry recovers most of what a sustained block would not.
   *
   * **Widened beyond 403 on 2026-09-11** — see `RETRYABLE_HTTP_STATUSES`. The names are kept as
   * they are because the 403 measurement above is what sized the backoff and is the reason the
   * mechanism exists at all.
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
  /**
   * Overrides for the adaptive rate (doc 07 §7.7). `requestsPerMinute` is always its ceiling;
   * these only tune how it backs off and recovers. Tests use them; production takes the defaults.
   */
  readonly adaptiveRate?: Partial<Omit<AdaptiveRateConfig, 'ceilingPerMinute'>>;
  /**
   * Told every time the adaptive rate moves, so the worker can put it in the event log. Called
   * synchronously and must not throw; a throw is swallowed rather than allowed to fail a fetch.
   */
  readonly onRateChange?: (change: AdaptiveRateChange) => void;
}

interface CacheEntry {
  readonly snapshot: CompetitorPageSnapshot;
  readonly storedAtMs: number;
}

const RATE_LIMIT_BUCKET = 'publicPage';

/**
 * Response statuses worth asking about again, and nothing else (widened 2026-09-11).
 *
 * Until now only 403 was retried, on the measurement recorded in `TRENDYOL_SCRAPE_DEFAULTS`.
 * The operator's production event log then carried a steady trickle of `Trendyol public page
 * 503` — ten in four days, scattered across unrelated products at unrelated hours, each ending
 * that product's look for the cycle. 503 is by definition a server saying "not now, try later",
 * which is exactly what a bounded backoff is for, and 429/502/504 are the same statement in
 * other words.
 *
 * Everything else is still reported as-is, and the distinction matters: 404 and 410 are the
 * marketplace stating that the product is **gone**, and retrying them spends the operator's
 * rate budget three times over to be told so three times (`scrape-tracked-products.ts` acts on
 * them instead). 500 is deliberately absent too — an unconditional server error on one specific
 * product is not known to be transient here, and a retry that cannot help is a request that
 * costs a token and buys nothing.
 *
 * A `429` retry no longer waits only for the short backoff below (2026-10-04): the throttle
 * also pauses the whole source and lowers its rate (`observeResponse`), and the retry waits out
 * that pause in `waitForToken` like every other request.
 */
const RETRYABLE_HTTP_STATUSES: ReadonlySet<number> = new Set([403, 429, 502, 503, 504]);

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
  /** See `AdaptiveRateController`: the configured rate is its ceiling, not a fixed pace. */
  private readonly adaptiveRate: AdaptiveRateController;
  private readonly burst: number;
  private readonly onRateChange: ((change: AdaptiveRateChange) => void) | undefined;
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
    this.burst = config.burst ?? TRENDYOL_SCRAPE_DEFAULTS.burst;
    this.rateLimiter = new RateLimiter({
      [RATE_LIMIT_BUCKET]: {
        capacity: this.burst,
        refillPerMs: perMinute / 60_000,
      },
    });
    this.adaptiveRate = new AdaptiveRateController({
      ...ADAPTIVE_RATE_DEFAULTS,
      ...config.adaptiveRate,
      ceilingPerMinute: perMinute,
    });
    this.onRateChange = config.onRateChange;
  }

  /** The rate the source is currently allowed, at or below the configured one (doc 07 §7.7). */
  get currentRatePerMinute(): number {
    return this.adaptiveRate.ratePerMinute;
  }

  /**
   * Feeds one response into the adaptive rate and applies any change to the limiter.
   *
   * Only a `429` slows the source. A 403 is Cloudflare scoring one request (see
   * `TRENDYOL_SCRAPE_DEFAULTS`), a 503 has been a scattered per-product trickle, and a timeout
   * or a crashed renderer is this machine — none of them says the *rate* is wrong, and slowing
   * the whole catalogue for them would only cost coverage. Any other answer counts as quiet.
   */
  private observeResponse(status: number, retryAfter: string | null | undefined): void {
    const nowMs = this.nowMs();
    const change =
      status === 429
        ? this.adaptiveRate.onThrottled(nowMs, parseRetryAfterMs(retryAfter, nowMs))
        : this.adaptiveRate.onAnswered(nowMs);
    if (!change) return;
    // While recovering the bucket holds a single token: a source just told to slow down must
    // not open with a burst, least of all straight after its pause.
    this.rateLimiter.reconfigure(
      RATE_LIMIT_BUCKET,
      {
        capacity: this.adaptiveRate.isReduced ? 1 : this.burst,
        refillPerMs: change.toPerMinute / 60_000,
      },
      nowMs,
    );
    try {
      this.onRateChange?.(change);
    } catch {
      // Reporting the change is best-effort; the change itself has already been applied.
    }
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
    // A throttle pause holds back every request, retries included — that is the point of it.
    // Checked on every pass of the loop, not only on entry: a request already queued for a token
    // when another lane's 429 arms a pause must sit that pause out too. Measured 2026-10-05
    // against a local fake server: checked on entry only, a queued request went out 1.95 s after
    // a 429 that asked for 4 s. Each pause is waited out once (`honouredUntil`), so an injected
    // clock that never advances cannot spin here.
    let honouredUntil = 0;
    for (;;) {
      const pausedUntil = this.adaptiveRate.pausedUntil;
      if (pausedUntil > honouredUntil) {
        honouredUntil = pausedUntil;
        const pauseMs = this.adaptiveRate.pauseRemainingMs(this.nowMs());
        if (pauseMs > 0) await this.sleep(pauseMs);
        continue;
      }
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
        this.observeResponse(response.status, response.headers?.get('retry-after'));
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
        // See `RETRYABLE_HTTP_STATUSES`: 403 because it is scored per-request rather than as a
        // sustained rejection, the rest because the server itself said "later".
        isRetryable: (error) =>
          error instanceof CompetitorSourceError &&
          error.httpStatus !== undefined &&
          RETRYABLE_HTTP_STATUSES.has(error.httpStatus),
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
