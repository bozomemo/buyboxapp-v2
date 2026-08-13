/**
 * The `Manual` product source (doc 10 §4): the operator adds or edits one stock item at a time
 * in the UI. `fetch()` here is the single-item ingestion path an API route calls after the
 * operator submits the form — not a bulk import.
 */
import { Money } from '@buybox/shared';
import { z } from 'zod';
import type { ConnectionTestResult } from '../ports/marketplace.js';
import type { IProductSource, StockItemInput } from '../ports/product-source.js';

export const ManualEntrySchema = z.object({
  baseStockCode: z.string().min(1),
  name: z.string().min(1),
  /** VAT-exclusive unit cost, entered as a decimal major-unit string, e.g. "42.50". */
  unitCostMajor: z.string().min(1),
  unitStock: z.number().int().min(0),
});

export type ManualEntry = z.infer<typeof ManualEntrySchema>;

export const ManualProductSource: IProductSource = {
  code: 'manual',
  displayName: 'Manuel giriş',
  status: 'available',
  configSchema: ManualEntrySchema,

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: true, detail: 'Manual entry requires no connection' };
  },

  async *fetch(config: unknown): AsyncIterable<StockItemInput> {
    const entry = ManualEntrySchema.parse(config);
    yield {
      baseStockCode: entry.baseStockCode,
      name: entry.name,
      unitCost: Money.fromMajorUnitsString(entry.unitCostMajor),
      unitStock: entry.unitStock,
    };
  },
};
