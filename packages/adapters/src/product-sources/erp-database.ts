/**
 * `ErpDatabase` product source — registered stub (doc 10 §4, doc 12 Phase 4.6). Appears in the
 * UI as "yakında" (coming soon); `fetch()` throws `NotImplementedError`. The config schema is
 * defined now so the setup wizard can render (and disable) the form before the source itself
 * is built.
 */
import { z } from 'zod';
import type { ConnectionTestResult } from '../ports/marketplace.js';
import type { IProductSource } from '../ports/product-source.js';
import { NotImplementedError } from '../ports/product-source.js';

export const ErpDatabaseConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1),
  /** Read from the secret store at connect time — never persisted alongside this config (doc 10 §8). */
  credentialRef: z.string().min(1),
  query: z.string().min(1),
});

export const ErpDatabaseProductSource: IProductSource = {
  code: 'erpDatabase',
  displayName: 'ERP veritabanı (yakında)',
  status: 'comingSoon',
  configSchema: ErpDatabaseConfigSchema,

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: false, error: 'ErpDatabase is not implemented yet' };
  },

  fetch(): AsyncIterable<never> {
    throw new NotImplementedError('erpDatabase');
  },
};
