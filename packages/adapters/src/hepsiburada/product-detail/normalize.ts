/**
 * Normalises Hepsiburada's product-page redux store into the port's `ProductDetail`
 * (api-references §2.14, verified live 2026-08-28).
 *
 * The only module allowed to know `productState.product`'s field names. Ids, enums, booleans and
 * numeric fields only — never a Turkish display string, never a `formatted*` sibling.
 *
 * The page also carries a JSON-LD block with the same barcode under `gtin`. It is deliberately
 * not read: the redux store is the data the page was built from, while the JSON-LD is a second
 * rendering of it for search engines, and two sources for one field is one more than can be kept
 * honest. If the store stops carrying it, that is a named failure — not a silent fallback to a
 * copy that may be stale.
 */
import type { ProductDetail, ProductDetailDiagnostics } from '../../ports/product-detail-source.js';

export const HEPSIBURADA_PRODUCT_DETAIL_PARSER_VERSION = '1.0.0';

export class HepsiburadaProductDetailSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HepsiburadaProductDetailSchemaError';
  }
}

export class HepsiburadaProductMismatchError extends Error {
  constructor(
    readonly requestedRef: string,
    readonly returnedRef: string | null,
  ) {
    super(
      `Hepsiburada product page describes ${returnedRef ?? 'an unnamed product'} but ${requestedRef} was requested`,
    );
    this.name = 'HepsiburadaProductMismatchError';
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

function asBooleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/**
 * `categories` is the breadcrumb, shallowest first. The deepest entry is the one that describes
 * the product — "Yetişkin Kedi Konserveleri" rather than "Pet Shop" — and it is the level the
 * catalogue cards' `mainCategory` reports, so the two agree.
 */
function readDeepestCategory(value: unknown): { ref: string | null; name: string | null } {
  let deepest: Json | null = null;
  let deepestLevel = Number.NEGATIVE_INFINITY;
  for (const entry of asArray(value)) {
    const category = asObject(entry);
    if (!category) continue;
    const level = asFiniteNumber(category.categoryLevel) ?? 0;
    if (level >= deepestLevel) {
      deepestLevel = level;
      deepest = category;
    }
  }
  if (!deepest) return { ref: null, name: null };
  return { ref: asNonEmptyString(deepest.categoryId), name: asNonEmptyString(deepest.categoryName) };
}

/**
 * Whether the product is still shown — read from `isProductLive` and from nothing else.
 *
 * ⚠️ `isClosedProduct` looks like the authoritative negative and is **not read**. The verified
 * 2026-08-28 payload carries `isProductLive: true` and `isClosedProduct: true` *at the same
 * time*, on a product that was plainly on sale with six sellers and a buybox price. Two booleans
 * that contradict each other are not a fact about the product, and mapping the one whose name
 * reads more decisive would have reported a live product as gone. It stays unmapped until the
 * marketplace's meaning for it is established (api-references §2.14, still unconfirmed).
 */
function readIsLive(product: Json): boolean | null {
  return asBooleanOrNull(product.isProductLive);
}

export interface HepsiburadaProductDetail {
  readonly detail: Omit<ProductDetail, 'marketplaceCode'>;
  readonly diagnostics: ProductDetailDiagnostics;
}

/**
 * @throws {HepsiburadaProductDetailSchemaError} when the store is not the shape this parser was
 * written against.
 * @throws {HepsiburadaProductMismatchError} when the page is about a different SKU than the one
 * requested — the one outcome that must never be stored, because a barcode written onto the
 * wrong product makes every cross-marketplace match built on it wrong.
 */
export function normalizeHepsiburadaProductDetail(
  state: unknown,
  requestedRef: string,
): HepsiburadaProductDetail {
  const root = asObject(state);
  const product = asObject(asObject(root?.productState)?.product);
  if (!product) {
    throw new HepsiburadaProductDetailSchemaError(
      'Hepsiburada product page carried no productState.product',
    );
  }

  const productRef = asNonEmptyString(product.sku);
  if (productRef === null) {
    throw new HepsiburadaProductDetailSchemaError('Hepsiburada product carried no sku');
  }
  if (productRef !== requestedRef) {
    throw new HepsiburadaProductMismatchError(requestedRef, productRef);
  }

  const category = readDeepestCategory(product.categories);
  const reviews = asObject(product.reviews);

  // Counted, never read. See the port: this array is truncated and looks complete. The page
  // states the truncation itself — `hasMoreListings` — so the flag is that statement and not a
  // guess from the array's length, which is what it looks like when a product has two sellers.
  const sellerListWasTruncated = asBooleanOrNull(product.hasMoreListings) === true;

  return {
    detail: {
      productRef,
      parentProductRef: asNonEmptyString(product.productId),
      barcode: asNonEmptyString(product.barcode),
      name: asNonEmptyString(product.name),
      brandName: asNonEmptyString(product.brand),
      brandRef: asNonEmptyString(product.brandId),
      categoryRef: category.ref,
      categoryName: category.name,
      ratingCount: asFiniteNumber(reviews?.customerReviewCount),
      ratingAverage: asFiniteNumber(reviews?.customerReviewScore),
      isLive: readIsLive(product),
    },
    diagnostics: {
      parserVersion: HEPSIBURADA_PRODUCT_DETAIL_PARSER_VERSION,
      stateFound: true,
      sellerListWasTruncated,
    },
  };
}
