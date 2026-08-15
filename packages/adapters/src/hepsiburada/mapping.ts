/**
 * Maps raw Hepsiburada listing-service JSON onto the port's shapes. This is the one place
 * Hepsiburada's field names may appear — everything past this module speaks the port's
 * vocabulary only (doc 10 §3).
 *
 * Every type below is transcribed from the vendor's OpenAPI document
 * (`docs/vendor/hepsiburada-listing-openapi-v1.json`, verified 2026-08-14), summarised in
 * docs/api-references.md §2.4 and §2.6. `Listing` is declared `additionalProperties: false`,
 * so the property list here is complete by construction: a field that is not below does not
 * exist on the response, and must not be invented.
 */
import { Money } from '@buybox/shared';
import type { ListingSnapshot, SubmissionItemResult, SubmissionResult } from '../ports/marketplace.js';

/** Raised when a listing cannot be identified. Never swallowed: an unidentifiable listing
 *  cannot be repriced, and guessing an id would submit a price against the wrong SKU. */
export class HepsiburadaMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HepsiburadaMappingError';
  }
}

/** `ListingPricingRepresentation`. The guide: "İndirim ve kampanyalardan sonra satış fiyatıdır"
 *  — the sale price after discounts and campaigns, i.e. the port's `customerPrice`. */
export interface HepsiburadaListingPricing {
  readonly finalPrice: number;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
}

/** `Listing` — the complete declared property set (api-references §2.4). */
export interface HepsiburadaListing {
  readonly listingId?: string | null;
  readonly uniqueIdentifier?: string | null;
  readonly hepsiburadaSku?: string | null;
  readonly merchantSku?: string | null;
  /** **Lira**, as a JSON double. Converted to exact kuruş here and nowhere else. */
  readonly price?: number | null;
  readonly availableStock?: number | null;
  readonly dispatchTime?: number | null;
  readonly pricings?: readonly HepsiburadaListingPricing[] | null;
  readonly isSalable?: boolean | null;
  readonly deactivationReasons?: readonly string[] | null;
  readonly isSuspended?: boolean | null;
  readonly isLocked?: boolean | null;
  readonly lockReasons?: readonly string[] | null;
  readonly isFrozen?: boolean | null;
  readonly freezeReasons?: readonly string[] | null;
  readonly priceIncreaseDisabled?: boolean | null;
  readonly priceDecreaseDisabled?: boolean | null;
  readonly stockDecreaseDisabled?: boolean | null;
  readonly productId?: string | null;
  readonly hasVariant?: boolean | null;
}

/** `ExternalListingsRepresentation`. */
export interface HepsiburadaListingsResponse {
  readonly listings?: readonly HepsiburadaListing[] | null;
  readonly totalCount?: number | null;
  readonly limit?: number | null;
  readonly offset?: number | null;
}

/** Hepsiburada prices are decimal lira on the wire; converted to exact kuruş here, once. */
function moneyFromLira(value: number | null | undefined): Money | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  // toFixed(2) avoids float noise (e.g. 118.97000000000001) before parsing to an exact decimal.
  return Money.fromMajorUnitsString(value.toFixed(2));
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * A listing may carry several campaign windows. Only the one covering `atMs` describes what a
 * customer pays now; a window that has not opened or has already closed is not the current
 * price and must not be reported as one. An entry with no dates is treated as open-ended,
 * which is what an unbounded campaign looks like.
 */
export function selectActivePricing(
  pricings: readonly HepsiburadaListingPricing[] | null | undefined,
  atMs: number,
): HepsiburadaListingPricing | null {
  if (!pricings) return null;
  for (const pricing of pricings) {
    const from = parseTime(pricing.startDate);
    const to = parseTime(pricing.endDate);
    if (from !== null && atMs < from) continue;
    if (to !== null && atMs > to) continue;
    return pricing;
  }
  return null;
}

export function mapListingToSnapshot(listing: HepsiburadaListing, atMs: number): ListingSnapshot {
  const marketplaceListingId = listing.hepsiburadaSku;
  if (!marketplaceListingId) {
    throw new HepsiburadaMappingError(
      `Hepsiburada listing ${listing.listingId ?? '(no listingId)'}: hepsiburadaSku is missing — the listing cannot be identified`,
    );
  }
  const sellerStockCode = listing.merchantSku;
  if (!sellerStockCode) {
    throw new HepsiburadaMappingError(
      `Hepsiburada listing ${marketplaceListingId}: merchantSku is missing — no seller stock code to match against`,
    );
  }
  const price = moneyFromLira(listing.price);
  if (price === null) {
    throw new HepsiburadaMappingError(`Hepsiburada listing ${marketplaceListingId}: missing price`);
  }

  return {
    marketplaceListingId,
    sellerStockCode,
    // §2.4: the Listing schema carries no product name — that is catalogue (mpop) data, still
    // 🔴. Left null rather than filled with the SKU, which would look like a name and is not.
    productName: null,
    price,
    // Hepsiburada's listing service exposes no list/strike-through price at all.
    listPrice: null,
    customerPrice: moneyFromLira(selectActivePricing(listing.pricings, atMs)?.finalPrice),
    offeredStock: listing.availableStock ?? 0,
    // §2.4 ⚠️ — `commissionRate` is *not* on this schema (the legacy field list was wrong); it
    // comes from the dedicated service in §2.7. VAT is absent from the listing schema too, and
    // §2.9 records it as the most important open item, because a wrong VAT rate produces a
    // wrong floor price. Neither is guessed here.
    commissionRate: null,
    vatRate: null,
    dispatchTime: listing.dispatchTime ?? null,
    isSalable: listing.isSalable ?? false,
    isLocked: listing.isLocked ?? false,
    isSuspended: listing.isSuspended ?? false,
    // Hepsiburada has no archive or blacklist concept on this schema. Not faked as a state we
    // observed — false is the port's "not archived", and nothing here can ever set it true.
    isArchived: false,
    isBlacklisted: false,
    lockReasons: listing.lockReasons ?? [],
    deactivationReasons: listing.deactivationReasons ?? [],
    isFrozen: listing.isFrozen ?? false,
    freezeReasons: listing.freezeReasons ?? [],
    priceIncreaseDisabled: listing.priceIncreaseDisabled ?? false,
    priceDecreaseDisabled: listing.priceDecreaseDisabled ?? false,
    // Reporting only (§2.11). The listing schema has no product-page URL, so `url` stays null
    // and the public-listings source uses `contentId` — which is exactly `hepsiburadaSku`, the
    // only key that endpoint accepts.
    productPage: { url: null, contentId: marketplaceListingId },
  };
}

