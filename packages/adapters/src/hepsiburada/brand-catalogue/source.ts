/**
 * `HepsiburadaBrandCatalogueSource` — enumerates the products Hepsiburada lists under a brand
 * (api-references §2.13, doc 06, doc 07). Reporting only: nothing it returns may gate a pricing
 * decision, and disabling the sweep job must leave repricing untouched.
 *
 * Measured live 2026-08-28: Whiskas 564 products over 16 pages of 36, Royal Canin 2,360 claimed
 * over a claimed 50.
 *
 * ## An honest client, and no browser
 *
 * Unlike the Trendyol catalogue source this uses plain `fetch` with the honest
 * `SCRAPER_USER_AGENT`. That is not an oversight and not a saving — it is what was measured:
 * `/ara?q=whiskas` answered 200 to a request whose only header was our own user agent, and the
 * payload was complete. Trendyol needs a real browser because its bot detection fingerprints
 * the TLS handshake; this page does not care. No exception is claimed here because none is
 * needed, which is the state every source is supposed to be in.
 *
 * ## Two things this page does that a paging loop must not trust
 *
 * **Past the last page it does not 404 — it serves page 1 again.** Page 17 of Whiskas' 16
 * returned 200, `currentPage: 1`, and the same 36 SKUs as page 1 (measured 2026-08-28). Trendyol
 * 404s there, so the sweep job stops when a page comes back empty; under that same rule this
 * page would re-ingest page 1 for ever. So the loop-back is detected here, at the boundary
 * where it was measured, and turned into the empty page the port promises — `currentPage` is
 * compared against the page that was asked for, and a mismatch ends the catalogue.
 *
 * **Not all of the catalogue is reachable.** Page 50 of Royal Canin returned 403 while pages 1
 * and 20 returned 200 — before and again after a four-minute pause, so it is a ceiling and not a
 * temporary block. `lastPage: 50` is itself below the 66 pages `totalProductCount: 2360` implies
 * at 36 a page. A 403 past page 1 is therefore treated as the end of the *reachable* catalogue
 * rather than as a failure, and the caller is left holding `totalProducts` to compare against
 * what it actually received: the shortfall stays visible instead of looking like a brand that
 * shrank. A 403 on page 1 is a real failure and still throws.
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
import { realSleep } from '../../reliability/retry.js';
import {
  extractMoriaProductListState,
  HepsiburadaStateNotFoundError,
} from '../public-page/embedded-state.js';
import {
  HEPSIBURADA_BRAND_CATALOGUE_PARSER_VERSION,
  HepsiburadaBrandCatalogueSchemaError,
  normalizeHepsiburadaBrandCatalogue,
} from './normalize.js';

export const HEPSIBURADA_PUBLIC_BASE_URL = 'https://www.hepsiburada.com';

/** Cards per page, as Hepsiburada serves them. The site's own page size, not a setting. */
export const HEPSIBURADA_BRAND_CATALOGUE_PAGE_SIZE = 36;

/**
 * Defaults, **not** derived from any published Hepsiburada figure — the public site has no
 * documented quota. Deliberately slower than the Trendyol sweep's 30/min: each page is a ~2.3 MB
 * server-rendered document, and a reporting job with no deadline pays nothing for being slow.
 * Recorded in doc 08 §12.
 */
export const HEPSIBURADA_BRAND_CATALOGUE_DEFAULTS = {
  requestsPerMinute: 6,
  burst: 2,
  cacheTtlMs: 10 * 60_000,
  requestTimeoutMs: 25_000,
} as const;

export interface HepsiburadaBrandCatalogueSourceConfig {
  /** Injectable for tests — fixture-backed, never a live call (doc 10 §10, CLAUDE.md). */
  readonly fetchFn?: typeof fetch;
  readonly baseUrl?: string;
  /** The honest `SCRAPER_USER_AGENT`; this page accepts it (see the class doc). */
  readonly userAgent: string;
  readonly requestsPerMinute?: number;
  readonly burst?: number;
  readonly cacheTtlMs?: number;
  readonly requestTimeoutMs?: number;
  readonly nowMs?: () => number;
}

interface CacheEntry {
  readonly page: BrandCataloguePage;
  readonly storedAtMs: number;
}

const RATE_LIMIT_BUCKET = 'brandCatalogue';

export class HepsiburadaBrandCatalogueSource implements IBrandCatalogueSource {
  readonly code: MarketplaceCode = 'hepsiburada';

  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly cacheTtlMs: number;
  private readonly requestTimeoutMs: number;
  private readonly nowMs: () => number;
  private readonly rateLimiter: RateLimiter;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(config: HepsiburadaBrandCatalogueSourceConfig) {
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
    this.baseUrl = config.baseUrl ?? HEPSIBURADA_PUBLIC_BASE_URL;
    this.userAgent = config.userAgent;
    this.cacheTtlMs = config.cacheTtlMs ?? HEPSIBURADA_BRAND_CATALOGUE_DEFAULTS.cacheTtlMs;
    this.requestTimeoutMs =
      config.requestTimeoutMs ?? HEPSIBURADA_BRAND_CATALOGUE_DEFAULTS.requestTimeoutMs;
    this.nowMs = config.nowMs ?? (() => Date.now());
    const perMinute =
      config.requestsPerMinute ?? HEPSIBURADA_BRAND_CATALOGUE_DEFAULTS.requestsPerMinute;
    this.rateLimiter = new RateLimiter({
      [RATE_LIMIT_BUCKET]: {
        capacity: config.burst ?? HEPSIBURADA_BRAND_CATALOGUE_DEFAULTS.burst,
        refillPerMs: perMinute / 60_000,
      },
    });
  }

