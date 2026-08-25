/**
 * The marketplace port (docs/10-target-architecture.md §3, docs/03-repricing-engines.md §9).
 *
 * `core` reads `MarketplaceCapabilities`, never the marketplace code itself, to decide which
 * triggers and guards apply. Adding a marketplace means adding one directory here and one
 * registry row — nothing in `core` changes.
 *
 * Hard rule (doc 10 §3): no marketplace sentinel (`"< ? >"`, `-1`, `"Error"`, `"No Seller"`) and
 * no formatted composite string may ever escape an adapter. Missing data is `null` or a typed
 * error, never a magic value.
 */
import type { Money } from '@buybox/shared';
import type { MarketplaceCode } from '@buybox/core';
import type { ProductPageRef } from './competitor-source.js';

/** Opaque credential bag. Each adapter validates the shape it needs with its own Zod schema. */
export type Credentials = Readonly<Record<string, string>>;

export type ConnectionTestResult =
  { readonly ok: true; readonly detail: string } | { readonly ok: false; readonly error: string };

/**
 * doc 03 §9 — capabilities the engine reads instead of branching on marketplace identity.
 * Where a capability is absent, the corresponding trigger or guard is skipped, not faked.
 */
export interface MarketplaceCapabilities {
  readonly maxBatchSize: number;
  /** Trendyol: 3 (buybox/2nd/3rd). Hepsiburada: to be confirmed — see api-references §2.9. */
  readonly competitorPriceDepth: number;
  /** Trendyol: false (official API is anonymous). Hepsiburada: likely true. */
  readonly exposesCompetitorIdentity: boolean;
  /** Trendyol: only via the reporting scrape (§1.6), never the control path. */
  readonly exposesCompetitorStock: boolean;
  readonly exposesCampaignPrice: boolean;
  readonly supportsConfirmation: boolean;
  readonly dailyUpdateAllowance: (listingCount: number) => number;
}

/** A single marketplace listing as returned by the marketplace's own identifiers/fields. */
export interface ListingSnapshot {
  readonly marketplaceListingId: string; // Trendyol: barcode. Hepsiburada: hepsiburadaSku.
  readonly sellerStockCode: string;
  /**
   * `null` where the marketplace's listing service does not carry one. Hepsiburada's
   * `Listing` schema has no name field at all (api-references §2.4) — the name is catalogue
   * data, on a different service. Not faked: the persistence layer decides what to display.
   */
  readonly productName: string | null;
  readonly price: Money;
  readonly listPrice: Money | null;
  /** Final checkout price after campaigns/coupons, when the marketplace exposes it. */
  readonly customerPrice: Money | null;
  readonly offeredStock: number;
  /** Commission percent, ex-VAT, as required by doc 02's cost model. `null` if unavailable. */
  readonly commissionRate: number | null;
  readonly vatRate: number | null;
  readonly dispatchTime: number | null;
  readonly isSalable: boolean;
  readonly isLocked: boolean;
  readonly isSuspended: boolean;
  readonly isArchived: boolean;
  readonly isBlacklisted: boolean;
  readonly lockReasons: readonly string[];
  readonly deactivationReasons: readonly string[];
  /**
   * Optional because only some marketplaces expose them. Absent means "this marketplace does
   * not report it", never "false" — a consumer must not read absence as a negative.
   *
   * `isFrozen` / `freezeReasons`: Hepsiburada's own off-sale state, distinct from `isLocked`
   * (api-references §2.4). A frozen listing rejects updates with `ListingFrozen` (§2.6).
   */
  readonly isFrozen?: boolean;
  readonly freezeReasons?: readonly string[];
  /**
   * Per-listing marketplace kill switches (Hepsiburada, api-references §2.4). Submitting
   * against one is rejected *and* consumes the daily update allowance (§2.3), so the decision
   * engine must treat them as a hard constraint alongside our own floor and the operator's
   * `allowIncrease` / `allowDecrease`. Distinct from those: these are the marketplace's.
   */
  readonly priceIncreaseDisabled?: boolean;
  readonly priceDecreaseDisabled?: boolean;
  /**
   * How to reach this listing's **public** product page, for the reporting scrape
   * (`ICompetitorSource`, api-references §1.6). Optional and nullable: a marketplace that
   * exposes no such reference simply cannot be scraped, which is a reporting gap and never
   * an error. Nothing on the control path reads it.
   */
  readonly productPage?: ProductPageRef | null;
  /**
   * The marketplace's own brand/category identity for this product (doc 06 §12.1). Optional:
   * present on Trendyol's product filter (api-references §1.4 — `brand{id,name}`,
   * `category{id,name}`, already part of the response `fetchListings` consumes, no extra
   * call); absent on Hepsiburada, whose Listing service carries neither (api-references §2.4).
   * `null` and "absent" both mean "unknown" here — there is no scenario where a product
   * legitimately has no brand, so nothing reads absence as a negative the way `isFrozen` does.
   */
  readonly brand?: { readonly ref: string; readonly name: string } | null;
  readonly category?: { readonly ref: string; readonly name: string } | null;
}

