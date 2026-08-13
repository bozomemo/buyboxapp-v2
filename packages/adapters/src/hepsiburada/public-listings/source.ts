/**
 * `HepsiburadaPublicListingsSource` — the reporting-only competitor source for Hepsiburada
 * (api-references §2.11, doc 07 §7).
 *
 * ⚠️ **This is not the control path.** Nothing here may ever gate a pricing decision, and the
 * Hepsiburada *adapter* (`../adapter.ts`) remains blocked on api-references §2.9 independently
 * of this file. Doc 12 Phase 7's definition of done is that turning this off changes nothing
 * about repricing.
 *
 * It reads `GET /api/v1/product/listings/{sku}`, an undocumented public endpoint the product
 * page itself calls. Compared with Trendyol's embedded page state this is a far easier payload
 * — a real array with the buybox holder inside it — but a far more hostile transport:
 *
 * | Verified 2026-08-13 | Consequence here |
 * |---|---|
 * | An honest `User-Agent` is refused with 403 by Akamai | browser headers, see below |
 * | Dropping `Referer`, `accept-language` or `sec-fetch-*` is refused with 403 | all sent as one verified set |
 * | No cookie or credential is needed | none is sent, and none is ever stored |
 * | ~8 rapid requests trip a temporary block | rate limit far below Trendyol's |
 *
 * **On impersonating a browser.** Doc 04 §1.5's user-agent policy is that the client identifies
 * itself honestly, and the Trendyol source does exactly that. Hepsiburada does not permit it:
 * measured header-by-header, the endpoint answers only a browser-shaped request. That makes
 * this an explicit, recorded exception granted by the product owner on 2026-08-13, not a
 * default — which is why the user agent is injected rather than defaulted, and why this job
 * still ships disabled (doc 12 Phase 7).
 */
import type { MarketplaceCode } from '@buybox/core';
import {
  CompetitorSourceError,
  type CompetitorPageSnapshot,
  type ICompetitorSource,
  type ProductPageRef,
} from '../../ports/competitor-source.js';
import { RateLimiter } from '../../reliability/rate-limiter.js';
import { realSleep } from '../../reliability/retry.js';
import { HepsiburadaListingsSchemaError, normalizeHepsiburadaListings } from './normalize.js';

export const HEPSIBURADA_PUBLIC_BASE_URL = 'https://www.hepsiburada.com';

/** api-references §2.11. The `{sku}` is the product SKU, e.g. `BS1372`. */
export const HEPSIBURADA_LISTINGS_PATH = '/api/v1/product/listings';

/**
 * Defaults, **not** derived from any published Hepsiburada figure — the endpoint is
 * undocumented and has no stated quota. Deliberately stricter than Trendyol's: a burst of
 * roughly eight requests was observed to trip a temporary Akamai block on 2026-08-13, so the
 * sustained rate is set well under that. Being slow costs nothing for a reporting job with no
 * deadline. Recorded in doc 08 §12.
 */
export const HEPSIBURADA_SCRAPE_DEFAULTS = {
  requestsPerMinute: 10,
  burst: 3,
  cacheTtlMs: 10 * 60_000,
  requestTimeoutMs: 15_000,
} as const;

/**
 * The exact header set measured to be accepted, and the minimum: removing `Referer` or
 * `accept-language` was verified to return 403 (api-references §2.11). Kept in one exported
 * function so the set is testable and so nothing else in the codebase grows browser headers
 * by copy-paste.
 */
export function buildHepsiburadaPublicHeaders(userAgent: string, referer: string): Record<string, string> {
  return {
    'User-Agent': userAgent,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'tr-TR,tr;q=0.9',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    Referer: referer,
  };
}

export interface HepsiburadaPublicListingsSourceConfig {
  /** Injectable for tests — fixture-backed, never a live call (doc 10 §10, CLAUDE.md). */
  readonly fetchFn?: typeof fetch;
  readonly baseUrl?: string;
  /**
   * Sent verbatim. Must be a current browser user agent: the endpoint refuses anything else
   * (see the class doc). There is deliberately no default — the impersonation is a decision
   * that belongs in deployment configuration, where it is visible.
   */
  readonly userAgent: string;
  readonly requestsPerMinute?: number;
  readonly burst?: number;
  readonly cacheTtlMs?: number;
  readonly requestTimeoutMs?: number;
  /** Injectable clock so cache expiry and rate limiting are testable without real waiting. */
  readonly nowMs?: () => number;
}

interface CacheEntry {
  readonly snapshot: CompetitorPageSnapshot;
  readonly storedAtMs: number;
}

const RATE_LIMIT_BUCKET = 'publicListings';