/** `Error` on `PriceUploadResultRepresentation` — a hard rejection of one submitted element. */
export interface HepsiburadaUploadError {
  readonly elementNo?: number | null;
  readonly hepsiburadaSku?: string | null;
  readonly merchantSku?: string | null;
  readonly errors?: readonly string[] | null;
}

/** `PriceValidation` — see the `MinLock` / `MaxLock` flow in api-references §2.6. */
export interface HepsiburadaPriceValidation {
  readonly elementNo?: number | null;
  readonly hepsiburadaSku?: string | null;
  readonly merchantSku?: string | null;
  readonly type?: string | null;
  readonly minPrice?: number | null;
  readonly maxPrice?: number | null;
  readonly regulativePriceDetail?: {
    readonly minAmount?: number | null;
    readonly maxAmount?: number | null;
    readonly categoryName?: string | null;
  } | null;
  readonly description?: string | null;
}

/** `PriceUploadResultRepresentation`. */
export interface HepsiburadaPriceUploadResult {
  readonly id?: string | null;
  /** Guide documents `Done` and `Failed`; the OpenAPI declares a free string with no enum. */
  readonly status?: string | null;
  readonly createdAt?: string | null;
  readonly total?: number | null;
  readonly errors?: readonly HepsiburadaUploadError[] | null;
  readonly priceValidations?: readonly HepsiburadaPriceValidation[] | null;
}

/**
 * §2.6 🟡 — only `Done` and `Failed` are documented, and the schema permits anything. Anything
 * we do not recognise is "not yet confirmed", never success: a batch reported as complete on a
 * guess would write a price-change audit record the marketplace never confirmed, which
 * CLAUDE.md forbids outright.
 */
export function isTerminalUploadStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const normalized = status.trim().toLowerCase();
  return normalized === 'done' || normalized === 'failed';
}

/** `elementNo` is 1-based into the submitted array (§2.6). Returns null when it cannot be used. */
function idAtElement(submittedIds: readonly string[] | undefined, elementNo: number | null | undefined) {
  if (!submittedIds || elementNo === null || elementNo === undefined) return null;
  return submittedIds[elementNo - 1] ?? null;
}

/**
 * Maps a poll response onto `SubmissionResult`.
 *
 * ⚠️ Hepsiburada enumerates only the **failures**. Successes are implied by absence, so they
 * can only be named if the submitted batch is known — `submittedIds`, in submission order.
 * When it is not (the adapter's memo was lost to a process restart between submit and
 * confirm), only the named failures are returned; the rest stay unconfirmed and eventually
 * time out at the job layer. That is the safe direction: a price we cannot prove was applied
 * is never audited as applied.
 */
export function mapPriceUploadResult(
  result: HepsiburadaPriceUploadResult,
  submittedIds?: readonly string[],
): SubmissionResult {
  if (!isTerminalUploadStatus(result.status)) return { status: 'pending' };

  const items: SubmissionItemResult[] = [];
  const failed = new Set<string>();

  // Locks are read first: an element can appear in both lists, and the lock is the more
  // consequential of the two (the listing is off sale, not merely unchanged). One item per
  // listing either way — the job layer acts once per submission row.
  for (const validation of result.priceValidations ?? []) {
    const id = validation.hepsiburadaSku ?? idAtElement(submittedIds, validation.elementNo);
    if (!id || failed.has(id)) continue;
    failed.add(id);
    // §2.6: a non-empty priceValidations[] is a FAILURE regardless of `status` — the SKU has
    // been locked off sale. Reported as failed so no audit record is written, and the band is
    // carried structurally so the next decision can intersect it with our own floor.
    items.push({
      marketplaceListingId: id,
      status: 'failed',
      failureReason: validation.description ?? validation.type ?? null,
      lock: {
        type: validation.type ?? 'PriceLock',
        minPrice: moneyFromLira(validation.minPrice),
        maxPrice: moneyFromLira(validation.maxPrice),
        categoryName: validation.regulativePriceDetail?.categoryName ?? null,
      },
    });
  }

  for (const error of result.errors ?? []) {
    const id = error.hepsiburadaSku ?? idAtElement(submittedIds, error.elementNo);
    if (!id || failed.has(id)) continue; // unattributable, or already reported as locked
    failed.add(id);
    const reasons = error.errors ?? [];
    items.push({
      marketplaceListingId: id,
      status: 'failed',
      // Raw marketplace codes, retained verbatim for diagnosis (doc 10 §3).
      failureReason: reasons.length > 0 ? reasons.join('; ') : null,
    });
  }

  for (const id of submittedIds ?? []) {
    if (failed.has(id)) continue;
    items.push({ marketplaceListingId: id, status: 'success', failureReason: null });
  }

  return { status: 'completed', items };
}