/** The control-path buybox read (doc 10 §5.1) — never the reporting scrape. */
export interface BuyboxObservation {
  readonly marketplaceListingId: string;
  readonly rank: number | null; // 1 = we hold the buybox; null = unknown, never -1
  readonly buyboxPrice: Money | null;
  readonly secondPrice: Money | null;
  readonly thirdPrice: Money | null;
  readonly hasMultipleSeller: boolean;
  readonly observedAt: Date;
}

/** Optional richer competitor data (doc 10 §3: `fetchCompetitorDetail?`). Never on the control path. */
export interface CompetitorSnapshot {
  readonly marketplaceListingId: string;
  readonly rank: number;
  readonly sellerId: string | null;
  readonly sellerName: string | null;
  readonly sellerRating: number | null;
  readonly price: Money;
  readonly dispatchTime: number | null;
  readonly offeredStock: number | null;
  readonly observedAt: Date;
}

export interface PriceChange {
  readonly marketplaceListingId: string;
  readonly newPrice: Money;
  readonly newListPrice?: Money;
}

export interface SubmissionHandle {
  readonly batchId: string;
  readonly submittedAt: Date;
}

export interface SubmissionItemResult {
  readonly marketplaceListingId: string;
  readonly status: 'success' | 'failed';
  /** Raw marketplace failure code/message, retained for diagnosis — never reformatted or hidden. */
  readonly failureReason: string | null;
  /**
   * Set when the marketplace rejected the price by **locking the listing** rather than merely
   * refusing it (Hepsiburada `MinLock` / `MaxLock`, api-references §2.6). The listing is off
   * sale until a human unlocks it, and `minPrice`/`maxPrice` are the band the marketplace will
   * accept — to be intersected with our own floor on the next decision, never resubmitted as-is.
   */
  readonly lock?: {
    readonly type: string;
    readonly minPrice: Money | null;
    readonly maxPrice: Money | null;
    readonly categoryName: string | null;
  } | null;
}

export type SubmissionResult =
  | { readonly status: 'pending' }
  | { readonly status: 'completed'; readonly items: readonly SubmissionItemResult[] };

export interface DateRange {
  readonly fromMs: number;
  readonly toMs: number;
}

/** MAY-ADD-LATER (doc 12 Phase 9) — reserved so the port shape doesn't need to change later. */
export interface OrderSnapshot {
  readonly marketplaceOrderId: string;
  readonly observedAt: Date;
}

export interface IMarketplaceAdapter {
  readonly code: MarketplaceCode;
  readonly capabilities: MarketplaceCapabilities;
  /**
   * **Our own** seller id at this marketplace, as the marketplace itself publishes it in offer
   * lists — Trendyol's `sellerId`/`merchantId`, Hepsiburada's `merchantId`.
   *
   * It comes from the credentials the adapter authenticates with, so it is a fact about this
   * installation rather than a setting anyone has to keep in step. That matters because it is
   * the *only* thing that distinguishes our own offer from a competitor's: the repricer's
   * own-offer filter (doc 03 §6.5), the exclusion of our store from competitor reports and the
   * alert engine's refusal to fire on us all key on it, and every one of them fails **silently**
   * when it is wrong — nothing errors, we simply become our own biggest rival.
   *
   * Never a store name. Names are not identity (scraping guide §8), and ours can be renamed in
   * the seller panel without anything here noticing.
   */
  readonly merchantRef: string;

  testConnection(creds: Credentials): Promise<ConnectionTestResult>;

  fetchListings(cursor?: string): AsyncIterable<ListingSnapshot>;
  fetchBuyboxObservations(listingIds: readonly string[]): Promise<BuyboxObservation[]>;
  fetchCompetitorDetail?(listingIds: readonly string[]): Promise<CompetitorSnapshot[]>;

  submitPriceChanges(batch: readonly PriceChange[]): Promise<SubmissionHandle>;
  pollSubmission(handle: SubmissionHandle): Promise<SubmissionResult>;

  fetchOrders?(window: DateRange, cursor?: string): AsyncIterable<OrderSnapshot>;
}
