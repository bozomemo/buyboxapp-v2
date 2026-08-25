/**
 * Maps raw Trendyol API JSON onto the port's `ListingSnapshot` / `BuyboxObservation` shapes.
 * This is the one place Trendyol's field names may appear — everything past this module speaks
 * the port's vocabulary only (doc 10 §3).
 *
 * Field mapping verified against docs/api-references.md §1.4 ("Product filter — approved
 * products (V2)" and "Buybox check") on 2026-08-12; `brand`/`category` (doc 06 §12.1) added
 * 2026-08-25 from the same, already-verified response — no new endpoint.
 */
import { Money } from '@buybox/shared';
import type { BuyboxObservation, ListingSnapshot } from '../ports/marketplace.js';

/** The subset of the product-filter (approved, V2) response this adapter consumes. */
export interface TrendyolVariant {
  readonly barcode: string;
  readonly stockCode: string;
  readonly commission: number | null;
  readonly vatRate: number | null;
  readonly price: {
    readonly salePrice: number;
    readonly listPrice: number | null;
    readonly priceSeenByCustomer: number | null;
  };
  readonly stock: { readonly quantity: number };
  readonly onSale: boolean;
  readonly locked: boolean;
  readonly lockReason: string | null;
  readonly archived: boolean;
  readonly blacklisted: boolean;
  readonly deliveryOptions?: { readonly deliveryDuration?: number | null };
  /** api-references §1.4: "Public product page URL (includes contentId and merchantId)". */
  readonly productUrl?: string | null;
}

export interface TrendyolProduct {
  readonly title: string;
  readonly variants: readonly TrendyolVariant[];
  /** Identifies the *product page*, shared with competitors (doc 01 §5) — the scrape key. */
  readonly contentId?: number | string | null;
  /** api-references §1.4 product-level fields, doc 06 §12.1. Already in this response. */
  readonly brand?: { readonly id: number | string; readonly name: string } | null;
  readonly category?: { readonly id: number | string; readonly name: string } | null;
}

export interface TrendyolProductFilterResponse {
  readonly content: readonly TrendyolProduct[];
  readonly nextPageToken?: string | null;
}

/** Trendyol prices are decimal lira in the wire JSON; converted to exact kuruş here, once. */
function moneyFromLira(value: number | null | undefined): Money | null {
  if (value === null || value === undefined) return null;
  // toFixed(2) avoids float noise (e.g. 149.90000000000002) before parsing to an exact decimal.
  return Money.fromMajorUnitsString(value.toFixed(2));
}

export function mapVariantToListingSnapshot(
  product: TrendyolProduct,
  variant: TrendyolVariant,
): ListingSnapshot {
  const price = moneyFromLira(variant.price.salePrice);
  if (price === null) {
    throw new Error(`Trendyol variant ${variant.barcode}: missing price.salePrice`);
  }
  return {
    marketplaceListingId: variant.barcode,
    sellerStockCode: variant.stockCode,
    productName: product.title,
    price,
    listPrice: moneyFromLira(variant.price.listPrice),
    customerPrice: moneyFromLira(variant.price.priceSeenByCustomer),
    offeredStock: variant.stock.quantity,
    commissionRate: variant.commission,
    vatRate: variant.vatRate,
    dispatchTime: variant.deliveryOptions?.deliveryDuration ?? null,
    isSalable: variant.onSale,
    isLocked: variant.locked,
    // Trendyol's product filter does not expose a distinct "suspended" flag (api-references
    // §1.4) — only Hepsiburada's listing service does. Not faked; left false.
    isSuspended: false,
    isArchived: variant.archived,
    isBlacklisted: variant.blacklisted,
    lockReasons: variant.locked && variant.lockReason ? [variant.lockReason] : [],
    // Same as isSuspended: Trendyol has no deactivation-reason list; nothing to map.
    deactivationReasons: [],
    // Reporting only (api-references §1.6). Captured at import so the scrape job never has to
    // call the Seller API just to learn where a product page lives.
    productPage: {
      url: variant.productUrl ?? null,
      contentId:
        product.contentId !== null && product.contentId !== undefined ? String(product.contentId) : null,
    },
    brand: product.brand ? { ref: String(product.brand.id), name: product.brand.name } : null,
    category: product.category ? { ref: String(product.category.id), name: product.category.name } : null,
  };
}

/** The buybox-information response shape (api-references §1.4 "Buybox check"). */
export interface TrendyolBuyboxInfo {
  readonly barcode: string;
  readonly buyboxOrder: number | null;
  readonly buyboxPrice: number | null;
  readonly hasMultipleSeller: boolean;
  readonly secondBuyboxPrice: number | null;
  readonly thirdBuyboxPrice: number | null;
}

export function mapBuyboxInfoToObservation(info: TrendyolBuyboxInfo, observedAt: Date): BuyboxObservation {
  return {
    marketplaceListingId: info.barcode,
    rank: info.buyboxOrder,
    buyboxPrice: moneyFromLira(info.buyboxPrice),
    secondPrice: moneyFromLira(info.secondBuyboxPrice),
    thirdPrice: moneyFromLira(info.thirdBuyboxPrice),
    hasMultipleSeller: info.hasMultipleSeller,
    observedAt,
  };
}
