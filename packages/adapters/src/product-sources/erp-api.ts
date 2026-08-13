/**
 * `ErpApi` product source — registered stub (doc 10 §4, doc 12 Phase 4.6). Same treatment as
 * `ErpDatabase` but over HTTP.
 */
import { z } from 'zod';
import type { ConnectionTestResult } from '../ports/marketplace.js';
import type { IProductSource } from '../ports/product-source.js';
import { NotImplementedError } from '../ports/product-source.js';

export const ErpApiConfigSchema = z.object({
  baseUrl: z.string().url(),
  credentialRef: z.string().min(1),
});

export const ErpApiProductSource: IProductSource = {
  code: 'erpApi',
  displayName: 'ERP API (yakında)',
  status: 'comingSoon',
  configSchema: ErpApiConfigSchema,

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: false, error: 'ErpApi is not implemented yet' };
  },

  fetch(): AsyncIterable<never> {
    throw new NotImplementedError('erpApi');
  },
};