  /**
   * Hepsiburada's catalogue is addressed by **search term only**.
   *
   * Trendyol carries a numeric brand id whose results differ from the search term's, and that
   * difference is a finding the audit exists to surface. Hepsiburada has no equivalent: its
   * brand is a slug (`brandId: "whiskas"` on the product page), `?markalar=whiskas` alone
   * redirects to the home page, and `?q=whiskas&markalar=whiskas` returns a result identical to
   * `?q=whiskas` (all measured 2026-08-28). So a `brandRef` cannot be honoured here, and a query
   * that carries only one is refused rather than quietly swept as something else.
   *
   * ⚠️ A search also auto-applies a **category** facet (Whiskas → Pet Shop > Kedi). Products
   * carrying a brand's name in an unrelated category — the 8 Whiskas rows found under *Halı* on
   * Trendyol — are therefore out of this marketplace's reach through this path. Recorded, not
   * worked around: doc 06 says so where the report is read.
   */
  buildUrl(query: BrandCatalogueQuery, pageIndex: number): string {
    if (!hasBrandCatalogueQuery(query)) {
      throw new BrandCatalogueError(
        'Brand catalogue query carries neither a brand ref nor a search term',
        'fetchFailed',
      );
    }
    const searchTerm = query.searchTerm?.trim() ?? '';
    if (searchTerm === '') {
      throw new BrandCatalogueError(
        'Hepsiburada addresses its catalogue by search term only; a brand ref alone cannot be swept (api-references §2.13)',
        'fetchFailed',
      );
    }
    const url = new URL('/ara', this.baseUrl);
    url.searchParams.set('q', searchTerm);
    if (pageIndex > 1) url.searchParams.set('sayfa', String(pageIndex));
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

  /** The page a caller's loop stops on: no products, and the diagnostics that say why. */
  private emptyPage(
    query: BrandCatalogueQuery,
    pageIndex: number,
    fetchedUrl: string,
    totalProducts: number | null,
  ): BrandCataloguePage {
    return {
      marketplaceCode: this.code,
      query,
      pageIndex,
      totalProducts,
      products: [],
      fetchedUrl,
      observedAt: new Date(this.nowMs()),
      diagnostics: {
        parserVersion: HEPSIBURADA_BRAND_CATALOGUE_PARSER_VERSION,
        stateFound: true,
        dataFound: true,
        rawCardCount: 0,
        droppedCount: 0,
      },
      fromCache: false,
    };
  }

  async fetchPage(query: BrandCatalogueQuery, pageIndex: number): Promise<BrandCataloguePage> {
    const url = this.buildUrl(query, pageIndex);

    const cached = this.readCache(url);
    if (cached) return cached;

    await this.waitForToken();

    let body: string;
    let fetchedUrl = url;
    try {
      const response = await this.fetchFn(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'text/html,application/xhtml+xml,*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      if (!response.ok) {
        // The measured page ceiling: a 403 past page 1 is where the reachable catalogue ends.
        // On page 1 it is a genuine block and must be reported as one.
        if (response.status === 403 && pageIndex > 1) {
          return this.emptyPage(query, pageIndex, url, null);
        }
        throw new BrandCatalogueError(
          `Hepsiburada brand catalogue ${response.status} for ${url}`,
          'fetchFailed',
          undefined,
          response.status,
        );
      }
      fetchedUrl = response.url !== '' ? response.url : url;
      body = await response.text();
    } catch (error) {
      if (error instanceof BrandCatalogueError) throw error;
      throw new BrandCatalogueError(
        `Hepsiburada brand catalogue fetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
        'fetchFailed',
        error,
      );
    }

    let normalized;
    try {
      normalized = normalizeHepsiburadaBrandCatalogue(extractMoriaProductListState(body));
    } catch (error) {
      const reason =
        error instanceof HepsiburadaStateNotFoundError ||
        error instanceof HepsiburadaBrandCatalogueSchemaError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      throw new BrandCatalogueError(
        `Hepsiburada brand catalogue parse failed for ${fetchedUrl}: ${reason}`,
        'parseFailed',
        error,
      );
    }

    // The loop-back. `currentPage` is the payload's own statement of which page this is, and
    // when it disagrees with the request the site has wrapped around to the start. Returning
    // its 36 cards would hand the caller page 1's products under page 17's number, for ever.
    if (normalized.pageIndex !== null && normalized.pageIndex !== pageIndex) {
      return this.emptyPage(query, pageIndex, fetchedUrl, normalized.totalProducts);
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
}
