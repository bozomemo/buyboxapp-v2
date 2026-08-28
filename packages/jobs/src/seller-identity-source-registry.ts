/**
 * A live `ISellerIdentitySource` per marketplace — the fourth registry, next to
 * `MarketplaceAdapterRegistry` (control), `CompetitorSourceRegistry` (per-product reporting) and
 * `BrandCatalogueSourceRegistry` (per-brand reporting).
 *
 * Separate for the reason the port is separate: this one asks for a product page **as** one
 * merchant, which makes its ordering untrustworthy and its identity fields available. Keeping it
 * out of the competitor registry means no scraping job can reach it by accident — a job holding
 * a `CompetitorSourceRegistry` has no way to make a merchant-scoped request at all.
 *
 * An absent entry is a normal configuration: identities simply cannot be resolved on that
 * marketplace, and nothing else changes. The lookup returns `undefined` rather than throwing.
 */
import type { ISellerIdentitySource } from '@buybox/adapters';
import type { MarketplaceCode } from '@buybox/core';

export type SellerIdentitySourceRegistry = ReadonlyMap<MarketplaceCode, ISellerIdentitySource>;

export function buildSellerIdentitySourceRegistry(
  entries: readonly (readonly [MarketplaceCode, ISellerIdentitySource])[],
): SellerIdentitySourceRegistry {
  return new Map(entries);
}

export function getSellerIdentitySource(
  registry: SellerIdentitySourceRegistry | undefined,
  code: MarketplaceCode,
): ISellerIdentitySource | undefined {
  return registry?.get(code);
}
