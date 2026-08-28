/**
 * `TrendyolBrandCatalogueSource` — enumerates every product Trendyol lists under a brand
 * (api-references §1.7, doc 06, doc 07). Reporting only: nothing it returns may gate a pricing
 * decision, and disabling the sweep job must leave repricing untouched.
 *
 * It reads the same kind of payload as `TrendyolPublicPageSource`, from a different page, so it
 * deliberately reuses that module's hard-won transport decisions rather than re-deriving them:
 *
 * | Decision | Why it carries over unchanged |
 * |---|---|
 * | Real headless browser (Playwright), not `fetch` | Cloudflare fingerprints the TLS ClientHello; every Node HTTP client shares OpenSSL and is scored the same (measured 2026-08-17) |
 * | Token-bucket rate limiter | The public site publishes no quota; a reporting job with no deadline pays nothing for being slow |
 * | Short-TTL response cache | Two brands whose search terms overlap can request the same page |
 * | Bounded retry on 403 only | 403 is per-request flaky here; no other status is known to be |
 *
 * **Its own rate limiter instance, not a shared one.** A sweep is bursty (37 pages back to back
 * for Whiskas, 203 for Royal Canin) while the product-page scraper is a steady drip, and one
 * bucket shared between them would let a sweep starve the per-product tier — or the reverse.
 * The operator budgets them separately for the same reason (doc 08).
 *
 * Measured live 2026-08-27/28: 37 pages in 62s and 25 pages in 40s, zero failures, no CAPTCHA.
 */
import type { MarketplaceCode } from '@buybox/core';
import {
  BrandCatalogueError,
  hasBrandCatalogueQuery,
  type BrandCataloguePage,
  type BrandCatalogueQuery,
  type IBrandCatalogueSource,
} from '../../ports/brand-catalogue-source.js';
import { RateLimiter } from '../../reliability/rate-limiter.js';
import { realSleep, retryAsync } from '../../reliability/retry.js';
import type { NodeFetchInit, NodeFetchResponse } from '../public-page/node-https-fetch.js';
import { createPlaywrightFetcher, type PlaywrightFetcher } from '../public-page/playwright-fetch.js';
import { extractSearchResultProps, SharedPropsNotFoundError } from '../public-page/shared-props.js';
import {
  normalizeTrendyolBrandCataloguePage,
  TrendyolBrandCatalogueSchemaError,
} from './normalize.js';

export const TRENDYOL_PUBLIC_BASE_URL = 'https://www.trendyol.com';

/** Cards per page, as Trendyol serves them. Not configurable — it is the site's own page size. */
export const TRENDYOL_BRAND_CATALOGUE_PAGE_SIZE = 24;

/**
 * Defaults, **not** derived from any published Trendyol figure — the public site has no
 * documented quota. Recorded in doc 08 alongside the product-page scraper's.
 */
export const TRENDYOL_BRAND_CATALOGUE_DEFAULTS = {
  requestsPerMinute: 30,
  burst: 5,
  cacheTtlMs: 10 * 60_000,
  requestTimeoutMs: 20_000,
  retryOn403MaxAttempts: 3,
  retryOn403BaseMs: 300,
} as const;

