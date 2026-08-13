/**
 * Tested only against recorded/synthetic fixtures (doc 10 §3, §10) — never a live Trendyol call.
 */
import { Money } from '@buybox/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runMarketplaceContractChecks,
  type MarketplaceContractFixture,
} from '../contract/marketplace-contract.js';
import { TrendyolAdapter, TrendyolApiError } from './adapter.js';
import batchCompleted from './fixtures/batch-request-completed.json' with { type: 'json' };
import batchInProgress from './fixtures/batch-request-in-progress.json' with { type: 'json' };
import buyboxInformation from './fixtures/buybox-information.json' with { type: 'json' };
import productFilterPage1 from './fixtures/product-filter-page1.json' with { type: 'json' };
import productFilterPage2 from './fixtures/product-filter-page2.json' with { type: 'json' };

const credentials = {
  apiKey: 'test-key',
  apiSecret: 'test-secret',
  sellerId: '12345',
  userAgentSuffix: 'SelfIntegration' as const,
};

interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string | undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Routes the fixture-backed fake fetch by path — the fake never makes a network call. */
function createFixtureFetch() {
  const calls: RecordedCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    calls.push({ url, method, headers: new Headers(init?.headers), body: init?.body as string | undefined });

    if (url.includes('/products/approved?page=0&size=1')) {
      return jsonResponse(productFilterPage1);
    }
    if (url.includes('nextPageToken=page-2-token')) {
      return jsonResponse(productFilterPage2);
    }
    if (url.includes('/products/approved?page=0&size=100')) {
      return jsonResponse(productFilterPage1);
    }
    if (url.includes('/products/buybox-information')) {
      return jsonResponse(buyboxInformation);
    }
    if (url.includes('/products/price-and-inventory')) {
      return jsonResponse({ batchRequestId: batchCompleted.batchRequestId });
    }
    if (url.includes('/batch-requests/pending-batch')) {
      return jsonResponse(batchInProgress);
    }
    if (url.includes('/batch-requests/')) {
      return jsonResponse(batchCompleted);
    }
    return jsonResponse({ error: 'unmapped fixture route' }, 404);
  };
  return { fetchFn: vi.fn(fetchFn), calls };
}

describe('TrendyolAdapter', () => {
  let fetchFn: ReturnType<typeof createFixtureFetch>['fetchFn'];
  let adapter: TrendyolAdapter;

  beforeEach(() => {
    ({ fetchFn } = createFixtureFetch());
    adapter = new TrendyolAdapter({ credentials, fetchFn });
  });

  it('sends Basic auth and the mandatory User-Agent header on every request', async () => {
    await adapter.testConnection({});
    const call = fetchFn.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(call.headers);
    expect(headers.get('Authorization')).toBe(
      `Basic ${Buffer.from('test-key:test-secret').toString('base64')}`,
    );
    expect(headers.get('User-Agent')).toBe('12345 - SelfIntegration');
  });

  it('testConnection reports failure without throwing on a non-2xx response', async () => {
    const failing = new TrendyolAdapter({
      credentials,
      fetchFn: vi.fn(async () => jsonResponse({}, 401)),
    });
    const result = await failing.testConnection({});
    expect(result).toEqual({ ok: false, error: expect.stringContaining('401') });
  });

  it('fetchListings paginates via nextPageToken and maps variants to ListingSnapshot', async () => {
    const listings = [];
    for await (const listing of adapter.fetchListings()) {
      listings.push(listing);
    }
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      marketplaceListingId: '1111111111111',
      sellerStockCode: 'SKU-1',
      productName: 'Kablosuz Kulaklık Siyah',
      offeredStock: 12,
      commissionRate: 7.83,
      vatRate: 20,
      isSalable: true,
      isLocked: false,
      lockReasons: [],
    });
    expect(listings[0]?.price.equals(Money.fromMajorUnitsString('149.90'))).toBe(true);
    expect(listings[0]?.customerPrice?.equals(Money.fromMajorUnitsString('139.90'))).toBe(true);

    expect(listings[1]).toMatchObject({
      marketplaceListingId: '2222222222222',
      isSalable: false,
      isLocked: true,
      lockReasons: ['SellerRequest'],
    });
    expect(listings[1]?.listPrice).toBeNull();
  });

  it('fetchBuyboxObservations maps rank, prices and the null-when-unknown rule (never -1)', async () => {
    const observations = await adapter.fetchBuyboxObservations(['1111111111111', '2222222222222']);
    expect(observations).toHaveLength(2);
    expect(observations[0]?.rank).toBe(1);
    expect(observations[0]?.hasMultipleSeller).toBe(true);
    expect(observations[0]?.secondPrice?.equals(Money.fromMajorUnitsString('154.90'))).toBe(true);
    expect(observations[1]?.rank).toBeNull();
    expect(observations[1]?.buyboxPrice).toBeNull();
  });

  it('submitPriceChanges then pollSubmission round-trips through pending to completed with per-item results', async () => {
    const pendingAdapter = new TrendyolAdapter({
      credentials,
      fetchFn: vi.fn(async (input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('price-and-inventory')) return jsonResponse({ batchRequestId: 'pending-batch' });
        if (url.includes('batch-requests/pending-batch')) return jsonResponse(batchInProgress);
        return jsonResponse({}, 404);
      }),
    });
    const handle = await pendingAdapter.submitPriceChanges([
      { marketplaceListingId: '1111111111111', newPrice: Money.fromMajorUnitsString('129.90') },
    ]);
    expect(handle.batchId).toBe('pending-batch');
    const pending = await pendingAdapter.pollSubmission(handle);
    expect(pending).toEqual({ status: 'pending' });

    const handle2 = await adapter.submitPriceChanges([
      { marketplaceListingId: '1111111111111', newPrice: Money.fromMajorUnitsString('129.90') },
    ]);
    const completed = await adapter.pollSubmission(handle2);
    expect(completed.status).toBe('completed');
    if (completed.status === 'completed') {
      expect(completed.items).toEqual([
        { marketplaceListingId: '1111111111111', status: 'success', failureReason: null },
        {
          marketplaceListingId: '2222222222222',
          status: 'failed',
          failureReason: 'Price below the minimum allowed for this category',
        },
      ]);
    }
  });

  it('rejects a batch larger than the 1,000-item limit before making a request', async () => {
    const oversized = Array.from({ length: 1001 }, (_, i) => ({
      marketplaceListingId: `barcode-${i}`,
      newPrice: Money.fromKurus(1000n),
    }));
    await expect(adapter.submitPriceChanges(oversized)).rejects.toThrow(/1000-item limit/);
  });

  it('throws TrendyolApiError with the HTTP status on a non-2xx response outside testConnection', async () => {
    const failing = new TrendyolAdapter({ credentials, fetchFn: vi.fn(async () => jsonResponse({}, 500)) });
    await expect(failing.fetchBuyboxObservations(['1111111111111'])).rejects.toBeInstanceOf(TrendyolApiError);
  });

  it('passes the shared marketplace contract suite', async () => {
    const fixture: MarketplaceContractFixture = {
      credentials: {},
      knownListingIds: ['1111111111111', '2222222222222'],
      priceChanges: [
        { marketplaceListingId: '1111111111111', newPrice: Money.fromMajorUnitsString('129.90') },
      ],
    };
    await expect(runMarketplaceContractChecks(adapter, fixture)).resolves.toBeUndefined();
  });
});
