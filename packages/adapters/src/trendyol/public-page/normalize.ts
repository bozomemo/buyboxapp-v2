/**
 * Normalises Trendyol's `__envoy__SHARED_PROPS` state into the scraper-owned `offers[]` shape
 * (`docs/trendyol-merchants-scraping-guide.md` §4–§33, api-references §1.6).
 *
 * This is the **only** module allowed to know Trendyol's public-page field names. Everything
 * past it speaks `CompetitorOffer` (doc 10 §3), so a Trendyol frontend change is contained
 * here and shows up as a diagnostics counter rather than as quietly empty reports.
 *
 * Parsing is language-independent by construction (guide §26): ids, enums, booleans and
 * numeric fields only — never a Turkish display string, never `price.text`, never a CSS class.
 */
import { Money } from '@buybox/shared';
import type {
  CompetitorOffer,
  CompetitorProductFacts,
  ScrapeDiagnostics,
} from '../../ports/competitor-source.js';

/** Bumped whenever the extraction rules change, so `scrape_runs` rows stay attributable (guide §33). */
export const TRENDYOL_PARSER_VERSION = '1.0.0';

export class TrendyolPageSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrendyolPageSchemaError';
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
 * Trendyol wraps every price as `{ value, text }`. Only `value` is data (guide §15): `text` is
 * locale-formatted presentation ("35.010 TL" is thirty-five thousand and ten lira in tr-TR),
 * and the payload is known to carry `"NaN TL"` with no numeric sibling (guide §16), which must
 * normalise to `null` and never to a number.
 *
 * `value` is in **lira** — major units. It becomes exact kuruş here, once, via a decimal
 * string; never via float arithmetic (CLAUDE.md: money is bigint kuruş).
 */
function moneyFromPriceNode(node: unknown): Money | null {
  const object = asObject(node);
  if (!object) return null;
  const value = asFiniteNumber(object.value);
  if (value === null) return null;
  return Money.fromMajorUnitsString(value.toFixed(2));
}

interface OfferPrices {
  readonly price: Money | null;
  readonly finalPrice: Money | null;
}

/**
 * doc 01 §7's competitor mapping: the domain's `sellingPrice` is the page's `discountedPrice`
 * and its `basketDiscountPrice` is `couponApplicablePrice`. Where no coupon price exists the
 * final price is the shelf price — not `null`, which would read as "unknown" downstream.
 *
 * **`finalPrice` is expected to equal `price` on this marketplace, and that is not a bug**
 * (api-references §1.6, settled 2026-08-26 against two live pages). `discountedPrice` already
 * has the promotion applied: an offer under a `300 TL'ye 30 TL İndirim` promotion carries
 * `discountedPrice` 420 next to `discountedPriceAfterNoLimitPromotions` 450. So
 * `couponApplicablePrice` is genuinely redundant here, and the fallback firing every time is
 * the correct outcome rather than evidence of a missing field.
 *
 * Two fields on this node are read deliberately *not* at all:
 *
 * - `discountedPriceAfterNoLimitPromotions` — the pre-promotion shelf price. We keep the price
 *   a customer pays, not the one they don't; mapping it would need its own column, and no
 *   pricing decision wants it.
 * - `tyPlusCouponApplicablePrice` — a Trendyol Plus membership price, observed genuinely lower
 *   (720 → 684). It must never replace `price`: it is not the price every customer sees, so
 *   undercutting it would mean undercutting an offer most buyers cannot take.
 */
function readPrices(priceNode: unknown): OfferPrices {
  const object = asObject(priceNode);
  if (!object) return { price: null, finalPrice: null };
  const discounted = moneyFromPriceNode(object.discountedPrice) ?? moneyFromPriceNode(object.sellingPrice);
  const coupon = moneyFromPriceNode(object.couponApplicablePrice);
  return { price: discounted, finalPrice: coupon ?? discounted };
}

/** guide §9: the score is `sellerScore.value`; the colour is presentation. Absent is `null`, never `-1` (doc 10 §3). */
function readSellerScore(node: unknown): number | null {
  const object = asObject(node);
  if (object) return asFiniteNumber(object.value);
  return asFiniteNumber(node);
}

interface PromotionSummary {
  readonly hasPromotion: boolean;
  readonly promotionText: string | null;
}

/**
 * guide §19: promotions are *classified* by structured fields, never by matching Turkish text.
 * Names are still retained verbatim as operator-facing display data — that is a different job
 * from parsing, and the distinction is the whole point of §26.
 */
function readPromotions(node: unknown): PromotionSummary {
  const promotions = asArray(node);
  if (promotions.length === 0) return { hasPromotion: false, promotionText: null };
  const names = promotions
    .map((promotion) => asNonEmptyString(asObject(promotion)?.name))
    .filter((name): name is string => name !== null);
  return { hasPromotion: true, promotionText: names.length > 0 ? names.join(' · ') : null };
}

/**
 * guide §17: availability has several independent fields and must not all be derived from
 * `quantity`. `competitor_observations` stores only an offered-stock integer (doc 05 §5), so
 * the reduction is explicit: an offer the page marks unsellable is zero stock; otherwise the
 * quantity if the page gives one, else unknown (`null`) — never a guessed number.
 */
function readOfferedStock(variant: Json): number | null {
  const sellable = variant.sellable;
  const inStock = variant.inStock;
  if (sellable === false || inStock === false) return 0;
  return asFiniteNumber(variant.quantity);
}

interface OfferSource {
  readonly merchant: Json;
  readonly variant: Json | null;
  readonly promotions: unknown;
  readonly isWinner: boolean;
  /** Merchant-level price node, used only as a fallback for `variant.price` (guide §13). */
  readonly merchantPrice: unknown;
}

