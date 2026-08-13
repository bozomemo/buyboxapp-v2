/**
 * `ImportStockItems` (doc 07 §1, §6) — pulls products/costs from the configured
 * `IProductSource` and upserts `stock_items`. Idempotent by `baseStockCode`; `stock_items`
 * itself holds no operator-owned fields (those live in `stock_marketplace_prefs`), so a
 * plain upsert is safe here — no `ensure`/`update` split needed, unlike listings.
 */
import {
  ErpApiProductSource,
  ErpDatabaseProductSource,
  ExcelProductSource,
  ManualProductSource,
  MarketplaceListingProductSource,
  type IProductSource,
  type ProductSourceCode,
} from '@buybox/adapters';
import { eventsRepo, newId, stockRepo } from '@buybox/db';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';

export const IMPORT_STOCK_ITEMS_JOB = 'ImportStockItems';

export const ImportStockItemsPayloadSchema = z.object({
  sourceCode: z.enum(['manual', 'excel', 'marketplaceListing', 'erpDatabase', 'erpApi']),
  sourceConfig: z.unknown(),
});

export type ImportStockItemsPayload = z.infer<typeof ImportStockItemsPayloadSchema>;

const SOURCES: Record<ProductSourceCode, IProductSource> = {
  manual: ManualProductSource,
  excel: ExcelProductSource,
  marketplaceListing: MarketplaceListingProductSource,
  erpDatabase: ErpDatabaseProductSource,
  erpApi: ErpApiProductSource,
};

export async function importStockItems(ctx: JobContext): Promise<JobResult> {
  const payload = ImportStockItemsPayloadSchema.parse(JSON.parse(ctx.payload));
  const source = SOURCES[payload.sourceCode];
  const nowMs = ctx.clock.nowMs();

  let itemsTotal = 0;
  let itemsOk = 0;
  let itemsFailed = 0;

  for await (const item of source.fetch(payload.sourceConfig)) {
    itemsTotal += 1;
    try {
      await stockRepo.upsertStockItem(ctx.appDb, {
        baseStockCode: item.baseStockCode,
        name: item.name,
        unitCost: item.unitCost.toKurus(),
        unitStock: item.unitStock,
        sourceCode: payload.sourceCode,
        sourceRef: item.sourceRef ?? null,
        costUpdatedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      itemsOk += 1;
    } catch (error) {
      itemsFailed += 1;
      await eventsRepo.logEvent(ctx.appDb, {
        id: newId(),
        at: nowMs,
        level: 'warn',
        marketplaceCode: null,
        listingId: null,
        jobRunId: ctx.correlationId,
        code: 'StockItemImportFailed',
        message: `Failed to upsert stock item "${item.baseStockCode}": ${error instanceof Error ? error.message : String(error)}`,
        context: JSON.stringify({ baseStockCode: item.baseStockCode }),
      });
    }
  }

  return { itemsTotal, itemsOk, itemsFailed };
}
