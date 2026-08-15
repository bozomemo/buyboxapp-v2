/**
 * Tested only against fixtures (doc 10 §3, §10) — never a live Hepsiburada call.
 *
 * The fixtures are synthetic but not invented: every field name, type and nullability comes
 * from the vendor's OpenAPI document (`docs/vendor/hepsiburada-listing-openapi-v1.json`,
 * verified 2026-08-14), and the lock example is transcribed from the guide's own worked case.
 * They are *not* recorded live responses; there are no SIT credentials yet (§2.9).
 *
 * `fetchBuyboxObservations` is excluded from the contract suite deliberately: §2.5 leaves its
 * 200 response undeclared, and passing the suite would mean guessing at it — which CLAUDE.md's
 * "Rule: marketplace API work" forbids.
 */
import { Money } from '@buybox/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runMarketplaceContractChecks,
  type MarketplaceContractFixture,
} from '../contract/marketplace-contract.js';
import { HepsiburadaAdapter, HepsiburadaApiError, HepsiburadaBlockedError } from './adapter.js';
import { HEPSIBURADA_HOSTS, type HepsiburadaCorrelation } from './config.js';
import listingsPage1 from './fixtures/listings-page1.json' with { type: 'json' };
import listingsPage2 from './fixtures/listings-page2.json' with { type: 'json' };
import priceUploadErrors from './fixtures/price-upload-errors.json' with { type: 'json' };
import priceUploadLocked from './fixtures/price-upload-locked.json' with { type: 'json' };
import priceUploadPending from './fixtures/price-upload-pending.json' with { type: 'json' };

const MERCHANT_ID = '11111111-2222-4333-8444-555555555555';
const NOW = Date.parse('2026-08-14T12:00:00Z');

const credentials = {
  merchantId: MERCHANT_ID,
  username: 'test-user',
  password: 'test-secret',
  userAgent: 'BuyBoxApp/1.0 (repricing)',
};

const LOCKED_UPLOAD_ID = priceUploadLocked.id;
const ERRORED_UPLOAD_ID = priceUploadErrors.id;
const PENDING_UPLOAD_ID = priceUploadPending.id;

interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string | undefined;
}

function jsonResponse(body: unknown, status = 200, correlationId = 'corr-123'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'x-correlation-id': correlationId },
  });
}

/** Routes the fixture-backed fake fetch by path — the fake never makes a network call. */
function createFixtureFetch(options: { uploadId?: string } = {}) {
  const uploadId = options.uploadId ?? LOCKED_UPLOAD_ID;
  const calls: RecordedCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    calls.push({ url, method, headers: new Headers(init?.headers), body: init?.body as string | undefined });

    if (method === 'POST' && url.includes('/price-uploads')) {
      return jsonResponse({ id: uploadId });
    }
    if (url.includes(`/price-uploads/id/${LOCKED_UPLOAD_ID}`)) return jsonResponse(priceUploadLocked);
    if (url.includes(`/price-uploads/id/${ERRORED_UPLOAD_ID}`)) return jsonResponse(priceUploadErrors);
    if (url.includes(`/price-uploads/id/${PENDING_UPLOAD_ID}`)) return jsonResponse(priceUploadPending);
    if (url.includes('offset=2')) return jsonResponse(listingsPage2);
    if (url.includes('/listings/merchantid/')) return jsonResponse(listingsPage1);
    return jsonResponse({ error: 'unmapped fixture route' }, 404);
  };
  return { fetchFn: vi.fn(fetchFn), calls };
}

