/**
 * `HepsiburadaProductDetailSource` — reads one Hepsiburada product page for what the product
 * *is*, above all its barcode (api-references §2.14, verified live 2026-08-28).
 *
 * Honest client, plain `fetch`, no browser and no exception claimed: the page answered 200 to a
 * request carrying nothing but our own user agent, exactly as the catalogue page did.
 *
 * ## The URL cannot be guessed
 *
 * Hepsiburada's product URL is `/{slug}-pm-{productId}` — a display slug and the **parent**
 * product id, neither of which can be derived from the SKU this port is keyed by. The short form
 * `/p-{sku}` was measured on 2026-08-28 and returns **404**. So this source requires the URL the
 * catalogue sweep captured alongside the product and refuses when it has none, rather than
 * assembling a URL out of a name — which would be reading display text to make a request, and
 * would fail in the way that is hardest to notice: on the products whose names contain the
 * characters the slug rules drop.
 *
 * ## Rate, and why it is the slow tier
 *
 * One request per **product**, against 36 products per catalogue page. Whiskas' 564 products
 * cost 16 catalogue requests and 564 of these. That thirty-fold difference is why this is a
 * separate port and a separate job with its own limiter: a barcode backfill is a background
 * drip that may take days and must never be able to starve — or be starved by — a sweep.
 */
import type { MarketplaceCode } from '@buybox/core';
import {
  ProductDetailError,
  type IProductDetailSource,
  type ProductDetailSnapshot,
} from '../../ports/product-detail-source.js';
import { RateLimiter } from '../../reliability/rate-limiter.js';
import { realSleep } from '../../reliability/retry.js';
import { extractReduxStoreState, HepsiburadaStateNotFoundError } from '../public-page/embedded-state.js';
import {
  HepsiburadaProductDetailSchemaError,
  HepsiburadaProductMismatchError,
  normalizeHepsiburadaProductDetail,
} from './normalize.js';

export const HEPSIBURADA_PUBLIC_BASE_URL = 'https://www.hepsiburada.com';

/**
 * Defaults, **not** derived from any published figure. Slower than the catalogue sweep's 6/min
 * because this tier is the one that runs for hours: a brand's whole shelf, one page at a time.
 * Recorded in doc 08 §12.
 */
export const HEPSIBURADA_PRODUCT_DETAIL_DEFAULTS = {
  requestsPerMinute: 4,
  burst: 2,
  cacheTtlMs: 60 * 60_000,
  requestTimeoutMs: 25_000,
} as const;

export interface HepsiburadaProductDetailSourceConfig {
  /** Injectable for tests — fixture-backed, never a live call (doc 10 §10, CLAUDE.md). */
  readonly fetchFn?: typeof fetch;
  readonly baseUrl?: string;
  /** The honest `SCRAPER_USER_AGENT`; this page accepts it. */
  readonly userAgent: string;
  readonly requestsPerMinute?: number;
  readonly burst?: number;
  readonly cacheTtlMs?: number;
  readonly requestTimeoutMs?: number;
  readonly nowMs?: () => number;
}

interface CacheEntry {
  readonly snapshot: ProductDetailSnapshot;
  readonly storedAtMs: number;
}

const RATE_LIMIT_BUCKET = 'productDetail';

export class HepsiburadaProductDetailSource implements IProductDetailSource {
  readonly code: MarketplaceCode = 'hepsiburada';

  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly cacheTtlMs: number;
  private readonly requestTimeoutMs: number;
  private readonly nowMs: () => number;
  private readonly rateLimiter: RateLimiter;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(config: HepsiburadaProductDetailSourceConfig) {
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
    this.baseUrl = config.baseUrl ?? HEPSIBURADA_PUBLIC_BASE_URL;
    this.userAgent = config.userAgent;
    this.cacheTtlMs = config.cacheTtlMs ?? HEPSIBURADA_PRODUCT_DETAIL_DEFAULTS.cacheTtlMs;
    this.requestTimeoutMs =
      config.requestTimeoutMs ?? HEPSIBURADA_PRODUCT_DETAIL_DEFAULTS.requestTimeoutMs;
    this.nowMs = config.nowMs ?? (() => Date.now());
    const perMinute =
      config.requestsPerMinute ?? HEPSIBURADA_PRODUCT_DETAIL_DEFAULTS.requestsPerMinute;
    this.rateLimiter = new RateLimiter({
      [RATE_LIMIT_BUCKET]: {
        capacity: config.burst ?? HEPSIBURADA_PRODUCT_DETAIL_DEFAULTS.burst,
        refillPerMs: perMinute / 60_000,
      },
    });
  }

