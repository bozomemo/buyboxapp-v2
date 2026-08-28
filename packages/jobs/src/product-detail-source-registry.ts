/**
 * A live `IProductDetailSource` per marketplace — the fifth registry, next to
 * `MarketplaceAdapterRegistry` (control), `CompetitorSourceRegistry` (per-product reporting),
 * `BrandCatalogueSourceRegistry` (per-brand reporting) and `SellerIdentitySourceRegistry`
 * (merchant-scoped).
 *
 * Separate for the reason the port is separate: the product page carries a **truncated** seller
 * list that looks complete, and a job holding only this registry has no type in which such a
 * list could arrive. Folding it into the competitor registry would put "2 of 6 sellers" and
 * "all 6 sellers" behind one method name.
 *
 * An absent entry is a normal configuration: barcodes simply cannot be resolved on that
 * marketplace, and nothing else changes.
 */
import type { IProductDetailSource } from '@buybox/adapters';
import type { MarketplaceCode } from '@buybox/core';

export type ProductDetailSourceRegistry = ReadonlyMap<MarketplaceCode, IProductDetailSource>;

export function buildProductDetailSourceRegistry(
  entries: readonly (readonly [MarketplaceCode, IProductDetailSource])[],
): ProductDetailSourceRegistry {
  return new Map(entries);
}

export function getProductDetailSource(
  registry: ProductDetailSourceRegistry | undefined,
  code: MarketplaceCode,
): IProductDetailSource | undefined {
  return registry?.get(code);
}
