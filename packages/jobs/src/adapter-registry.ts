/**
 * A live `IMarketplaceAdapter` per marketplace, built once at worker boot from credentials
 * read out of the secret store (doc 10 §8 — out of scope for this package) and threaded
 * through every job via `JobContext.adapters`. Jobs never construct an adapter themselves.
 */
import type { IMarketplaceAdapter } from '@buybox/adapters';
import type { MarketplaceCode } from '@buybox/core';

export type MarketplaceAdapterRegistry = ReadonlyMap<MarketplaceCode, IMarketplaceAdapter>;

export function buildAdapterRegistry(
  entries: readonly (readonly [MarketplaceCode, IMarketplaceAdapter])[],
): MarketplaceAdapterRegistry {
  return new Map(entries);
}

export class UnregisteredMarketplaceError extends Error {
  constructor(code: MarketplaceCode) {
    super(`No marketplace adapter registered for "${code}"`);
    this.name = 'UnregisteredMarketplaceError';
  }
}

export function getAdapter(registry: MarketplaceAdapterRegistry, code: MarketplaceCode): IMarketplaceAdapter {
  const adapter = registry.get(code);
  if (!adapter) throw new UnregisteredMarketplaceError(code);
  return adapter;
}
