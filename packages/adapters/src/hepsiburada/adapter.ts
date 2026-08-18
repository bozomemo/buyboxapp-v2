/**
 * The Hepsiburada marketplace adapter (docs/api-references.md §2, doc 10 §3, doc 12 Phase 4.4).
 *
 * Schemas verified 2026-08-14 against the vendor's own OpenAPI 3.0.1 document, stored verbatim
 * at `docs/vendor/hepsiburada-listing-openapi-v1.json` with the portal guide beside it.
 * api-references §2.2 / §2.4 / §2.6 / §2.10 are written from it; §2.12 records how to re-fetch
 * it. Read those, not this comment, and never the legacy app (CLAUDE.md).
 *
 * Three things here are easy to get wrong and are load-bearing:
 *
 *   - **Submission goes through `price-uploads` (3 fields), never `inventory-uploads`** (18
 *     near-all-mandatory fields, so a price change re-sends the whole listing configuration and
 *     any field we get wrong silently overwrites live data). The legacy app used the inventory
 *     endpoint; that is one more reason not to copy it.
 *   - **`status: "Done"` with a non-empty `priceValidations[]` is a failure, not a success.**
 *     The SKU has been locked (`MinLock`/`MaxLock`) and is off sale. `pollSubmission` reports
 *     those elements as `failed` and carries the marketplace's price band on `item.lock`.
 *   - **`priceIncreaseDisabled` / `priceDecreaseDisabled`** are per-listing marketplace kill
 *     switches carried on every `ListingSnapshot`. Submitting against one is rejected *and*
 *     burns daily allowance (§2.3).
 *
 * Still unimplemented, and deliberately so — `fetchBuyboxObservations`. The endpoint and its
 * ≤10-SKU limit are confirmed, but the OpenAPI declares its 200 response with **no schema**
 * (§2.5), so there is nothing to normalise against except a prose field list. Record one real
 * SIT response as a fixture first, exactly as §2.11 was done. The same applies to the
 * commission service (§2.7), which is also where the pre-sale product VAT rate may live —
 * confirmed absent from the listing schema, and a wrong VAT rate produces a wrong floor price.
 *
 * Not enforced here, by design: the ≤5 simultaneous pending/processing uploads limit (§2.3).
 * The adapter cannot see how many batches the rest of the system has in flight; that budget
 * belongs to the job layer, which already owns the daily allowance.
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
import { HEPSIBURADA_HOSTS, type HepsiburadaAdapterConfig, type HepsiburadaCorrelation } from './config.js';
import {
  mapListingToSnapshot,
  mapPriceUploadResult,
  type HepsiburadaListingsResponse,
  type HepsiburadaPriceUploadResult,
} from './mapping.js';

export { HEPSIBURADA_HOSTS } from './config.js';

export class HepsiburadaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly correlationId: string | null = null,
  ) {
    super(message);
    this.name = 'HepsiburadaApiError';
  }
}

/**
 * Kept under its original name so existing call sites and tests are unaffected, but its meaning
 * narrowed on 2026-08-14: it no longer marks "the documentation is unreachable". It now marks
 * the one operation whose **response schema the vendor does not declare** — see §2.5 and the
 * class doc. Everything else on this adapter is implemented.
 */
export class HepsiburadaBlockedError extends Error {
  constructor(operation: string, reason: string) {
    super(
      `Hepsiburada.${operation}() is not implemented: ${reason} ` +
        '(docs/api-references.md §2.4/§2.6 carry the verified schema; §2.9 lists what is still open).',
    );
    this.name = 'HepsiburadaBlockedError';
  }
}

/** §2.3 — the documented listing-upload batch limit. Applied to price uploads too. */
const PRICE_UPLOAD_BATCH_SIZE = 4000;
/** §2.4 — `limit` is a required query parameter; this is the page size we ask for. */
const LISTING_PAGE_SIZE = 500;
/**
 * §2.3 publishes no per-minute rate for the listing endpoints — only the commission service's
 * ~240 requests/minute/merchant. Rather than leave the listing buckets unbounded, all three are
 * held at that same documented figure: it is the one merchant-scoped number the vendor states,
 * and being slower than necessary costs nothing while a 429 costs a repricing cycle.
 */
