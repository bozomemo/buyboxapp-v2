/**
 * Normalises Hepsiburada's public product-listings payload into the scraper-owned `offers[]`
 * shape (api-references §2.11).
 *
 * This is the **only** module allowed to know Hepsiburada's public field names. Everything past
 * it speaks `CompetitorOffer` (doc 10 §3).
 *
 * Unlike Trendyol's embedded page state, this is an ordinary JSON endpoint and its shape is far
 * kinder: `data.listings[]` is a real array, and the buybox holder is *in* it, marked by
 * `buyboxOrder`, rather than stored apart. Two rules still carry over unchanged:
 *
 * - parsing is language-independent (ids, enums, booleans, numbers only). `merchantName`,
 *   `merchantCity` and the `tagList` slugs are retained as operator-facing data and are never
 *   read to decide anything;
 * - identity is `merchantId` (a GUID), never the display name.
 */
import { Money } from '@buybox/shared';
import type { CompetitorOffer, ScrapeDiagnostics } from '../../ports/competitor-source.js';

/** Bumped whenever the extraction rules change, so `scrape_runs` rows stay attributable. */
export const HEPSIBURADA_PARSER_VERSION = '1.0.0';

export class HepsiburadaListingsSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HepsiburadaListingsSchemaError';
  }
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;
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
 * Prices arrive as `{ value, currency }`, and — unlike Trendyol — the unit is **not** a
 * judgement call: the sibling `prices[0].formattedPrice` renders `value: 1379` as `"1.379,00"`,
 * which in tr-TR is one thousand three hundred and seventy-nine lira. So `value` is in lira,
 * major units, and becomes exact kuruş here, once, through a decimal string — never through
 * float arithmetic (CLAUDE.md: money is bigint kuruş).
 *
 * `currency` is an enum observed only as `0`. Its mapping is unconfirmed (api-references
 * §2.11), so it is neither trusted nor acted on: a single-currency marketplace makes guessing
 * a second meaning pure speculation, and dropping otherwise-good prices over an unread enum
 * would be worse than ignoring it.
 */
function moneyFromPriceNode(node: unknown): Money | null {
  const object = asObject(node);
  if (!object) return null;
  const value = asFiniteNumber(object.value);
  if (value === null) return null;
  return Money.fromMajorUnitsString(value.toFixed(2));
}

/**
 * `quantity` is the seller's offered stock. Values are frequently exactly `100`, which strongly
 * suggests a display cap rather than the real figure (api-references §2.11 records this as
 * unconfirmed) — so it is stored as reported and never used as a stock signal for anything.
 *
 * An offer the endpoint marks unsellable is zero stock regardless of its quantity, matching how
 * the Trendyol normaliser reduces the same situation.
 */
function readOfferedStock(listing: Json): number | null {
  if (listing.isSalable === false) return 0;
  return asFiniteNumber(listing.quantity);
}

/**
 * `shipmentDay` is a count of `shipmentType` units. `listings.dispatch_time` is **days**
 * (doc 05 §5), so the value is mapped only when the endpoint says the unit is days, and left
 * unknown otherwise. A unit error here is silent and would corrupt the reports permanently —
 * the same reason Trendyol's rush-delivery *hours* are deliberately not mapped.
 */
function readDispatchTime(listing: Json): number | null {
  const unit = asNonEmptyString(listing.shipmentType);
  if (unit !== 'businessDays') return null;
  return asFiniteNumber(listing.shipmentDay);
}

interface PromotionSummary {
  readonly hasPromotion: boolean;
  readonly promotionText: string | null;
}

/**
 * Classification is structural: a campaign is present, or a discount rate is non-zero. The
 * `tagList` / `paymentTag` slugs are marketing labels rather than promotion names — they are
 * not human-readable promotion text and are deliberately not surfaced as one. Hepsiburada
 * exposes no field equivalent to Trendyol's promotion `name`, so `promotionText` stays `null`
 * rather than being synthesised from slugs (api-references §2.11).
 */
function readPromotions(listing: Json): PromotionSummary {
  const campaignIds = Array.isArray(listing.campaignIds) ? listing.campaignIds : [];
  const discountRate = asFiniteNumber(listing.discountRate) ?? 0;
  return { hasPromotion: campaignIds.length > 0 || discountRate > 0, promotionText: null };
}

