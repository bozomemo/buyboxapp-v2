/**
 * `TrendyolSellerIdentitySource` — resolves one storefront's firm, on demand
 * (doc 06 §12.4 Faz 7, api-references §1.6, guide §29).
 *
 * ## Why this asks for the page the scraper refuses to ask for
 *
 * `TrendyolPublicPageSource.buildUrl` **strips** `merchantId` from every URL, because a
 * merchant-scoped page reports that merchant as the winner on every row regardless of the real
 * buybox order (measured 2026-08-17 against the official buybox endpoint, which said rank 8 for
 * a product the scoped page said we were 1st on). This class does the opposite and **adds**
 * `merchantId`, because that is what makes the page carry `officialName`, `taxNumber`,
 * `taxOffice`, `registeredEmailAddress` and `address` for that merchant (guide §29).
 *
 * The two are not in tension; they are the same finding used twice. A merchant-scoped response
 * is authoritative about *who that merchant is* and worthless about *where they rank*. So this
 * class is the only place in the codebase allowed to add the parameter, `ISellerIdentitySource`
 * has no rank, price or winner field to leak one into, and `packages/jobs` never writes an
 * observation row from anything this returns.
 *
 * ## One at a time
 *
 * Calls are serialised through an internal promise chain, on top of the rate limiter. The limiter
 * bounds requests per minute; the chain bounds *concurrency to one*, which is the property doc 12
 * Faz 7 actually asks for ("toplu değil, tek tek"). They are different guarantees: a token bucket
 * with a burst of two happily allows two simultaneous browser page loads, and a resolution the
 * operator triggered by clicking two rows should be two visits, not a small parallel crawl. The
 * number of sellers worth resolving is the number a person is willing to write a notice to.
 *
 * No response cache, unlike the scraper. A scrape re-reads the same product page for several
 * listings within minutes; an identity resolution happens because a person pressed a button, and
 * the answer they want when they press it again is a fresh one. The stored row in
 * `competitor_seller_identities` is the cache, and it has an operator-visible timestamp.
 */
import type { MarketplaceCode } from '@buybox/core';
import type { ProductPageRef } from '../../ports/competitor-source.js';
import {
  SellerIdentityError,
  type ISellerIdentitySource,
  type SellerIdentitySnapshot,
} from '../../ports/seller-identity-source.js';
import { RateLimiter } from '../../reliability/rate-limiter.js';
import { realSleep, retryAsync } from '../../reliability/retry.js';
import type { NodeFetchInit, NodeFetchResponse } from '../public-page/node-https-fetch.js';
import { createPlaywrightFetcher, type PlaywrightFetcher } from '../public-page/playwright-fetch.js';
import { extractSharedProps, SharedPropsNotFoundError } from '../public-page/shared-props.js';
import { TRENDYOL_PUBLIC_BASE_URL, TRENDYOL_SCRAPE_DEFAULTS } from '../public-page/source.js';
import {
  normalizeTrendyolSellerIdentity,
  TrendyolIdentityMismatchError,
  TrendyolIdentitySchemaError,
} from './normalize.js';

/**
 * Deliberately far below the scraper's 30/min. This is not a throughput path: it runs when an
 * operator picks a seller out of a report, and the volume is bounded by how many firms a person
 * intends to contact. A slow ceiling here costs nothing and keeps an accidental loop from turning
 * an on-demand lookup into a crawl.
 */
export const TRENDYOL_IDENTITY_DEFAULTS = {
  requestsPerMinute: 6,
  burst: 2,
} as const;