const CONSERVATIVE_REQUESTS_PER_MINUTE = 240;
/**
 * How many submitted batches to remember, so `pollSubmission` can name the successes
 * Hepsiburada does not enumerate (see `mapPriceUploadResult`). Bounded so a long-running worker
 * cannot grow this without limit; the oldest entry is dropped, and a terminal poll removes its
 * own entry immediately.
 */
const SUBMITTED_BATCH_MEMO_LIMIT = 256;

function buildRateLimiter(): RateLimiter {
  const perMinute = (requestsPerMinute: number) => ({
    capacity: requestsPerMinute,
    refillPerMs: requestsPerMinute / 60_000,
  });
  return new RateLimiter({
    listingRead: perMinute(CONSERVATIVE_REQUESTS_PER_MINUTE),
    priceWrite: perMinute(CONSERVATIVE_REQUESTS_PER_MINUTE),
    uploadStatus: perMinute(CONSERVATIVE_REQUESTS_PER_MINUTE),
  });
}

export class HepsiburadaAdapter implements IMarketplaceAdapter {
  readonly code: MarketplaceCode = 'hepsiburada';

  readonly capabilities: MarketplaceCapabilities = {
    // api-references §2.3: ≤ 4,000 listings per upload request.
    maxBatchSize: PRICE_UPLOAD_BATCH_SIZE,
    // §2.5 — the `/buybox-orders/…` endpoint is confirmed to exist and takes up to 10 SKUs, but
    // its 200 response is declared with no schema, so how many competitor prices it actually
    // returns is still unknown. Stays 0: a capability is a promise to the engine, and this one
    // cannot be kept until a real response is recorded.
    competitorPriceDepth: 0,
    exposesCompetitorIdentity: false,
    exposesCompetitorStock: false,
    // The listing schema carries `pricings[].finalPrice` — the price after discounts and
    // campaigns — which the adapter maps to `customerPrice`.
    exposesCampaignPrice: true,
    supportsConfirmation: true, // the price-upload status endpoint (§2.6)
    // §2.3 — the one hard, verified number: 10x the merchant's listing count, per day.
    dailyUpdateAllowance: (listingCount: number) => 10 * listingCount,
  };

  private readonly listingBaseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly rateLimiter = buildRateLimiter();
  private readonly merchantId: string;
  /** The same id every listing path is keyed on, and the one the public listings API returns. */
  readonly merchantRef: string;
  private readonly authHeader: string;
  private readonly userAgent: string;
  private readonly onCorrelation?: (correlation: HepsiburadaCorrelation) => void;
  private readonly nowMs: () => number;
  /** uploadId → the marketplace listing ids submitted, in order. See `pollSubmission`. */
  private readonly submittedBatches = new Map<string, readonly string[]>();

  constructor(config: HepsiburadaAdapterConfig) {
    const hosts = HEPSIBURADA_HOSTS[config.environment ?? 'production'];
    this.listingBaseUrl = config.listingBaseUrl ?? hosts.listing;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
    this.merchantId = config.credentials.merchantId;
    this.merchantRef = config.credentials.merchantId;
    this.authHeader = `Basic ${Buffer.from(`${config.credentials.username}:${config.credentials.password}`).toString('base64')}`;
    this.userAgent = config.credentials.userAgent;
    this.onCorrelation = config.onCorrelation;
    this.nowMs = config.nowMs ?? (() => Date.now());
  }

  private async waitForBucket(bucket: string): Promise<void> {
    for (;;) {
      const result = this.rateLimiter.tryAcquire(bucket, Date.now());
      if (result.allowed) return;
      await realSleep(result.retryAfterMs);
    }
  }