function buildOffer(listing: Json, rank: number): CompetitorOffer {
  const merchantInfo = asObject(listing.merchantInfo);
  const ratingSummary = asObject(listing.ratingSummary) ?? asObject(merchantInfo?.ratingSummary);
  const { hasPromotion, promotionText } = readPromotions(listing);

  return {
    rank,
    // The GUID is the identity. `merchantName` is display data and is never a key.
    sellerRef: asNonEmptyString(listing.merchantId) ?? asNonEmptyString(merchantInfo?.id),
    sellerName: asNonEmptyString(listing.merchantName) ?? asNonEmptyString(merchantInfo?.name),
    // 0–10, same scale as Trendyol's seller score. Absent is `null`, never `-1` (doc 10 §3).
    sellerRating: asFiniteNumber(ratingSummary?.lifetimeRating),
    // The seller's own offer id, distinct from the merchant id — the two are never interchangeable.
    listingRef: asNonEmptyString(listing.listingId),
    price: moneyFromPriceNode(listing.price),
    // Hepsiburada exposes `minimumPrice` / `minimumPrices` (segment-keyed: "10", "30",
    // "non-segmented-price"). What audience each segment addresses is unconfirmed
    // (api-references §2.11), so none of them is presented as the price a customer pays.
    // Reporting a guessed discounted price would be worse than reporting none.
    finalPrice: null,
    offeredStock: readOfferedStock(listing),
    dispatchTime: readDispatchTime(listing),
    hasPromotion,
    promotionText,
    isWinner: asFiniteNumber(listing.buyboxOrder) === 1,
  };
}

export interface HepsiburadaListingOffers {
  readonly offers: readonly CompetitorOffer[];
  readonly diagnostics: ScrapeDiagnostics;
}

/**
 * @throws {HepsiburadaListingsSchemaError} when `data.listings` is present but is not an array.
 * Processing an unknown shape with these rules would produce plausible-looking wrong data,
 * which is worse than a recorded `parseFailed` (doc 05 §5).
 *
 * A *missing* `listings` is not an error: an unknown or delisted SKU legitimately has no
 * sellers, and that is reported as zero offers with honest diagnostics.
 */
export function normalizeHepsiburadaListings(payload: unknown): HepsiburadaListingOffers {
  const root = asObject(payload);
  const data = asObject(root?.data);
  const listingsRaw = data?.listings;

  if (listingsRaw !== undefined && listingsRaw !== null && !Array.isArray(listingsRaw)) {
    throw new HepsiburadaListingsSchemaError(
      'data.listings is not an array — schema mismatch against api-references §2.11; refusing to guess',
    );
  }

  const listings = Array.isArray(listingsRaw) ? listingsRaw : [];

  // The endpoint returns them in buybox order already, but that is an observation rather than a
  // contract, so the order is imposed here. Offers with no `buyboxOrder` sort last, keeping
  // their relative order, rather than silently claiming rank 1.
  const parsed = listings
    .map((raw, index) => ({ listing: asObject(raw), index }))
    .filter((entry): entry is { listing: Json; index: number } => entry.listing !== null)
    .sort((a, b) => {
      const orderA = asFiniteNumber(a.listing.buyboxOrder) ?? Number.MAX_SAFE_INTEGER;
      const orderB = asFiniteNumber(b.listing.buyboxOrder) ?? Number.MAX_SAFE_INTEGER;
      return orderA === orderB ? a.index - b.index : orderA - orderB;
    });

  // `rank` is our own 1-based position, not the marketplace's `buyboxOrder`. They agree on a
  // well-formed payload; if the endpoint ever skips a number, our ranks stay dense while
  // `isWinner` continues to come from the marketplace's own flag.
  const offers = parsed.map((entry, position) => buildOffer(entry.listing, position + 1));

  const winnerFound = offers.some((offer) => offer.isWinner);
  // Sellers with no id fall back to their own index so two anonymous sellers are not collapsed.
  const merchantIds = new Set(offers.map((offer, index) => offer.sellerRef ?? `#${index}`));

  return {
    offers,
    diagnostics: {
      extractionMethod: 'publicJsonApi',
      parserVersion: HEPSIBURADA_PARSER_VERSION,
      stateFound: root !== null,
      productFound: data !== null,
      merchantListingFound: Array.isArray(listingsRaw),
      // One flat array carries both roles here, so the two winner counters that Trendyol needs
      // for its split payload are necessarily the same fact.
      winnerMerchantFound: winnerFound,
      winnerVariantFound: winnerFound,
      // Every seller other than the buybox holder.
      otherMerchantCount: winnerFound ? Math.max(offers.length - 1, 0) : offers.length,
      merchantCount: merchantIds.size,
      listingCount: offers.length,
    },
  };
}