export class HepsiburadaPublicListingsSource implements ICompetitorSource {
  readonly code: MarketplaceCode = 'hepsiburada';

  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly cacheTtlMs: number;
  private readonly requestTimeoutMs: number;
  private readonly nowMs: () => number;
  private readonly rateLimiter: RateLimiter;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(config: HepsiburadaPublicListingsSourceConfig) {
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
    this.baseUrl = config.baseUrl ?? HEPSIBURADA_PUBLIC_BASE_URL;
    this.userAgent = config.userAgent;
    this.cacheTtlMs = config.cacheTtlMs ?? HEPSIBURADA_SCRAPE_DEFAULTS.cacheTtlMs;
    this.requestTimeoutMs = config.requestTimeoutMs ?? HEPSIBURADA_SCRAPE_DEFAULTS.requestTimeoutMs;
    this.nowMs = config.nowMs ?? (() => Date.now());
    const perMinute = config.requestsPerMinute ?? HEPSIBURADA_SCRAPE_DEFAULTS.requestsPerMinute;
    this.rateLimiter = new RateLimiter({
      [RATE_LIMIT_BUCKET]: {
        capacity: config.burst ?? HEPSIBURADA_SCRAPE_DEFAULTS.burst,
        refillPerMs: perMinute / 60_000,
      },
    });
  }

  /**
   * The endpoint is addressed by SKU only, so unlike Trendyol a `url` alone is not enough:
   * deriving a SKU from a product-page slug would mean parsing display text, which the scraping
   * rules forbid outright.
   */
  buildUrl(ref: ProductPageRef): string {
    const sku = ref.contentId?.trim() ?? '';
    if (sku === '') {
      throw new CompetitorSourceError(
        'Hepsiburada product ref has no contentId (SKU); the listings endpoint cannot be addressed without one',
        'fetchFailed',
      );
    }
    return `${this.baseUrl}${HEPSIBURADA_LISTINGS_PATH}/${encodeURIComponent(sku)}`;
  }

  /**
   * The `Referer` must be a page on the same origin — `sec-fetch-site: same-origin` is part of
   * what the endpoint checks. The listing's own product URL is used when the import captured
   * one; otherwise Hepsiburada's short product-page form for the SKU, which is **unverified**
   * as a referer (api-references §2.11) and is the first thing to check if 403s appear.
   */
  buildReferer(ref: ProductPageRef, sku: string): string {
    const url = ref.url?.trim() ?? '';
    if (url !== '') {
      return url.startsWith('http') ? url : `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    }
    return `${this.baseUrl}/p-${encodeURIComponent(sku)}`;
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

    // doc 07 §7: "identical requests within a short window are served from cache". Several of
    // our listings (variants, or a bundle and its single) can share one marketplace SKU.
    const cached = this.readCache(url);
    if (cached) return cached;

    await this.waitForToken();

    let body: string;
    let fetchedUrl = url;
    try {
      const response = await this.fetchFn(url, {
        headers: buildHepsiburadaPublicHeaders(this.userAgent, this.buildReferer(ref, ref.contentId ?? '')),
        redirect: 'follow',
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      if (!response.ok) {
        // 403 here is the bot-protection interstitial rather than a missing product, and the
        // distinction matters to whoever reads the failure — but both are `fetchFailed`, and
        // neither is allowed to reach a pricing decision.
        const hint =
          response.status === 403
            ? ' — bot protection (Akamai); check the header set and the request rate (api-references §2.11)'
            : '';
        throw new CompetitorSourceError(
          `Hepsiburada public listings ${response.status} for ${url}${hint}`,
          'fetchFailed',
        );
      }
      fetchedUrl = response.url !== '' ? response.url : url;
      body = await response.text();
    } catch (error) {
      if (error instanceof CompetitorSourceError) throw error;
      throw new CompetitorSourceError(
        `Hepsiburada public listings fetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
        'fetchFailed',
        error,
      );
    }

    let normalized;
    try {
      // A 200 carrying an HTML interstitial rather than JSON lands here, which is correct: the
      // transport succeeded and the payload is unusable.
      normalized = normalizeHepsiburadaListings(JSON.parse(body));
    } catch (error) {
      const reason =
        error instanceof HepsiburadaListingsSchemaError || error instanceof SyntaxError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      throw new CompetitorSourceError(
        `Hepsiburada public listings parse failed for ${fetchedUrl}: ${reason}`,
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
      diagnostics: normalized.diagnostics,
      fromCache: false,
    };
    this.cache.set(url, { snapshot, storedAtMs: this.nowMs() });
    return snapshot;
  }
}
