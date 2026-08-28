/**
 * A live `IBrandCatalogueSource` per marketplace, built at worker boot — the third registry,
 * alongside `MarketplaceAdapterRegistry` (control) and `CompetitorSourceRegistry` (per-product
 * reporting).
 *
 * Separate from the competitor registry for the same reason the port is separate: a sweep and a
 * product-page scrape have different cost profiles and different rate budgets, and a deployment
 * may reasonably run one without the other. As with competitor sources, an absent entry is a
 * normal configuration — it means no brand is swept on that marketplace and nothing else
 * changes — so the lookup returns `undefined` rather than throwing.
 */
import type { IBrandCatalogueSource } from '@buybox/adapters';
import type { MarketplaceCode } from '@buybox/core';

export type BrandCatalogueSourceRegistry = ReadonlyMap<MarketplaceCode, IBrandCatalogueSource>;

export function buildBrandCatalogueSourceRegistry(
  entries: readonly (readonly [MarketplaceCode, IBrandCatalogueSource])[],
): BrandCatalogueSourceRegistry {
  return new Map(entries);
}

export function getBrandCatalogueSource(
  registry: BrandCatalogueSourceRegistry | undefined,
  code: MarketplaceCode,
): IBrandCatalogueSource | undefined {
  return registry?.get(code);
}
