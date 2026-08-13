/**
 * Hepsiburada marketplace adapter — **intentionally blocked**, not built (doc 12 Phase 4.4:
 * "🔴 items in api-references §2.9 resolved first").
 *
 * docs/api-references.md §2 is only partially verified: the developer portal rejects automated
 * access (HTTP 403), so the request/response schemas for listing information, inventory
 * update, batch status, buybox rank and commission lookup are all marked 🔴 — copied from the
 * legacy app or the product owner's portal notes, not confirmed against the live API.
 *
 * CLAUDE.md's "Rule: marketplace API work" is explicit: never infer an endpoint's shape, and
 * the legacy implementation is not a reference. Writing `fetchListings`/`submitPriceChanges`
 * against those 🔴 schemas would be exactly that inference. Doc 12 4.4's own definition of done
 * requires the §2.9 checklist resolved *first* — this file registers Hepsiburada in the adapter
 * registry (doc 10 §3: "adding a marketplace means adding one directory and one registry row")
 * without pretending any of the data operations work.
 *
 * What's implemented from here, because doc api-references §2 marks it ✅:
 *   - the per-domain hosts (§2.1) and Basic-auth + User-Agent requirement (§2.2)
 *   - the rate limits and the 10x-daily-allowance capability (§2.3)
 *
 * Everything else throws `HepsiburadaBlockedError` naming the exact §2.9 checklist item that
 * blocks it. Do not implement past this point without the portal confirmations.
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

export class HepsiburadaBlockedError extends Error {
  constructor(operation: string, checklistItem: string) {
    super(
      `Hepsiburada.${operation}() is blocked: "${checklistItem}" is unresolved ` +
        '(docs/api-references.md §2.9). Confirm against the live developer portal before implementing.',
    );
    this.name = 'HepsiburadaBlockedError';
  }
}

export const HEPSIBURADA_HOSTS = {
  production: {
    listing: 'https://listing-external.hepsiburada.com',
    orders: 'https://oms-external.hepsiburada.com',
    catalogue: 'https://mpop.hepsiburada.com',
  },
  sit: {
    listing: 'https://listing-external-sit.hepsiburada.com',
    orders: 'https://oms-external-sit.hepsiburada.com',
    catalogue: 'https://mpop-sit.hepsiburada.com',
  },
} as const;

export class HepsiburadaAdapter implements IMarketplaceAdapter {
  readonly code: MarketplaceCode = 'hepsiburada';

  readonly capabilities: MarketplaceCapabilities = {
    // api-references §2.3: ≤ 4,000 listings per inventory update request.
    maxBatchSize: 4000,
    // §2.5 🔴 — legacy endpoint returned rank/price/dispatchTime for up to 10 competitors, but
    // whether the endpoint still exists under that name/shape is unconfirmed. Not assumed.
    competitorPriceDepth: 0,
    exposesCompetitorIdentity: false,
    exposesCompetitorStock: false,
    exposesCampaignPrice: false,
    supportsConfirmation: true, // the poll-for-status flow itself is ✅ (§2.6), even if the schema is 🔴
    // §2.3 — the one hard, verified number: 10x the merchant's listing count, per day.
    dailyUpdateAllowance: (listingCount: number) => 10 * listingCount,
  };

  async testConnection(_creds: Credentials): Promise<ConnectionTestResult> {
    return {
      ok: false,
      error:
        'Hepsiburada adapter is not implemented: authentication username / service-key ownership ' +
        'model is unconfirmed (api-references §2.9).',
    };
  }

  /**
   * When §2.9 is resolved and this is implemented, each snapshot must carry
   * `productPage: { url, contentId }` where `contentId` is the **product SKU** (`BS1372`) —
   * that is the only key the public listings endpoint accepts (api-references §2.11), and
   * `public-listings/source.ts` deliberately refuses to derive one from a page URL. Without it
   * the competitor source is registered but can never be given anything to fetch.
   */
  // eslint-disable-next-line require-yield -- intentionally throws before yielding; see class doc
  async *fetchListings(): AsyncIterable<ListingSnapshot> {
    throw new HepsiburadaBlockedError('fetchListings', 'Listing Information — full response JSON schema');
  }

  async fetchBuyboxObservations(_listingIds: readonly string[]): Promise<BuyboxObservation[]> {
    throw new HepsiburadaBlockedError(
      'fetchBuyboxObservations',
      'Buybox Sırasını Getirme — endpoint, limits, response schema',
    );
  }

  async submitPriceChanges(_batch: readonly PriceChange[]): Promise<SubmissionHandle> {
    throw new HepsiburadaBlockedError(
      'submitPriceChanges',
      'Inventory/price update — exact request schema (JSON or XML?)',
    );
  }

  async pollSubmission(_handle: SubmissionHandle): Promise<SubmissionResult> {
    throw new HepsiburadaBlockedError(
      'pollSubmission',
      'Inventory upload status — canonical enum values / Batch item-level failure schema',
    );
  }
}