function buildOffer(source: OfferSource, rank: number): CompetitorOffer {
  const variant = source.variant ?? {};
  const variantPrices = readPrices(variant.price);
  const prices = variantPrices.price !== null ? variantPrices : readPrices(source.merchantPrice); // guide §13 precedence
  const { hasPromotion, promotionText } = readPromotions(source.promotions);

  return {
    rank,
    // guide §8: the merchant id is the identity. The seller name is data, never a key.
    sellerRef: asNonEmptyString(source.merchant.id),
    sellerName: asNonEmptyString(source.merchant.name),
    sellerRating: readSellerScore(source.merchant.sellerScore),
    // guide §10: listing id and merchant id are different things and are never interchangeable.
    listingRef: asNonEmptyString(variant.listingId),
    price: prices.price,
    finalPrice: prices.finalPrice,
    offeredStock: readOfferedStock(variant),
    // The public page exposes rush-delivery *hours* (`rushDeliveryDuration`), not the
    // dispatch-time *days* that `listings.dispatch_time` holds (api-references §1.4). Mapping
    // one onto the other would be a unit error, so competitor dispatch time stays unknown.
    dispatchTime: null,
    hasPromotion,
    promotionText,
    isWinner: source.isWinner,
  };
}

export interface TrendyolPageOffers {
  readonly offers: readonly CompetitorOffer[];
  readonly product: CompetitorProductFacts;
  readonly diagnostics: ScrapeDiagnostics;
}

/**
 * The product's rating, from the same node the brand catalogue reads (api-references §1.7, §1.6).
 *
 * `null` is **unknown** and `0` is *genuinely unrated*, and the two must not merge: the
 * dead-product suggestion acts on the second only, and offering an operator rows to deactivate
 * on the strength of our own parse failure is the mistake that split exists to prevent
 * (api-references §1.7 note 5).
 */
function readRating(node: unknown): CompetitorProductFacts {
  const score = asObject(node);
  if (!score) return { ratingCount: null, ratingAverage: null };
  return {
    ratingCount: asFiniteNumber(score.totalCount),
    ratingAverage: asFiniteNumber(score.averageRating),
  };
}

/**
 * @throws {TrendyolPageSchemaError} when the payload's shape is not the one documented in the
 * guide — in particular when `merchantListing` arrives as an array (guide §32). Processing an
 * unknown shape with the current rules would produce plausible-looking wrong data, which is
 * worse than a recorded `parseFailed` (doc 05 §5).
 */
export function normalizeTrendyolPage(state: unknown): TrendyolPageOffers {
  const root = asObject(state);
  const product = asObject(root?.product);
  const merchantListingRaw = product?.merchantListing;

  if (Array.isArray(merchantListingRaw)) {
    // The legacy system read `merchantListings[]` (doc 04 §1.5); today it is an object with a
    // separate winner. If it ever flips back, fail loudly rather than silently mis-parse.
    throw new TrendyolPageSchemaError(
      'product.merchantListing is an array — schema mismatch against guide §4/§32; refusing to guess',
    );
  }

  const merchantListing = asObject(merchantListingRaw);
  const merchant = asObject(merchantListing?.merchant);
  const winnerVariant = asObject(merchantListing?.winnerVariant);
  const otherMerchants = asArray(merchantListing?.otherMerchants);

  const offers: CompetitorOffer[] = [];
  let rank = 0;

  // guide §7: the winner is stored separately and must not be lost because it is absent from
  // `otherMerchants`. guide §6: its identity and its offer live in two places and are joined.
  if (merchant && winnerVariant) {
    rank += 1;
    offers.push(
      buildOffer(
        {
          merchant,
          variant: winnerVariant,
          promotions: merchantListing?.promotions,
          isWinner: true,
          merchantPrice: merchant.price,
        },
        rank,
      ),
    );
  }

  // guide §12: one merchant may expose several listing variants; emit one offer per variant so
  // a future multi-variant product does not silently lose listings.
  for (const raw of otherMerchants) {
    const other = asObject(raw);
    if (!other) continue;
    const variants = asArray(other.variants);
    if (variants.length === 0) {
      rank += 1;
      offers.push({
        ...buildOffer(
          {
            merchant: other,
            variant: null,
            promotions: other.promotions,
            isWinner: false,
            merchantPrice: other.price,
          },
          rank,
        ),
      });
      continue;
    }
    for (const variantRaw of variants) {
      rank += 1;
      offers.push(
        buildOffer(
          {
            merchant: other,
            variant: asObject(variantRaw),
            promotions: other.promotions,
            isWinner: false,
            merchantPrice: other.price,
          },
          rank,
        ),
      );
    }
  }

  // guide §24: merchant count and listing count are different metrics, and the winner is not
  // in `otherMerchants`. Sellers with no id fall back to their own index so two anonymous
  // sellers are not collapsed into one.
  const merchantIds = new Set(offers.map((offer, index) => offer.sellerRef ?? `#${index}`));

  return {
    offers,
    product: readRating(product?.ratingScore),
    diagnostics: {
      extractionMethod: 'embeddedJson',
      parserVersion: TRENDYOL_PARSER_VERSION,
      stateFound: root !== null,
      productFound: product !== null,
      merchantListingFound: merchantListing !== null,
      winnerMerchantFound: merchant !== null,
      winnerVariantFound: winnerVariant !== null,
      otherMerchantCount: otherMerchants.length,
      merchantCount: merchantIds.size,
      listingCount: offers.length,
    },
  };
}