  /** @throws {ProductDetailError} when no usable URL was captured for the product. */
  buildUrl(productRef: string, url: string | null | undefined): string {
    const captured = url?.trim() ?? '';
    if (captured === '') {
      throw new ProductDetailError(
        `Hepsiburada product ${productRef} has no captured page url; the short /p-{sku} form is a 404 and a url is never derived from a name (api-references §2.14)`,
        'fetchFailed',
      );
    }
    if (captured.startsWith('http://') || captured.startsWith('https://')) return captured;
    return `${this.baseUrl}${captured.startsWith('/') ? '' : '/'}${captured}`;
  }

  private async waitForToken(): Promise<void> {
    for (;;) {
      const result = this.rateLimiter.tryAcquire(RATE_LIMIT_BUCKET, this.nowMs());
      if (result.allowed) return;
      await realSleep(result.retryAfterMs);
    }
  }

  private readCache(url: string): ProductDetailSnapshot | undefined {
    const entry = this.cache.get(url);
    if (!entry) return undefined;
    if (this.nowMs() - entry.storedAtMs >= this.cacheTtlMs) {
      this.cache.delete(url);
      return undefined;
    }
    return { ...entry.snapshot, fromCache: true };
  }

  async fetchProductDetail(productRef: string, url?: string | null): Promise<ProductDetailSnapshot> {
    const target = this.buildUrl(productRef, url);

    const cached = this.readCache(target);
    if (cached) return cached;

    await this.waitForToken();

    let body: string;
    let fetchedUrl = target;
    try {
      const response = await this.fetchFn(target, {
        headers: { 'User-Agent': this.userAgent, Accept: 'text/html,application/xhtml+xml,*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      if (!response.ok) {
        throw new ProductDetailError(
          `Hepsiburada product page ${response.status} for ${target}`,
          'fetchFailed',
          undefined,
          response.status,
        );
      }
      fetchedUrl = response.url !== '' ? response.url : target;
      body = await response.text();
    } catch (error) {
      if (error instanceof ProductDetailError) throw error;
      throw new ProductDetailError(
        `Hepsiburada product page fetch failed for ${target}: ${error instanceof Error ? error.message : String(error)}`,
        'fetchFailed',
        error,
      );
    }

    let normalized;
    try {
      normalized = normalizeHepsiburadaProductDetail(extractReduxStoreState(body), productRef);
    } catch (error) {
      // A page about a different product parses perfectly and is about the wrong thing — the one
      // outcome a caller must not store. It gets its own kind so a caller cannot mistake it for
      // a transport hiccup and retry its way into writing the wrong barcode.
      if (error instanceof HepsiburadaProductMismatchError) {
        throw new ProductDetailError(error.message, 'identityMismatch', error);
      }
      const reason =
        error instanceof HepsiburadaStateNotFoundError ||
        error instanceof HepsiburadaProductDetailSchemaError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      throw new ProductDetailError(
        `Hepsiburada product page parse failed for ${fetchedUrl}: ${reason}`,
        'parseFailed',
        error,
      );
    }

    const snapshot: ProductDetailSnapshot = {
      detail: { marketplaceCode: this.code, ...normalized.detail },
      fetchedUrl,
      observedAt: new Date(this.nowMs()),
      diagnostics: normalized.diagnostics,
      fromCache: false,
    };
    this.cache.set(target, { snapshot, storedAtMs: this.nowMs() });
    return snapshot;
  }
}
