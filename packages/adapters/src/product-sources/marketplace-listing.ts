/**
 * The `MarketplaceListing` product source (doc 10 §4): derive stock items from already-imported
 * marketplace listings — base stock codes discovered from seller SKUs via the same
 * `parseStockCode` the domain core uses elsewhere (docs/01-domain-model.md §2).
 *
 * This source does no I/O of its own: `packages/adapters` does not depend on `packages/db`
 * (doc 10 §2's dependency rule), so the caller — a job in `packages/jobs` that already has
 * repository access — passes the listings it already fetched in as `config.listings`.
 *
 * Cost is genuinely unknown at this stage (doc 10 §4: "Cost must then be supplied manually or
 * by another source"). `unitCost` is emitted as `Money.zero`, a value the ingestion job must
 * only ever write through an insert-if-absent path (`ensureStockItem`, not a full upsert) so a
 * previously-entered real cost is never clobbered back to zero.
 */
import { Money } from '@buybox/shared';
import { parseStockCode } from '@buybox/core';
import { z } from 'zod';
import type { ConnectionTestResult } from '../ports/marketplace.js';
import type { IProductSource, StockItemInput } from '../ports/product-source.js';

export const MarketplaceListingSourceConfigSchema = z.object({
  listings: z.array(
    z.object({
      sellerStockCode: z.string().min(1),
      productName: z.string().min(1),
    }),
  ),
});

export type MarketplaceListingSourceConfig = z.infer<typeof MarketplaceListingSourceConfigSchema>;

export const MarketplaceListingProductSource: IProductSource = {
  code: 'marketplaceListing',
  displayName: 'Pazaryeri listelerinden',
  status: 'available',
  configSchema: MarketplaceListingSourceConfigSchema,

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      ok: true,
      detail: 'Derives stock items from listings already imported; no connection of its own',
    };
  },

  async *fetch(rawConfig: unknown): AsyncIterable<StockItemInput> {
    const config = MarketplaceListingSourceConfigSchema.parse(rawConfig);
    const seen = new Set<string>();
    for (const listing of config.listings) {
      const parsed = parseStockCode(listing.sellerStockCode);
      if (!parsed.ok) continue; // unparseable SKU — surfaced by the import job's own error trail, not here
      const baseStockCode = parsed.value.baseCode;
      if (seen.has(baseStockCode)) continue; // one stock item per base code, not per listing
      seen.add(baseStockCode);
      yield {
        baseStockCode,
        name: listing.productName,
        unitCost: Money.zero,
        unitStock: 0,
        sourceRef: listing.sellerStockCode,
      };
    }
  },
};
