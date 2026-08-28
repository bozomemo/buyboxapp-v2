/**
 * Normalises Trendyol's `__single-search-result__PROPS` state — the search / brand listing
 * page's embedded payload — into the port's `BrandCatalogueProduct` shape
 * (api-references §1.7, verified live 2026-08-27).
 *
 * This is the **only** module allowed to know this payload's field names. Everything past it
 * speaks the port's vocabulary, so a Trendyol frontend change is contained here and shows up as
 * a diagnostics counter rather than as a quietly shrinking catalogue.
 *
 * Parsing is language-independent by construction, exactly as the product-page normaliser is
 * (`../public-page/normalize.ts`, guide §26): ids, enums, booleans and numeric fields only —
 * never a Turkish display string, never a `*Text` sibling, never a CSS class.
 *
 * ## What this payload is, and what it is not
 *
 * `data.products[]` is a list of **product cards**, not offers. Each card names exactly one
 * seller — `merchantId`, whoever held the buybox when the page rendered — and carries no seller
 * list at all. The full seller set for a product costs one product-page fetch each and is the
 * job of `ICompetitorSource`. Reading a card as "the competition" would understate every
 * product to a single seller; the port's field is named `buyboxSellerRef` to make that
 * impossible to do by accident.
 */
import { Money } from '@buybox/shared';
import type {
  BrandCatalogueDiagnostics,
  BrandCatalogueProduct,
} from '../../ports/brand-catalogue-source.js';

/** Bumped whenever the extraction rules change, so sweep rows stay attributable (guide §33). */
export const TRENDYOL_BRAND_CATALOGUE_PARSER_VERSION = '1.0.0';

export class TrendyolBrandCatalogueSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrendyolBrandCatalogueSchemaError';
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
 * The card's price node is flatter than the product page's: plain numbers in **lira**, each
 * beside a locale-formatted `*Text` twin (`current` 908 / `currentText` "908"). Only the number
 * is data — the twin is presentation and is never read, for the same reason the product-page
 * normaliser refuses `price.text` (guide §15).
 *
 * Precedence is `discountedPrice → current → originalPrice`: the first is what a customer pays,
 * which is the only price a report about undercutting can be built on. `original` is the
 * pre-discount shelf price and would make a discounting seller look like a full-price one.
 *
 * Conversion to exact kuruş happens here, once, through a decimal string — never float
 * arithmetic (CLAUDE.md: money is bigint kuruş).
 */
function readCardPrice(node: unknown): Money | null {
  const price = asObject(node);
  if (!price) return null;
  const value =
    asFiniteNumber(price.discountedPrice) ?? asFiniteNumber(price.current) ?? asFiniteNumber(price.originalPrice);
  if (value === null) return null;
  return Money.fromMajorUnitsString(value.toFixed(2));
}

/**
 * `ratingScore` is `{ averageRating, totalCount }` on a card. Absent is `null`, never `0`:
 * "no one has rated this" and "we could not read the rating" are different facts, and the
 * dead-product suggestion (doc 06) acts on the first alone.
 */
function readRating(node: unknown): { count: number | null; average: number | null } {
  const rating = asObject(node);
  if (!rating) return { count: null, average: null };
  return { count: asFiniteNumber(rating.totalCount), average: asFiniteNumber(rating.averageRating) };
}

/**
 * The card carries the brand twice: `brandId` (Trendyol's internal brand) and `webBrands[].id`
 * (the storefront brand the `wb=` filter addresses). They are **different numbers for the same
 * brand** — Whiskas is `brandId` 14722 and `webBrands[0].id` 104703 — and the one a caller can
 * compare against its own query is the storefront one, so that is what is returned. Recording
 * the wrong one would make every product look like it belonged to a different brand than the
 * one that was swept.
 */
function readBrandRef(card: Json): string | null {
  const webBrand = asObject(asArray(card.webBrands)[0]);
  return asNonEmptyString(webBrand?.id) ?? asNonEmptyString(card.brandId);
}

function buildProduct(card: Json): BrandCatalogueProduct | null {
  // No `contentId` means no durable identity, so the row cannot be stored, deduplicated or
  // re-fetched later. Dropped — and counted in `droppedCount`, never silently skipped.
  const productRef = asNonEmptyString(card.contentId) ?? asNonEmptyString(card.id);
  if (productRef === null) return null;

  const category = asObject(card.category);
  const rating = readRating(card.ratingScore);

  return {
    productRef,
    url: asNonEmptyString(card.url),
    name: asNonEmptyString(card.name),
    brandName: asNonEmptyString(card.brand),
    brandRef: readBrandRef(card),
    categoryRef: asNonEmptyString(category?.id),
    categoryName: asNonEmptyString(category?.name),
    ratingCount: rating.count,
    ratingAverage: rating.average,
    price: readCardPrice(card.price),
    buyboxSellerRef: asNonEmptyString(card.merchantId),
  };
}

export interface TrendyolBrandCataloguePage {
  readonly products: readonly BrandCatalogueProduct[];
  readonly totalProducts: number | null;
  readonly pageIndex: number | null;
  readonly diagnostics: BrandCatalogueDiagnostics;
}

/**
 * @throws {TrendyolBrandCatalogueSchemaError} when `data.products` is present but is not an
 * array — a shape we have no rules for. Processing it with the current rules would produce
 * plausible-looking wrong data, which is worse than a recorded `parseFailed` (doc 05 §5).
 *
 * A **missing** `data.products`, by contrast, is not an error: that is what a page past the end
 * of the catalogue looks like, and the port requires it to normalise to an empty page so the
 * caller's paging loop terminates on data rather than on an exception.
 */
export function normalizeTrendyolBrandCataloguePage(state: unknown): TrendyolBrandCataloguePage {
  const root = asObject(state);
  const data = asObject(root?.data);

  if (data !== null && data.products !== undefined && !Array.isArray(data.products)) {
    throw new TrendyolBrandCatalogueSchemaError(
      'data.products is present but not an array — schema mismatch against api-references §1.7; refusing to guess',
    );
  }

  const cards = asArray(data?.products);
  const products: BrandCatalogueProduct[] = [];
  let droppedCount = 0;

  for (const raw of cards) {
    const card = asObject(raw);
    if (!card) {
      droppedCount += 1;
      continue;
    }
    const product = buildProduct(card);
    if (product === null) {
      droppedCount += 1;
      continue;
    }
    products.push(product);
  }

  return {
    products,
    // `total` is the marketplace's own claim and has been seen to disagree slightly with the
    // number of cards actually served across all pages. Reported as-is for progress display;
    // never used as a loop bound, which is what the empty-page rule is for.
    totalProducts: asFiniteNumber(data?.total) ?? asFiniteNumber(data?.roughTotal),
    pageIndex: asFiniteNumber(data?.pageIndex),
    diagnostics: {
      parserVersion: TRENDYOL_BRAND_CATALOGUE_PARSER_VERSION,
      stateFound: root !== null,
      dataFound: data !== null,
      rawCardCount: cards.length,
      droppedCount,
    },
  };
}
