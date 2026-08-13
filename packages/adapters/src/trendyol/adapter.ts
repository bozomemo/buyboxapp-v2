/**
 * The Trendyol marketplace adapter (docs/api-references.md §1, doc 10 §3, doc 12 Phase 4.3).
 * Endpoints verified against official docs on 2026-08-12 — see api-references.md for links.
 */
import type { MarketplaceCode } from '@buybox/core';
import type {
  BuyboxObservation,
  ConnectionTestResult,
  Credentials,
  IMarketplaceAdapter,
  ListingSnapshot,
  MarketplaceCapabilities,
  PriceChange,
  SubmissionHandle,
  SubmissionResult,
} from '../ports/marketplace.js';
import { RateLimiter } from '../reliability/rate-limiter.js';
import { realSleep } from '../reliability/retry.js';
import { TRENDYOL_PRODUCTION_BASE_URL, type TrendyolAdapterConfig } from './config.js';
import {
  mapBuyboxInfoToObservation,
  mapVariantToListingSnapshot,
  type TrendyolBuyboxInfo,
  type TrendyolProductFilterResponse,
} from './mapping.js';

export class TrendyolApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'TrendyolApiError';
  }
}

/** api-references §1.4 "Buybox check": max 10 barcodes per request. */
const BUYBOX_BATCH_SIZE = 10;
/** api-references §1.4 "Stock and price update": max 1,000 items per request. */
const PRICE_UPDATE_BATCH_SIZE = 1000;
/** api-references §1.3: page × size must not exceed the API's paging limits; 100 is the max size. */
const LISTING_PAGE_SIZE = 100;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Rate-limit buckets, one per Trendyol "service group" (api-references §1.3). Configured at the
 * lower bound of each published range — the conservative default for an unknown listing tier.
 */
function buildRateLimiter(): RateLimiter {
  const perMinute = (requestsPerMinute: number) => ({
    capacity: requestsPerMinute,
    refillPerMs: requestsPerMinute / 60_000,
  });
  return new RateLimiter({
    productRead: perMinute(1000),
    productWrite: perMinute(200),
    inventoryPriceWrite: perMinute(350),
    buyboxCheck: perMinute(1000),
  });
}

export class TrendyolAdapter implements IMarketplaceAdapter {
  readonly code: MarketplaceCode = 'trendyol';

  readonly capabilities: MarketplaceCapabilities = {
    maxBatchSize: PRICE_UPDATE_BATCH_SIZE,
    competitorPriceDepth: 3, // buybox / 2nd / 3rd (api-references §1.4 "Buybox check")
    exposesCompetitorIdentity: false, // official API is anonymous; identity only via the reporting scrape (§1.6)
    exposesCompetitorStock: false, // scrape-only (§1.6)
    exposesCampaignPrice: true, // priceSeenByCustomer
    supportsConfirmation: true, // batch-request result endpoint
    // Trendyol has no published *daily* quota (unlike Hepsiburada's explicit 10x); this is a
    // conservative estimate derived from the sustained Inventory & Price Write floor (350/min).
    dailyUpdateAllowance: () => 350 * 60 * 24,
  };

  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly rateLimiter = buildRateLimiter();
  private readonly sellerId: string;
  private readonly authHeader: string;
  private readonly userAgent: string;

  constructor(config: TrendyolAdapterConfig) {
    this.baseUrl = config.baseUrl ?? TRENDYOL_PRODUCTION_BASE_URL;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
    this.sellerId = config.credentials.sellerId;
    this.authHeader = `Basic ${Buffer.from(`${config.credentials.apiKey}:${config.credentials.apiSecret}`).toString('base64')}`;
    // api-references §1.2: "{sellerId} - SelfIntegration" or "{sellerId} - {IntegratorName}".
    this.userAgent = `${config.credentials.sellerId} - ${config.credentials.userAgentSuffix}`;
  }

  private async waitForBucket(bucket: string): Promise<void> {
    for (;;) {
      const result = this.rateLimiter.tryAcquire(bucket, Date.now());
      if (result.allowed) return;
      await realSleep(result.retryAfterMs);
    }
  }

