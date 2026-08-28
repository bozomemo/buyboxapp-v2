/**
 * Reads one merchant's business identity out of a **merchant-scoped** Trendyol product page
 * (guide §29, api-references §1.6, doc 06 §12.4 Faz 7).
 *
 * The neutral page's normaliser lives next door in `public-page/normalize.ts` and deliberately
 * does *not* read these fields: a test there asserts `taxNumber`, `officialName` and
 * `registeredEmailAddress` never reach the offer schema, because collecting a firm's contact
 * details as a side effect of every price scrape is exactly what guide §29 warns against. This
 * module exists so that resolving them stays a separate, deliberate, one-at-a-time act.
 *
 * ## What this module refuses to look at
 *
 * `merchantListing.winnerVariant` is read for a **barcode and a stock count**, never for
 * winner-ness, and `otherMerchants` is not read at all. On a page requested with
 * `?merchantId=X` the ordering is not the buybox: the requested merchant comes back as winner
 * on every row regardless of the real rank (measured 2026-08-17). There is no rank field in
 * `SellerIdentity` to put it in even if someone wanted to, which is doc 12 Faz 7's definition
 * of done expressed as a type rather than as a convention.
 *
 * Language-independent by construction, as everywhere in this package (guide §26): ids and
 * structured string fields only, never a Turkish label, never a CSS class, never `price.text`.
 */
import type {
  SellerIdentity,
  SellerIdentityDiagnostics,
  SellerListingFact,
} from '../../ports/seller-identity-source.js';

/** Bumped whenever the extraction rules change, so a stored identity stays attributable. */
export const TRENDYOL_IDENTITY_PARSER_VERSION = '1.0.0';

export class TrendyolIdentitySchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrendyolIdentitySchemaError';
  }
}

/**
 * Raised when the page came back describing a different merchant than the one requested.
 *
 * Separate from a schema error because it is not a parsing problem — the payload is perfectly
 * well formed, it is simply about somebody else. Attributing that firm's tax number to the
 * seller we asked about would put one company's identity on another company's record, in a
 * report an operator may act on legally.
 */
export class TrendyolIdentityMismatchError extends Error {
  constructor(
    readonly requestedRef: string,
    readonly returnedRef: string | null,
  ) {
    super(
      `Trendyol returned merchant ${returnedRef ?? '(none)'} for a page requested as merchant ${requestedRef}`,
    );
    this.name = 'TrendyolIdentityMismatchError';
  }
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * The same reduction `public-page/normalize.ts` applies (guide §17): an entry the page marks
 * unsellable is zero, otherwise the stated quantity, otherwise unknown. Never a guessed number,
 * and `0` never stands in for "the payload did not say".
 */
function readOfferedStock(variant: Json): number | null {
  if (variant.sellable === false || variant.inStock === false) return 0;
  return asFiniteNumber(variant.quantity);
}

function readListingFact(variant: Json): SellerListingFact {
  return {
    listingRef: asNonEmptyString(variant.listingId),
    itemRef: asNonEmptyString(variant.itemNumber),
    barcode: asNonEmptyString(variant.barcode),
    offeredStock: readOfferedStock(variant),
  };
}

/**
 * The identity fields read from `merchantListing.merchant`, in the guide §29 vocabulary.
 *
 * Listed once, here, so `identityFieldsFound` counts exactly the fields the mapper reads — a
 * diagnostic that drifts from what is actually mapped is worse than none, since it would keep
 * reporting a healthy number after Trendyol dropped a field.
 */
const IDENTITY_FIELDS = [
  'officialName',
  'taxNumber',
  'taxOffice',
  'registeredEmailAddress',
  'address',
  'cityName',
  'countryName',
] as const;

export interface TrendyolSellerIdentity {
  /** Everything but `marketplaceCode`, which the source stamps on. */
  readonly identity: Omit<SellerIdentity, 'marketplaceCode'>;
  readonly diagnostics: SellerIdentityDiagnostics;
}

/**
 * @param state the decoded `__envoy__SHARED_PROPS` object.
 * @param requestedSellerRef the merchant id the page was requested as.
 *
 * @throws {TrendyolIdentitySchemaError} when the payload carries no merchant object at all, or
 * when `merchantListing` arrives as an array (guide §32) — the same refusal-to-guess the offer
 * normaliser makes.
 * @throws {TrendyolIdentityMismatchError} when the merchant returned is not the one requested.
 */
export function normalizeTrendyolSellerIdentity(
  state: unknown,
  requestedSellerRef: string,
): TrendyolSellerIdentity {
  const root = asObject(state);
  const product = asObject(root?.product);
  const merchantListingRaw = product?.merchantListing;

  if (Array.isArray(merchantListingRaw)) {
    throw new TrendyolIdentitySchemaError(
      'product.merchantListing is an array — schema mismatch against guide §4/§32; refusing to guess',
    );
  }

  const merchantListing = asObject(merchantListingRaw);
  const merchant = asObject(merchantListing?.merchant);
  if (!merchant) {
    throw new TrendyolIdentitySchemaError(
      'product.merchantListing.merchant is absent — no merchant identity on this page',
    );
  }

  const returnedRef = asNonEmptyString(merchant.id);
  if (returnedRef !== requestedSellerRef) {
    throw new TrendyolIdentityMismatchError(requestedSellerRef, returnedRef);
  }

  // The winner variant is this merchant's own listing on a merchant-scoped page — read for what
  // it *is* (a barcode, a stock count), never for the position it claims. Extra variants of the
  // same merchant are appended so a multi-variant listing does not silently lose its barcodes.
  const listings: SellerListingFact[] = [];
  const winnerVariant = asObject(merchantListing?.winnerVariant);
  if (winnerVariant) listings.push(readListingFact(winnerVariant));
  for (const raw of asArray(merchantListing?.variants)) {
    const variant = asObject(raw);
    if (!variant) continue;
    const fact = readListingFact(variant);
    // `merchantListing.variants` repeats the winner as a bare `{ itemNumber }` stub on the
    // observed sample; a stub carrying nothing this port stores is noise, not a second listing.
    if (fact.listingRef === null && fact.barcode === null && fact.offeredStock === null) continue;
    listings.push(fact);
  }

  const identity: Omit<SellerIdentity, 'marketplaceCode'> = {
    sellerRef: requestedSellerRef,
    sellerName: asNonEmptyString(merchant.name),
    officialName: asNonEmptyString(merchant.officialName),
    taxNumber: asNonEmptyString(merchant.taxNumber),
    taxOffice: asNonEmptyString(merchant.taxOffice),
    registeredEmailAddress: asNonEmptyString(merchant.registeredEmailAddress),
    address: asNonEmptyString(merchant.address),
    cityName: asNonEmptyString(merchant.cityName),
    countryName: asNonEmptyString(merchant.countryName),
    listings,
  };

  return {
    identity,
    diagnostics: {
      parserVersion: TRENDYOL_IDENTITY_PARSER_VERSION,
      stateFound: root !== null,
      merchantFound: true,
      identityMatched: true,
      identityFieldsFound: IDENTITY_FIELDS.filter((field) => asNonEmptyString(merchant[field]) !== null)
        .length,
      listingCount: listings.length,
    },
  };
}
