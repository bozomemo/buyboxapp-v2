/**
 * The product-ingestion port (docs/10-target-architecture.md §4). Products enter the system
 * through a pluggable source — a first-class requirement, not an import script.
 */
import type { Money } from '@buybox/shared';
import type { ZodType } from 'zod';
import type { ConnectionTestResult } from './marketplace.js';

export type ProductSourceCode = 'manual' | 'excel' | 'marketplaceListing' | 'erpDatabase' | 'erpApi';

export interface StockItemInput {
  readonly baseStockCode: string;
  readonly name: string;
  readonly unitCost: Money; // VAT-exclusive
  readonly unitStock: number;
  readonly sourceRef?: string;
}

export interface IProductSource {
  readonly code: ProductSourceCode;
  readonly displayName: string;
  readonly status: 'available' | 'comingSoon';
  /** Drives the setup-wizard form automatically (doc 10 §6 step 6). */
  readonly configSchema: ZodType;

  testConnection?(config: unknown): Promise<ConnectionTestResult>;
  fetch(config: unknown): AsyncIterable<StockItemInput>;
}

/** Thrown by `comingSoon` sources (doc 12 4.6) — never called from a reachable UI path. */
export class NotImplementedError extends Error {
  constructor(sourceCode: ProductSourceCode) {
    super(`${sourceCode}: not implemented — registered as "coming soon"`);
    this.name = 'NotImplementedError';
  }
}