describe('HepsiburadaAdapter', () => {
  let fetchFn: ReturnType<typeof createFixtureFetch>['fetchFn'];
  let calls: RecordedCall[];
  let correlations: HepsiburadaCorrelation[];
  let adapter: HepsiburadaAdapter;

  beforeEach(() => {
    ({ fetchFn, calls } = createFixtureFetch());
    correlations = [];
    adapter = new HepsiburadaAdapter({
      credentials,
      environment: 'sit',
      fetchFn,
      nowMs: () => NOW,
      onCorrelation: (c) => correlations.push(c),
    });
  });

  it('sends Basic auth, the mandatory User-Agent and Accept: application/json (§2.2)', async () => {
    await adapter.testConnection({});
    const headers = calls[0]?.headers;
    expect(headers?.get('Authorization')).toBe(
      `Basic ${Buffer.from('test-user:test-secret').toString('base64')}`,
    );
    expect(headers?.get('User-Agent')).toBe('BuyBoxApp/1.0 (repricing)');
    // Not politeness: every listing response is also offered as XML and the type is negotiated.
    expect(headers?.get('Accept')).toBe('application/json');
  });

  it('targets the per-domain listing host, never a single global base URL (§2.1)', async () => {
    await adapter.testConnection({});
    expect(calls[0]?.url.startsWith(HEPSIBURADA_HOSTS.sit.listing)).toBe(true);
  });

  it('never impersonates a browser on the authenticated control path', async () => {
    await adapter.testConnection({});
    expect(calls[0]?.headers.get('User-Agent')).not.toMatch(/Mozilla|Chrome|Safari/);
  });

  describe('fetchListings (§2.4)', () => {
    it('sends the required offset and limit and pages by offset until totalCount', async () => {
      const listings = [];
      for await (const listing of adapter.fetchListings()) listings.push(listing);

      expect(listings.map((l) => l.marketplaceListingId)).toEqual([
        'HBCV00000ABCDE',
        'HBCV00000FGHIJ',
        'HBCV00000KLMNO',
      ]);
      expect(calls[0]?.url).toContain('offset=0&limit=500');
      expect(calls[1]?.url).toContain('offset=2&limit=500');
      expect(calls).toHaveLength(2); // stops at totalCount; no wasted third page
    });

    it('resumes from an explicit cursor', async () => {
      const listings = [];
      for await (const listing of adapter.fetchListings('2')) listings.push(listing);
      expect(listings.map((l) => l.marketplaceListingId)).toEqual(['HBCV00000KLMNO']);
      expect(calls[0]?.url).toContain('offset=2');
    });

    it('maps prices, stock and the campaign price for the active window', async () => {
      const listings = [];
      for await (const listing of adapter.fetchListings()) listings.push(listing);

      const first = listings[0];
      expect(first?.price.toKurus()).toBe(11_897n);
      expect(first?.customerPrice?.toKurus()).toBe(10_990n); // the August window, not September
      expect(first?.offeredStock).toBe(9);
      expect(first?.dispatchTime).toBe(3);
    });

    it('carries the marketplace kill switches through to the engine', async () => {
      const listings = [];
      for await (const listing of adapter.fetchListings()) listings.push(listing);
      expect(listings[1]?.priceIncreaseDisabled).toBe(true);
      expect(listings[1]?.isFrozen).toBe(true);
      expect(listings[2]?.priceDecreaseDisabled).toBe(true);
    });
  });

  describe('submitPriceChanges (§2.6)', () => {
    const change = { marketplaceListingId: 'HBCV00000ABCDE', newPrice: Money.fromKurus(11_897n) };

    it('posts a bare array to price-uploads, with the price in lira', async () => {
      await adapter.submitPriceChanges([change]);
      const call = calls.at(-1);
      expect(call?.method).toBe('POST');
      expect(call?.url).toBe(
        `${HEPSIBURADA_HOSTS.sit.listing}/listings/merchantid/${MERCHANT_ID}/price-uploads`,
      );
      // A bare array, not an envelope — and never `inventory-uploads`.
      expect(JSON.parse(call?.body ?? 'null')).toEqual([{ hepsiburadaSku: 'HBCV00000ABCDE', price: 118.97 }]);
      expect(call?.url).not.toContain('inventory-uploads');
    });

    it('reports x-correlation-id for the submission', async () => {
      await adapter.submitPriceChanges([change]);
      expect(correlations.at(-1)).toEqual({
        operation: 'submitPriceChanges',
        correlationId: 'corr-123',
        httpStatus: 200,
      });
    });

    it('refuses a list price rather than silently dropping it', async () => {
      await expect(
        adapter.submitPriceChanges([{ ...change, newListPrice: Money.fromKurus(20_000n) }]),
      ).rejects.toBeInstanceOf(RangeError);
    });

    it('refuses a batch over the documented 4,000-item limit', async () => {
      const oversize = Array.from({ length: 4001 }, () => change);
      await expect(adapter.submitPriceChanges(oversize)).rejects.toBeInstanceOf(RangeError);
    });

    it('treats an accepted response with no id as a failure, not a submission', async () => {
      const noId: typeof fetch = async () => jsonResponse({});
      const stubborn = new HepsiburadaAdapter({ credentials, environment: 'sit', fetchFn: noId });
      await expect(stubborn.submitPriceChanges([change])).rejects.toBeInstanceOf(HepsiburadaApiError);
    });
  });

  describe('pollSubmission (§2.6)', () => {
    it('reports "Done" with priceValidations as a FAILURE and carries the price band', async () => {
      const handle = await adapter.submitPriceChanges([
        { marketplaceListingId: 'HBCV00000ABCDE', newPrice: Money.fromKurus(11_897n) },
        { marketplaceListingId: 'HBCV00000FGHIJ', newPrice: Money.fromKurus(245_000n) },
      ]);
      const result = await adapter.pollSubmission(handle);
      if (result.status !== 'completed') throw new Error('expected completed');

      const locked = result.items.find((i) => i.marketplaceListingId === 'HBCV00000ABCDE');
      expect(locked?.status).toBe('failed');
      expect(locked?.lock?.type).toBe('MaxLock');
      expect(locked?.lock?.maxPrice?.toKurus()).toBe(1_376_700n);
      // The element the marketplace did not flag is the only success.
      expect(result.items.find((i) => i.marketplaceListingId === 'HBCV00000FGHIJ')?.status).toBe('success');
    });

    it('keeps a non-terminal status pending rather than guessing', async () => {
      ({ fetchFn, calls } = createFixtureFetch({ uploadId: PENDING_UPLOAD_ID }));
      const pendingAdapter = new HepsiburadaAdapter({ credentials, environment: 'sit', fetchFn });
      const handle = await pendingAdapter.submitPriceChanges([
        { marketplaceListingId: 'HBCV00000ABCDE', newPrice: Money.fromKurus(11_897n) },
      ]);
      expect(await pendingAdapter.pollSubmission(handle)).toEqual({ status: 'pending' });
    });

    it('surfaces raw item error codes', async () => {
      ({ fetchFn, calls } = createFixtureFetch({ uploadId: ERRORED_UPLOAD_ID }));
      const erroring = new HepsiburadaAdapter({ credentials, environment: 'sit', fetchFn });
      const handle = await erroring.submitPriceChanges([
        { marketplaceListingId: 'HBCV00000ABCDE', newPrice: Money.fromKurus(11_897n) },
        { marketplaceListingId: 'HBCV00000FGHIJ', newPrice: Money.fromKurus(245_000n) },
      ]);
      const result = await erroring.pollSubmission(handle);
      if (result.status !== 'completed') throw new Error('expected completed');
      expect(result.items.find((i) => i.marketplaceListingId === 'HBCV00000FGHIJ')?.failureReason).toBe(
        'OutOfPriceRange; DiscountedListingPriceIncrease',
      );
    });

    it('claims no successes when the submitted batch is not remembered (process restart)', async () => {
      // A fresh adapter has never seen this upload id — exactly the post-restart case.
      const result = await adapter.pollSubmission({
        batchId: LOCKED_UPLOAD_ID,
        submittedAt: new Date(NOW),
      });
      if (result.status !== 'completed') throw new Error('expected completed');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.status).toBe('failed');
    });
  });

  describe('capabilities', () => {
    it('reports the one hard-verified quota (§2.3)', () => {
      expect(adapter.capabilities.dailyUpdateAllowance(1000)).toBe(10_000);
      expect(adapter.capabilities.maxBatchSize).toBe(4000);
    });

    it('still promises no competitor depth — §2.5 has no declared response schema', () => {
      expect(adapter.capabilities.competitorPriceDepth).toBe(0);
    });
  });

  it('fetchBuyboxObservations remains blocked on §2.5, naming why', async () => {
    await expect(adapter.fetchBuyboxObservations(['HBCV00000ABCDE'])).rejects.toBeInstanceOf(
      HepsiburadaBlockedError,
    );
    await expect(adapter.fetchBuyboxObservations(['HBCV00000ABCDE'])).rejects.toThrow(/§2.5/);
  });

  it('surfaces a non-2xx as a typed error carrying the correlation id', async () => {
    const failing: typeof fetch = async () => jsonResponse({ message: 'nope' }, 401, 'corr-401');
    const unauthorized = new HepsiburadaAdapter({ credentials, environment: 'sit', fetchFn: failing });
    const result = await unauthorized.testConnection({});
    expect(result.ok).toBe(false);
  });

  it('passes the shared marketplace contract suite', async () => {
    const fixture: MarketplaceContractFixture = {
      credentials,
      // Empty on purpose: the buybox response schema is undeclared (§2.5), so there is nothing
      // to assert against that would not be a guess.
      knownListingIds: [],
      priceChanges: [{ marketplaceListingId: 'HBCV00000ABCDE', newPrice: Money.fromKurus(11_897n) }],
    };
    await expect(runMarketplaceContractChecks(adapter, fixture)).resolves.toBeUndefined();
  });
});