export interface TrendyolBrandCatalogueSourceConfig {
  /**
   * Injectable for tests — fixture-backed, never a live call, never a real browser launch
   * (doc 10 §10, CLAUDE.md). Leaving this unset is what makes the source launch its own
   * Playwright browser.
   */
  readonly fetchFn?: (url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>;
  readonly baseUrl?: string;
  /** Sent verbatim; see `TrendyolPublicPageSourceConfig.userAgent` for the authorised exception. */
  readonly userAgent: string;
  readonly requestsPerMinute?: number;
  readonly burst?: number;
  readonly cacheTtlMs?: number;
  readonly requestTimeoutMs?: number;
  readonly nowMs?: () => number;
  readonly retryOn403MaxAttempts?: number;
  readonly retryOn403BaseMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

interface CacheEntry {
  readonly page: BrandCataloguePage;
  readonly storedAtMs: number;
}

const RATE_LIMIT_BUCKET = 'brandCatalogue';

export class TrendyolBrandCatalogueSource implements IBrandCatalogueSource {
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
  private readonly ownedFetcher: PlaywrightFetcher | undefined;

  constructor(config: TrendyolBrandCatalogueSourceConfig) {
    if (config.fetchFn) {
      this.fetchFn = config.fetchFn;
      this.ownedFetcher = undefined;
    } else {
      this.ownedFetcher = createPlaywrightFetcher();
      this.fetchFn = this.ownedFetcher.fetch;
    }
    this.baseUrl = config.baseUrl ?? TRENDYOL_PUBLIC_BASE_URL;
    this.userAgent = config.userAgent;
    this.cacheTtlMs = config.cacheTtlMs ?? TRENDYOL_BRAND_CATALOGUE_DEFAULTS.cacheTtlMs;
    this.requestTimeoutMs = config.requestTimeoutMs ?? TRENDYOL_BRAND_CATALOGUE_DEFAULTS.requestTimeoutMs;
    this.nowMs = config.nowMs ?? (() => Date.now());
    this.retryOn403MaxAttempts =
      config.retryOn403MaxAttempts ?? TRENDYOL_BRAND_CATALOGUE_DEFAULTS.retryOn403MaxAttempts;
    this.retryOn403BaseMs = config.retryOn403BaseMs ?? TRENDYOL_BRAND_CATALOGUE_DEFAULTS.retryOn403BaseMs;
    this.sleep = config.sleep ?? realSleep;
    const perMinute = config.requestsPerMinute ?? TRENDYOL_BRAND_CATALOGUE_DEFAULTS.requestsPerMinute;
    this.rateLimiter = new RateLimiter({
      [RATE_LIMIT_BUCKET]: {
        capacity: config.burst ?? TRENDYOL_BRAND_CATALOGUE_DEFAULTS.burst,
        refillPerMs: perMinute / 60_000,
      },
    });
  }

  /**
   * `/sr` is the search endpoint and takes both selectors, verified live 2026-08-27:
   * `wb=<webBrandId>` filters to the storefront brand, `q=<term>` runs the free-text query,
   * `pi=<n>` pages. Passing both narrows to the intersection, which is *not* what either
   * caller wants — the point of carrying two selectors is to compare their results — so the
   * brand id wins when both are set and the caller sweeps the search term as its own query.
   */
  buildUrl(query: BrandCatalogueQuery, pageIndex: number): string {
    if (!hasBrandCatalogueQuery(query)) {
      throw new BrandCatalogueError(
        'Brand catalogue query has neither a brandRef nor a searchTerm',
        'fetchFailed',
      );
    }
    const url = new URL('/sr', this.baseUrl);
    const brandRef = query.brandRef?.trim();
    if (brandRef !== undefined && brandRef !== '') {
      url.searchParams.set('wb', brandRef);
    } else {
      url.searchParams.set('q', query.searchTerm!.trim());
    }
    url.searchParams.set('pi', String(pageIndex));
    return url.toString();
  }

  private async waitForToken(): Promise<void> {
    for (;;) {
      const result = this.rateLimiter.tryAcquire(RATE_LIMIT_BUCKET, this.nowMs());
      if (result.allowed) return;
      await realSleep(result.retryAfterMs);
    }
  }

  private readCache(url: string): BrandCataloguePage | undefined {
    const entry = this.cache.get(url);
    if (!entry) return undefined;
    if (this.nowMs() - entry.storedAtMs >= this.cacheTtlMs) {
      this.cache.delete(url);
      return undefined;
    }
    return { ...entry.page, fromCache: true };
  }

  /**
   * A page past the end of the catalogue is an **empty page, not a failure**. Trendyol answers
   * 404 there (page 38 of 37 for Whiskas, 210 of 203 for Royal Canin, measured 2026-08-27/28),
   * and a caller paging until exhaustion would otherwise have to distinguish "the brand ended"
   * from "the site broke" by inspecting an error — exactly the kind of control flow the port
   * exists to remove. Every other non-2xx status still throws.
   */
  async fetchPage(query: BrandCatalogueQuery, pageIndex: number): Promise<BrandCataloguePage> {
    const url = this.buildUrl(query, pageIndex);

    const cached = this.readCache(url);
    if (cached) return cached;

    let html: string | null;
    let fetchedUrl = url;
    try {
      const oneAttempt = async (): Promise<{ readonly html: string | null; readonly fetchedUrl: string }> => {
        // Each attempt — retries included — spends its own token: a retry is a real request
        // against the budget the operator configured (doc 08).
        await this.waitForToken();
        const response = await this.fetchFn(url, {
          headers: { 'User-Agent': this.userAgent, Accept: 'text/html' },
          redirect: 'follow',
          signal: AbortSignal.timeout(this.requestTimeoutMs),
          timeoutMs: this.requestTimeoutMs,
        });
        const finalUrl = response.url !== '' ? response.url : url;
        if (response.status === 404) return { html: null, fetchedUrl: finalUrl };
        if (!response.ok) {
          throw new BrandCatalogueError(
            `Trendyol brand catalogue ${response.status} for ${url}`,
            'fetchFailed',
            undefined,
            response.status,
          );
        }
        return { html: await response.text(), fetchedUrl: finalUrl };
      };
      const result = await retryAsync(oneAttempt, {
        maxAttempts: this.retryOn403MaxAttempts,
        baseMs: this.retryOn403BaseMs,
        factor: 2,
        maxDelayMs: 5_000,
        sleep: this.sleep,
        isRetryable: (error) => error instanceof BrandCatalogueError && error.httpStatus === 403,
      });
      html = result.html;
      fetchedUrl = result.fetchedUrl;
    } catch (error) {
      if (error instanceof BrandCatalogueError) throw error;
      throw new BrandCatalogueError(
        `Trendyol brand catalogue fetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
        'fetchFailed',
        error,
      );
    }

    if (html === null) {
      return this.emptyPage(query, pageIndex, fetchedUrl);
    }

    let normalized;
    try {
      normalized = normalizeTrendyolBrandCataloguePage(extractSearchResultProps(html));
    } catch (error) {
      if (error instanceof SharedPropsNotFoundError || error instanceof TrendyolBrandCatalogueSchemaError) {
        throw new BrandCatalogueError(
          `Trendyol brand catalogue parse failed for ${fetchedUrl}: ${error.message}`,
          'parseFailed',
          error,
        );
      }
      throw new BrandCatalogueError(
        `Trendyol brand catalogue parse failed for ${fetchedUrl}: ${error instanceof Error ? error.message : String(error)}`,
        'parseFailed',
        error,
      );
    }

    const page: BrandCataloguePage = {
      marketplaceCode: this.code,
      query,
      pageIndex,
      totalProducts: normalized.totalProducts,
      products: normalized.products,
      fetchedUrl,
      observedAt: new Date(this.nowMs()),
      diagnostics: normalized.diagnostics,
      fromCache: false,
    };
    this.cache.set(url, { page, storedAtMs: this.nowMs() });
    return page;
  }

  /** The shape a 404 past the last page normalises to — see `fetchPage`'s doc comment. */
  private emptyPage(query: BrandCatalogueQuery, pageIndex: number, fetchedUrl: string): BrandCataloguePage {
    return {
      marketplaceCode: this.code,
      query,
      pageIndex,
      totalProducts: null,
      products: [],
      fetchedUrl,
      observedAt: new Date(this.nowMs()),
      diagnostics: {
        parserVersion: normalizeTrendyolBrandCataloguePage({}).diagnostics.parserVersion,
        stateFound: false,
        dataFound: false,
        rawCardCount: 0,
        droppedCount: 0,
      },
      fromCache: false,
    };
  }

  /** Closes the owned Playwright browser, if this instance launched one. Worker shutdown only. */
  async close(): Promise<void> {
    await this.ownedFetcher?.close();
  }
}
