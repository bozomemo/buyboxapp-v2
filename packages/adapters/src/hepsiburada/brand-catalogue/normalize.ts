/**
 * Normalises Hepsiburada's search-page card payload — `window.MORIA.PRODUCTLIST`'s `STATE` —
 * into the port's `BrandCatalogueProduct` shape (api-references §2.13, verified live
 * 2026-08-28).
 *
 * This is the **only** module allowed to know this payload's field names, exactly as its
 * Trendyol twin is. Parsing is language-independent by construction: ids, enums, booleans and
 * numeric fields only — never a Turkish display string, never a `formatted*` sibling, never a
 * CSS class.
 *
 * ## One row per variant, not per card
 *
 * A card is a *product* (`productId`, `HBC…`) and carries a `variantList` of separately
 * sellable *variants* (`sku`, `HBCV…`). The SKU is the identity everything downstream uses: it
 * is what `/api/v1/product/listings/{sku}` is keyed by (measured 2026-08-28) and therefore what
 * `ProductPageRef.contentId` has to carry. So each variant becomes its own row. Every card in
 * the verified page held exactly one variant, which is precisely why the multi-variant case
 * must be handled here rather than assumed away — a two-pack-size product reported as one row
 * would hide half a brand's shelf from its owner.
 *
 * ⚠️ **The rating belongs to the card, not to the variant.** `customerReviewCount` sits on the
 * product, so two variants of one product report the same count. It is the parent's number
 * repeated, never two independent ones — summing it across a brand double-counts. Consumers
 * that want a brand total must count distinct products.
 *
 * ⚠️ **A card names one seller: whoever held the buybox when the page rendered.** There is no
 * seller list on a card at all (`isMultiSeller` is a boolean, not a count), so nothing here may
 * be read as "the competition". The full seller set costs one listings request per SKU and is
 * `ICompetitorSource`'s job.
 */
import { Money } from '@buybox/shared';
import type {
  BrandCatalogueDiagnostics,
  BrandCatalogueProduct,
} from '../../ports/brand-catalogue-source.js';

/** Bumped whenever the extraction rules change, so sweep rows stay attributable. */
export const HEPSIBURADA_BRAND_CATALOGUE_PARSER_VERSION = '1.0.0';

export class HepsiburadaBrandCatalogueSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HepsiburadaBrandCatalogueSchemaError';
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
 * The card's price node is plain numbers in **lira**, beside a `formattedPrice` twin on the
 * product page's copy of the same figure. Only the number is data.
 *
 * `price` is taken over `originalPrice`: the first is what a customer pays and the second is the
 * pre-discount shelf price, which would make a discounting seller look like a full-price one.
 * Conversion to exact kuruş happens here, once, through a decimal string — never float
 * arithmetic (CLAUDE.md: money is bigint kuruş).
 */
function readCardPrice(node: unknown): Money | null {
  const priceInfo = asObject(node);
  if (!priceInfo) return null;
  const value = asFiniteNumber(priceInfo.price) ?? asFiniteNumber(priceInfo.originalPrice);
  if (value === null) return null;
  return Money.fromMajorUnitsString(value.toFixed(2));
}

/**
 * Ratings are absent as `null`, never `0`: "nobody has rated this" and "we could not read the
 * rating" are different facts, and the dead-product suggestion (doc 06) acts on the first alone.
 * Hepsiburada reports an unrated product as `customerReviewCount: 0`, which *is* the first fact
 * and is kept as `0` — the `null` is reserved for a card that carried no such field at all.
 */
function readRating(card: Json): { count: number | null; average: number | null } {
  return {
    count: asFiniteNumber(card.customerReviewCount),
    average: asFiniteNumber(card.customerReviewRating),
  };
}

function buildVariantRows(card: Json): { rows: BrandCatalogueProduct[]; dropped: number } {
  const rows: BrandCatalogueProduct[] = [];
  let dropped = 0;

  const rating = readRating(card);
  const category = asObject(card.mainCategory);
  const brandName = asNonEmptyString(card.brand);

  for (const entry of asArray(card.variantList)) {
    const variant = asObject(entry);
    // No SKU means no durable identity: the row could not be stored, deduplicated, or asked
    // about later, because the listings endpoint is addressed by SKU and by nothing else.
    // Dropped, and counted — never silently skipped.
    const productRef = variant === null ? null : asNonEmptyString(variant.sku);
    if (variant === null || productRef === null) {
      dropped += 1;
      continue;
    }

    const listing = asObject(variant.listing);
    rows.push({
      productRef,
      url: asNonEmptyString(variant.url),
      name: asNonEmptyString(variant.name),
      brandName,
      // Hepsiburada does not put a brand id on a card. The product page carries one — the
      // brand's slug, `brandId: "whiskas"` — but deriving it from the card's display name would
      // be exactly the guess this parser is forbidden to make.
      brandRef: null,
      categoryRef: asNonEmptyString(category?.id),
      categoryName: asNonEmptyString(category?.name),
      ratingCount: rating.count,
      ratingAverage: rating.average,
      price: readCardPrice(listing?.priceInfo),
      buyboxSellerRef: asNonEmptyString(listing?.merchantId),
    });
  }

  // A card with no variants at all has no sellable identity either; it counts as one drop so the
  // card is not silently lost between `rawCardCount` and the rows returned.
  if (rows.length === 0 && dropped === 0) dropped = 1;
  return { rows, dropped };
}

export interface HepsiburadaBrandCataloguePage {
  readonly products: readonly BrandCatalogueProduct[];
  readonly totalProducts: number | null;
  /** The page the payload says it is, which is not always the page that was requested. */
  readonly pageIndex: number | null;
  /** The marketplace's own claim about how many pages exist; itself capped (see the source). */
  readonly lastPage: number | null;
  readonly diagnostics: BrandCatalogueDiagnostics;
}

/**
 * @throws {HepsiburadaBrandCatalogueSchemaError} when the payload is not the shape this parser
 * was written against. An unrecognised payload is a named failure, never an empty catalogue —
 * a brand that returns zero products and a brand whose page changed must not look alike.
 */
export function normalizeHepsiburadaBrandCatalogue(state: unknown): HepsiburadaBrandCataloguePage {
  const root = asObject(state);
  const data = asObject(root?.data);
  if (!data) {
    throw new HepsiburadaBrandCatalogueSchemaError(
      'Hepsiburada product list state carried no `data` object',
    );
  }
  if (!Array.isArray(data.products)) {
    throw new HepsiburadaBrandCatalogueSchemaError(
      'Hepsiburada `data.products` is not an array — the card payload changed shape',
    );
  }

  const products: BrandCatalogueProduct[] = [];
  let dropped = 0;
  for (const entry of data.products) {
    const card = asObject(entry);
    if (!card) {
      dropped += 1;
      continue;
    }
    const built = buildVariantRows(card);
    products.push(...built.rows);
    dropped += built.dropped;
  }

  return {
    products,
    totalProducts: asFiniteNumber(data.totalProductCount),
    pageIndex: asFiniteNumber(data.currentPage),
    lastPage: asFiniteNumber(data.lastPage),
    diagnostics: {
      parserVersion: HEPSIBURADA_BRAND_CATALOGUE_PARSER_VERSION,
      stateFound: true,
      dataFound: true,
      rawCardCount: data.products.length,
      droppedCount: dropped,
    },
  };
}
