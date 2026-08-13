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
import { realSleep } from '../../reliability/retry.js';
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
} as const;

export interface TrendyolPublicPageSourceConfig {
  /** Injectable for tests — fixture-backed, never a live call (doc 10 §10, CLAUDE.md). */
  readonly fetchFn?: typeof fetch;
  readonly baseUrl?: string;
  /**
   * Sent verbatim. Identifying the client honestly is part of the "user-agent policy" doc 04
   * §1.5 requires of the rewrite; there is no default that pretends to be a browser.
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

const RATE_LIMIT_BUCKET = 'publicPage';

export class TrendyolPublicPageSource implements ICompetitorSource {
  readonly code: MarketplaceCode = 'trendyol';

  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly cacheTtlMs: number;
  private readonly requestTimeoutMs: number;
  private readonly nowMs: () => number;
  private readonly rateLimiter: RateLimiter;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(config: TrendyolPublicPageSourceConfig) {
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
    this.baseUrl = config.baseUrl ?? TRENDYOL_PUBLIC_BASE_URL;
    this.userAgent = config.userAgent;
    this.cacheTtlMs = config.cacheTtlMs ?? TRENDYOL_SCRAPE_DEFAULTS.cacheTtlMs;
    this.requestTimeoutMs = config.requestTimeoutMs ?? TRENDYOL_SCRAPE_DEFAULTS.requestTimeoutMs;
    this.nowMs = config.nowMs ?? (() => Date.now());
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
   */
  buildUrl(ref: ProductPageRef): string {
    if (ref.url !== null && ref.url.trim() !== '') {
      return ref.url.startsWith('http')
        ? ref.url
        : `${this.baseUrl}${ref.url.startsWith('/') ? '' : '/'}${ref.url}`;
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

    await this.waitForToken();

    let html: string;
    let fetchedUrl = url;
    try {
      const response = await this.fetchFn(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      if (!response.ok) {
        throw new CompetitorSourceError(`Trendyol public page ${response.status} for ${url}`, 'fetchFailed');
      }
      // The final URL after redirects is the canonical product link (doc 04 §1.5).
      fetchedUrl = response.url !== '' ? response.url : url;
      html = await response.text();
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
      diagnostics: normalized.diagnostics,
      fromCache: false,
    };
    this.cache.set(url, { snapshot, storedAtMs: this.nowMs() });
    return snapshot;
  }
}