export interface TrendyolSellerIdentitySourceConfig {
  /** Injectable for tests — fixture-backed, never a live call and never a real browser launch. */
  readonly fetchFn?: (url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>;
  readonly baseUrl?: string;
  /** Sent verbatim; see `TrendyolPublicPageSourceConfig.userAgent` for the recorded exception. */
  readonly userAgent: string;
  readonly requestsPerMinute?: number;
  readonly burst?: number;
  readonly requestTimeoutMs?: number;
  readonly nowMs?: () => number;
  readonly retryOn403MaxAttempts?: number;
  readonly retryOn403BaseMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const RATE_LIMIT_BUCKET = 'sellerIdentity';

export class TrendyolSellerIdentitySource implements ISellerIdentitySource {
  readonly code: MarketplaceCode = 'trendyol';

  private readonly fetchFn: (url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>;
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly requestTimeoutMs: number;
  private readonly nowMs: () => number;
  private readonly rateLimiter: RateLimiter;
  private readonly retryOn403MaxAttempts: number;
  private readonly retryOn403BaseMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly ownedFetcher: PlaywrightFetcher | undefined;
  /** The serialising chain — see this file's header. Never rejects; failures are unwrapped per call. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(config: TrendyolSellerIdentitySourceConfig) {
    if (config.fetchFn) {
      this.fetchFn = config.fetchFn;
      this.ownedFetcher = undefined;
    } else {
      this.ownedFetcher = createPlaywrightFetcher();
      this.fetchFn = this.ownedFetcher.fetch;
    }
    this.baseUrl = config.baseUrl ?? TRENDYOL_PUBLIC_BASE_URL;
    this.userAgent = config.userAgent;
    this.requestTimeoutMs = config.requestTimeoutMs ?? TRENDYOL_SCRAPE_DEFAULTS.requestTimeoutMs;
    this.nowMs = config.nowMs ?? (() => Date.now());
    this.retryOn403MaxAttempts = config.retryOn403MaxAttempts ?? TRENDYOL_SCRAPE_DEFAULTS.retryOn403MaxAttempts;
    this.retryOn403BaseMs = config.retryOn403BaseMs ?? TRENDYOL_SCRAPE_DEFAULTS.retryOn403BaseMs;
    this.sleep = config.sleep ?? realSleep;
    const perMinute = config.requestsPerMinute ?? TRENDYOL_IDENTITY_DEFAULTS.requestsPerMinute;
    this.rateLimiter = new RateLimiter({
      [RATE_LIMIT_BUCKET]: {
        capacity: config.burst ?? TRENDYOL_IDENTITY_DEFAULTS.burst,
        refillPerMs: perMinute / 60_000,
      },
    });
  }

  /**
   * The product page for `ref`, requested **as** `sellerRef`.
   *
   * Any `merchantId` already on a captured `productUrl` is our own seller id (mapping.ts), so it
   * is overwritten rather than appended to — `set`, not `append`. Every other query parameter is
   * left as Trendyol supplied it, exactly as the scraper leaves them.
   */
  buildUrl(ref: ProductPageRef, sellerRef: string): string {
    const base =
      ref.url !== null && ref.url.trim() !== ''
        ? ref.url.startsWith('http')
          ? ref.url
          : `${this.baseUrl}${ref.url.startsWith('/') ? '' : '/'}${ref.url}`
        : ref.contentId !== null && ref.contentId.trim() !== ''
          ? `${this.baseUrl}/marka/urun-p-${encodeURIComponent(ref.contentId)}`
          : null;
    if (base === null) {
      throw new SellerIdentityError(
        'Trendyol product page ref has neither a url nor a contentId',
        'fetchFailed',
      );
    }
    const url = new URL(base);
    url.searchParams.set('merchantId', sellerRef);
    return url.toString();
  }

  private async waitForToken(): Promise<void> {
    for (;;) {
      const result = this.rateLimiter.tryAcquire(RATE_LIMIT_BUCKET, this.nowMs());
      if (result.allowed) return;
      await realSleep(result.retryAfterMs);
    }
  }

  async resolveSellerIdentity(ref: ProductPageRef, sellerRef: string): Promise<SellerIdentitySnapshot> {
    if (sellerRef.trim() === '') {
      throw new SellerIdentityError('Seller ref is empty — nothing to resolve', 'fetchFailed');
    }
    // Chained before any work so two concurrent callers queue rather than overlap. The chain is
    // advanced with a settled-either-way promise: one caller's failure must not poison the next.
    const run = this.queue.then(
      () => this.resolveOnce(ref, sellerRef),
      () => this.resolveOnce(ref, sellerRef),
    );
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async resolveOnce(ref: ProductPageRef, sellerRef: string): Promise<SellerIdentitySnapshot> {
    const url = this.buildUrl(ref, sellerRef);

    let html: string;
    let fetchedUrl = url;
    try {
      const oneAttempt = async (): Promise<{ readonly html: string; readonly fetchedUrl: string }> => {
        await this.waitForToken();
        const response = await this.fetchFn(url, {
          headers: { 'User-Agent': this.userAgent, Accept: 'text/html' },
          redirect: 'follow',
          signal: AbortSignal.timeout(this.requestTimeoutMs),
          timeoutMs: this.requestTimeoutMs,
        });
        if (!response.ok) {
          throw new SellerIdentityError(
            `Trendyol merchant page ${response.status} for ${url}`,
            'fetchFailed',
            undefined,
            response.status,
          );
        }
        return { html: await response.text(), fetchedUrl: response.url !== '' ? response.url : url };
      };
      const result = await retryAsync(oneAttempt, {
        maxAttempts: this.retryOn403MaxAttempts,
        baseMs: this.retryOn403BaseMs,
        factor: 2,
        maxDelayMs: 5_000,
        sleep: this.sleep,
        // Same measured flakiness as the scraper: only 403 alternates per-request.
        isRetryable: (error) => error instanceof SellerIdentityError && error.httpStatus === 403,
      });
      html = result.html;
      fetchedUrl = result.fetchedUrl;
    } catch (error) {
      if (error instanceof SellerIdentityError) throw error;
      throw new SellerIdentityError(
        `Trendyol merchant page fetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
        'fetchFailed',
        error,
      );
    }

    let normalized;
    try {
      normalized = normalizeTrendyolSellerIdentity(extractSharedProps(html), sellerRef);
    } catch (error) {
      if (error instanceof TrendyolIdentityMismatchError) {
        // Not a parse failure: the page is fine, it is about a different firm. Kept distinct so
        // the caller never stores one company's tax number against another's storefront.
        throw new SellerIdentityError(error.message, 'identityMismatch', error);
      }
      if (error instanceof SharedPropsNotFoundError || error instanceof TrendyolIdentitySchemaError) {
        throw new SellerIdentityError(
          `Trendyol merchant page parse failed for ${fetchedUrl}: ${error.message}`,
          'parseFailed',
          error,
        );
      }
      throw new SellerIdentityError(
        `Trendyol merchant page parse failed for ${fetchedUrl}: ${error instanceof Error ? error.message : String(error)}`,
        'parseFailed',
        error,
      );
    }

    return {
      identity: { marketplaceCode: this.code, ...normalized.identity },
      fetchedUrl,
      resolvedAt: new Date(this.nowMs()),
      diagnostics: normalized.diagnostics,
    };
  }

  /** Closes the owned Playwright browser, if this instance launched one. Worker shutdown only. */
  async close(): Promise<void> {
    await this.ownedFetcher?.close();
  }
}
