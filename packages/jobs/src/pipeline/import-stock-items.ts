/**
 * `ImportStockItems` (doc 07 §1, §6) — pulls products/costs from the configured
 * `IProductSource` and writes `stock_items`. Idempotent by `baseStockCode`.
 *
 * Two writes, chosen by source (`COST_BEARING_SOURCE_CODES`): a plain upsert where the source
 * carries a real cost, and `ensureStockItem` — which leaves `unitCost` alone — where it does
 * not. Most of `stock_items` is safe to overwrite because the operator's own fields live on
 * `stock_marketplace_prefs`, but unit cost is the exception: it can be operator-entered, and it
 * is what doc 02's floor price is computed from.
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
import { configRepo, eventsRepo, newId, stockRepo, type AppDatabase } from '@buybox/db';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';

export const IMPORT_STOCK_ITEMS_JOB = 'ImportStockItems';

/** `app_settings` key the setup wizard (doc 12 6.2 step 6) writes the chosen source to. */
export const PRODUCT_SOURCE_CONFIG_SETTING_KEY = 'productSource.config';

export const ImportStockItemsPayloadSchema = z.object({
  sourceCode: z.enum(['manual', 'excel', 'marketplaceListing', 'erpDatabase', 'erpApi']),
  sourceConfig: z.unknown(),
});

export type ImportStockItemsPayload = z.infer<typeof ImportStockItemsPayloadSchema>;

/**
 * Sources this job can actually pull a *set* of stock items from.
 *
 * `manual` is deliberately absent. Doc 10 §4 defines it as "operator adds or edits a stock item
 * in the UI, one at a time" — there is no batch behind it to pull, and the operator's entry goes
 * straight to `stock_items` through `/api/stock`, never through here. Running the job for it
 * anyway means handing `ManualProductSource.fetch` the stored `sourceConfig` — `{}` on every
 * real install — which fails its single-entry schema. Measured 2026-08-29 on the operator's
 * install: the daily cadence had been failing on exactly that, once a day, since setup, and the
 * Stock screen's "import from the configured source" button failed the same way.
 */
export const BULK_IMPORT_SOURCE_CODES: readonly ProductSourceCode[] = [
  'excel',
  'marketplaceListing',
  'erpDatabase',
  'erpApi',
];

/**
 * Sources whose `unitCost` is real data. `marketplaceListing` is absent because it says so
 * itself: it derives stock items from listings, has no cost to give, and emits `Money.zero`
 * (doc 10 §4 — "cost must then be supplied manually or by another source"). Written through a
 * plain upsert that zero lands on top of whatever the operator entered, and unit cost is what
 * the floor price is computed from — so those runs go through `ensureStockItem` instead, which
 * refreshes the descriptive fields and leaves cost alone.
 */
export const COST_BEARING_SOURCE_CODES: readonly ProductSourceCode[] = [
  'manual',
  'excel',
  'erpDatabase',
  'erpApi',
];

/** Whether a scheduled or "run now" import has anything to do for this source. */
export function isBulkImportSource(sourceCode: ProductSourceCode): boolean {
  return BULK_IMPORT_SOURCE_CODES.includes(sourceCode);
}

/**
 * The payload a scheduled or manually triggered run must carry, read from the source the setup
 * wizard stored — or `null` when there is nothing to run: no source configured yet (wizard step
 * 6 not completed) or one with no batch behind it (`isBulkImportSource`).
 *
 * The worker's ticker and the Jobs screen's "run now" both go through this, so the payload the
 * operator triggers by hand is the same one the cadence fires. `JOB_CATALOG`'s empty
 * `defaultPayload` used to be sent verbatim by "run now", which failed the schema outright —
 * this job is the one catalogue entry whose payload cannot be a compiled-in constant.
 */
export async function resolveImportStockItemsPayload(
  appDb: AppDatabase,
): Promise<ImportStockItemsPayload | null> {
  const configured = await configRepo.getAppSetting(appDb, PRODUCT_SOURCE_CONFIG_SETTING_KEY);
  if (!configured) return null;
  const parsed = ImportStockItemsPayloadSchema.safeParse(JSON.parse(configured.value));
  if (!parsed.success) return null;
  if (!isBulkImportSource(parsed.data.sourceCode)) return null;
  return parsed.data;
}

const SOURCES: Record<ProductSourceCode, IProductSource> = {
  manual: ManualProductSource,
  excel: ExcelProductSource,
  marketplaceListing: MarketplaceListingProductSource,
  erpDatabase: ErpDatabaseProductSource,
  erpApi: ErpApiProductSource,
};

export async function importStockItems(ctx: JobContext): Promise<JobResult> {
  const payload = ImportStockItemsPayloadSchema.parse(JSON.parse(ctx.payload));
  const nowMs = ctx.clock.nowMs();

  // Nothing to pull, and that is a normal configuration rather than a failure — see
  // `BULK_IMPORT_SOURCE_CODES`. Recorded as an event so a run of zeros in the history says why.
  if (!isBulkImportSource(payload.sourceCode)) {
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: nowMs,
      level: 'info',
      marketplaceCode: null,
      listingId: null,
      jobRunId: ctx.correlationId,
      code: 'StockImportNotApplicable',
      message: `"${payload.sourceCode}" kaynağında toplu içe aktarma yoktur; stok kalemleri tek tek girilir.`,
      context: JSON.stringify({ sourceCode: payload.sourceCode }),
    });
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }

  const source = SOURCES[payload.sourceCode];
  const write = COST_BEARING_SOURCE_CODES.includes(payload.sourceCode)
    ? stockRepo.upsertStockItem
    : stockRepo.ensureStockItem;

  let itemsTotal = 0;
  let itemsOk = 0;
  let itemsFailed = 0;

  for await (const item of source.fetch(payload.sourceConfig)) {
    itemsTotal += 1;
    try {
      await write(ctx.appDb, {
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
