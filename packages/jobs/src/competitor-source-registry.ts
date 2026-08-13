/**
 * A live `ICompetitorSource` per marketplace, built at worker boot exactly like
 * `MarketplaceAdapterRegistry` — but kept **separate from it on purpose**.
 *
 * The marketplace adapter registry is the control path; this one is reporting (doc 10 §5.1).
 * A marketplace may be present in one and absent from the other, and the absence of a
 * competitor source is a normal, fully supported configuration: it means competitor history
 * is not collected for that marketplace, and nothing else changes (doc 12 Phase 7's
 * definition of done). That is why the lookup returns `undefined` rather than throwing, in
 * contrast to `getAdapter`.
 */
import type { ICompetitorSource } from '@buybox/adapters';
import type { MarketplaceCode } from '@buybox/core';

export type CompetitorSourceRegistry = ReadonlyMap<MarketplaceCode, ICompetitorSource>;

export function buildCompetitorSourceRegistry(
  entries: readonly (readonly [MarketplaceCode, ICompetitorSource])[],
): CompetitorSourceRegistry {
  return new Map(entries);
}

export function getCompetitorSource(
  registry: CompetitorSourceRegistry | undefined,
  code: MarketplaceCode,
): ICompetitorSource | undefined {
  return registry?.get(code);
}