  private async request<T>(bucket: string, path: string, init: RequestInit = {}): Promise<T> {
    await this.waitForBucket(bucket);
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader,
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new TrendyolApiError(`Trendyol API ${response.status} on ${path}`, response.status);
    }
    return (await response.json()) as T;
  }

  async testConnection(creds: Credentials): Promise<ConnectionTestResult> {
    try {
      const sellerId = creds.sellerId ?? this.sellerId;
      await this.request<TrendyolProductFilterResponse>(
        'productRead',
        `/product/sellers/${sellerId}/products/approved?page=0&size=1`,
      );
      return { ok: true, detail: `Connected as seller ${sellerId}` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async *fetchListings(cursor?: string): AsyncIterable<ListingSnapshot> {
    let nextPageToken = cursor;
    let page = 0;
    for (;;) {
      const query = nextPageToken
        ? `nextPageToken=${encodeURIComponent(nextPageToken)}`
        : `page=${page}&size=${LISTING_PAGE_SIZE}`;
      const response = await this.request<TrendyolProductFilterResponse>(
        'productRead',
        `/product/sellers/${this.sellerId}/products/approved?${query}`,
      );
      for (const product of response.content) {
        for (const variant of product.variants) {
          yield mapVariantToListingSnapshot(product, variant);
        }
      }
      if (!response.nextPageToken) return;
      nextPageToken = response.nextPageToken;
      page += 1;
    }
  }

  async fetchBuyboxObservations(listingIds: readonly string[]): Promise<BuyboxObservation[]> {
    const observations: BuyboxObservation[] = [];
    for (const batch of chunk(listingIds, BUYBOX_BATCH_SIZE)) {
      const observedAt = new Date();
      const response = await this.request<{ buyboxInfo: TrendyolBuyboxInfo[] }>(
        'buyboxCheck',
        `/product/sellers/${this.sellerId}/products/buybox-information`,
        { method: 'POST', body: JSON.stringify({ barcodes: batch }) },
      );
      for (const info of response.buyboxInfo) {
        observations.push(mapBuyboxInfoToObservation(info, observedAt));
      }
    }
    return observations;
  }

  async submitPriceChanges(batch: readonly PriceChange[]): Promise<SubmissionHandle> {
    if (batch.length > PRICE_UPDATE_BATCH_SIZE) {
      throw new RangeError(
        `Trendyol: batch of ${batch.length} exceeds the ${PRICE_UPDATE_BATCH_SIZE}-item limit (api-references §1.4)`,
      );
    }
    const items = batch.map((change) => ({
      barcode: change.marketplaceListingId,
      salePrice: Number(change.newPrice.toKurus()) / 100,
      ...(change.newListPrice ? { listPrice: Number(change.newListPrice.toKurus()) / 100 } : {}),
    }));
    const response = await this.request<{ batchRequestId: string }>(
      'inventoryPriceWrite',
      `/inventory/sellers/${this.sellerId}/products/price-and-inventory`,
      { method: 'POST', body: JSON.stringify({ items }) },
    );
    return { batchId: response.batchRequestId, submittedAt: new Date() };
  }

  async pollSubmission(handle: SubmissionHandle): Promise<SubmissionResult> {
    const response = await this.request<{
      status: 'COMPLETED' | 'IN_PROGRESS';
      items: readonly {
        requestItem: { barcode: string };
        status: 'SUCCESS' | 'FAILED';
        failureReasons?: readonly string[];
      }[];
    }>('productRead', `/product/sellers/${this.sellerId}/products/batch-requests/${handle.batchId}`);

    if (response.status === 'IN_PROGRESS') {
      return { status: 'pending' };
    }
    return {
      status: 'completed',
      items: response.items.map((item) => ({
        marketplaceListingId: item.requestItem.barcode,
        status: item.status === 'SUCCESS' ? 'success' : 'failed',
        // Raw diagnostic text retained verbatim, not a composed display string (doc 10 §3).
        failureReason:
          item.failureReasons && item.failureReasons.length > 0 ? item.failureReasons.join('; ') : null,
      })),
    };
  }
}