  /**
   * §2.2 — Basic auth plus the mandatory `User-Agent`. `Accept: application/json` is not
   * optional politeness: every listing response is also offered as `application/xml` and the
   * guide is explicit that the content type is negotiated.
   */
  private async request<T>(
    bucket: string,
    path: string,
    init: RequestInit = {},
    operation = path,
  ): Promise<T> {
    await this.waitForBucket(bucket);
    const response = await this.fetchFn(`${this.listingBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader,
        'User-Agent': this.userAgent,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    // §2.6: on a malformed request no upload id comes back, and `x-correlation-id` is the only
    // handle a merchant support ticket can use — for 7 days. Reported on success and failure
    // alike, because a submission that "succeeded" and did nothing is the case that needs it.
    const correlationId = response.headers.get('x-correlation-id');
    this.onCorrelation?.({ operation, correlationId, httpStatus: response.status });
    if (!response.ok) {
      throw new HepsiburadaApiError(
        `Hepsiburada API ${response.status} on ${path}`,
        response.status,
        correlationId,
      );
    }
    return (await response.json()) as T;
  }

  async testConnection(creds: Credentials): Promise<ConnectionTestResult> {
    try {
      const merchantId = creds.merchantId ?? this.merchantId;
      const response = await this.request<HepsiburadaListingsResponse>(
        'listingRead',
        `/listings/merchantid/${merchantId}?offset=0&limit=1`,
        {},
        'testConnection',
      );
      return {
        ok: true,
        detail: `Connected as merchant ${merchantId} (${response.totalCount ?? 0} listings)`,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * §2.4 — `GET /listings/merchantid/{merchantId}`. `offset` and `limit` are both **required**;
   * there is no cursor and no `hasNext` flag, so paging is driven by `totalCount`.
   *
   * `cursor`, when given, is the offset to resume from — the port's opaque cursor, which for
   * this marketplace is just a number in string form.
   */
  async *fetchListings(cursor?: string): AsyncIterable<ListingSnapshot> {
    let offset = cursor === undefined ? 0 : Number.parseInt(cursor, 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    for (;;) {
      const observedAtMs = this.nowMs();
      const response = await this.request<HepsiburadaListingsResponse>(
        'listingRead',
        `/listings/merchantid/${this.merchantId}?offset=${offset}&limit=${LISTING_PAGE_SIZE}`,
        {},
        'fetchListings',
      );
      const listings = response.listings ?? [];
      for (const listing of listings) {
        yield mapListingToSnapshot(listing, observedAtMs);
      }
      // An empty page always ends the walk, whatever totalCount claims — trusting the count
      // alone would loop forever if it were ever stale or wrong.
      if (listings.length === 0) return;
      offset += listings.length;
      if (
        response.totalCount !== null &&
        response.totalCount !== undefined &&
        offset >= response.totalCount
      ) {
        return;
      }
    }
  }

  /**
   * Still blocked — and this is the *only* operation that is (§2.5). `GET
   * /buybox-orders/merchantid/{merchantId}?skuList=…` exists under exactly that name and takes
   * ≤10 salable SKUs, but the OpenAPI declares its 200 response as bare `Success` with no
   * schema. The guide names five fields in prose (`SKU`, `Rank`, `Price`, `DispatchTime`,
   * `MerchantRating`) without their casing, nesting or JSON types.
   *
   * Writing a normaliser against a prose table is exactly what CLAUDE.md's "never infer an
   * endpoint's shape" forbids, and this one feeds the **control path** — a misread rank or a
   * misread price changes a real price. Capture one SIT response as a fixture first.
   */
  async fetchBuyboxObservations(_listingIds: readonly string[]): Promise<BuyboxObservation[]> {
    throw new HepsiburadaBlockedError(
      'fetchBuyboxObservations',
      'api-references §2.5 — the endpoint is confirmed but its 200 response is declared with no schema; record a SIT fixture first',
    );
  }

  /**
   * §2.6 — `POST /listings/merchantid/{merchantId}/price-uploads` with a **bare JSON array**
   * (not an envelope) of `{ hepsiburadaSku, price }`, returning `{ id }` and nothing else.
   *
   * There is no per-item acknowledgement at submission time, which is precisely why no audit
   * record may be written here (CLAUDE.md: "write a price-change audit record only after the
   * marketplace confirms the submission"). Confirmation is `pollSubmission`.
   */
  async submitPriceChanges(batch: readonly PriceChange[]): Promise<SubmissionHandle> {
    if (batch.length > PRICE_UPLOAD_BATCH_SIZE) {
      throw new RangeError(
        `Hepsiburada: batch of ${batch.length} exceeds the ${PRICE_UPLOAD_BATCH_SIZE}-item limit (api-references §2.3)`,
      );
    }
    const withListPrice = batch.find((change) => change.newListPrice !== undefined);
    if (withListPrice) {
      // Refused rather than dropped. `price-uploads` carries no list price, and the endpoint
      // that does — `inventory-uploads` — would re-send the entire listing configuration
      // (§2.6). Silently discarding it would report a submission that did less than it claimed.
      throw new RangeError(
        `Hepsiburada: listing ${withListPrice.marketplaceListingId} requests a list price, which price-uploads cannot carry (api-references §2.6)`,
      );
    }

    const items = batch.map((change) => ({
      hepsiburadaSku: change.marketplaceListingId,
      // Lira on the wire, as a JSON double; our money is bigint kuruş everywhere else. This is
      // the boundary, and the only place the conversion happens.
      price: Number(change.newPrice.toKurus()) / 100,
    }));
    const response = await this.request<{ id?: string | null }>(
      'priceWrite',
      `/listings/merchantid/${this.merchantId}/price-uploads`,
      { method: 'POST', body: JSON.stringify(items) },
      'submitPriceChanges',
    );
    if (!response.id) {
      throw new HepsiburadaApiError(
        'Hepsiburada accepted the price upload but returned no id; check x-correlation-id (api-references §2.6)',
        200,
      );
    }

    this.rememberBatch(
      response.id,
      batch.map((change) => change.marketplaceListingId),
    );
    return { batchId: response.id, submittedAt: new Date() };
  }

  private rememberBatch(uploadId: string, listingIds: readonly string[]): void {
    if (this.submittedBatches.size >= SUBMITTED_BATCH_MEMO_LIMIT) {
      const oldest = this.submittedBatches.keys().next();
      if (!oldest.done) this.submittedBatches.delete(oldest.value);
    }
    this.submittedBatches.set(uploadId, listingIds);
  }

  /**
   * §2.6 — `GET /listings/merchantid/{merchantId}/price-uploads/id/{id}`.
   *
   * Two traps, both handled in `mapPriceUploadResult`: an unrecognised `status` is *pending*,
   * never success; and a non-empty `priceValidations[]` is a **failure** even when `status` is
   * `"Done"`, because the SKU has been locked off sale.
   *
   * Hepsiburada enumerates only failures, so the successes are named from the batch this
   * adapter remembered at submission time. If that memo is gone — a process restart between
   * submitting and confirming — only the failures are reported and the rest stay unconfirmed
   * until the job layer's confirmation window elapses. Safe in the right direction: a price we
   * cannot prove was applied is never recorded as applied.
   */
  async pollSubmission(handle: SubmissionHandle): Promise<SubmissionResult> {
    const response = await this.request<HepsiburadaPriceUploadResult>(
      'uploadStatus',
      `/listings/merchantid/${this.merchantId}/price-uploads/id/${handle.batchId}`,
      {},
      'pollSubmission',
    );
    const result = mapPriceUploadResult(response, this.submittedBatches.get(handle.batchId));
    if (result.status === 'completed') this.submittedBatches.delete(handle.batchId);
    return result;
  }
}
