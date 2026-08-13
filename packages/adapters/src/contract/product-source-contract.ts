/**
 * The shared contract every `IProductSource` must pass (doc 12 Phase 4.5, doc 10 §4). Throws on
 * the first violation, like `marketplace-contract.ts` — no test-runner dependency.
 */
import type { IProductSource, StockItemInput } from '../ports/product-source.js';

const VALID_CODES = new Set(['manual', 'excel', 'marketplaceListing', 'erpDatabase', 'erpApi']);
const VALID_STATUSES = new Set(['available', 'comingSoon']);

function assertValidStockItemInput(item: StockItemInput, index: number): void {
  if (!item.baseStockCode.trim()) {
    throw new Error(`contract violation: fetch() item ${index} has an empty baseStockCode`);
  }
  if (!item.name.trim()) {
    throw new Error(`contract violation: fetch() item ${index} has an empty name`);
  }
  if (typeof item.unitCost !== 'object' || typeof item.unitCost.toKurus !== 'function') {
    throw new Error(`contract violation: fetch() item ${index}'s unitCost is not a Money instance`);
  }
  if (item.unitCost.isNegative()) {
    throw new Error(`contract violation: fetch() item ${index} has a negative unitCost`);
  }
  if (!Number.isInteger(item.unitStock) || item.unitStock < 0) {
    throw new Error(`contract violation: fetch() item ${index}'s unitStock must be a non-negative integer`);
  }
}

function assertValidShape(source: IProductSource): void {
  if (!VALID_CODES.has(source.code)) {
    throw new Error(`contract violation: unknown product source code "${source.code}"`);
  }
  if (!VALID_STATUSES.has(source.status)) {
    throw new Error(`contract violation: status must be "available" or "comingSoon", got "${source.status}"`);
  }
  if (!source.displayName.trim()) {
    throw new Error('contract violation: displayName must not be empty');
  }
  if (!source.configSchema || typeof source.configSchema.safeParse !== 'function') {
    throw new Error('contract violation: configSchema must be a Zod schema (drives the wizard UI form)');
  }
}

export interface ProductSourceContractFixture {
  /** A config value expected to satisfy `configSchema`. Omit for `comingSoon` sources. */
  readonly validConfig?: unknown;
}

/**
 * Runs the shape checks always. For an `available` source, also drains `fetch()` against
 * `fixture.validConfig` and validates every yielded item. `comingSoon` sources are only checked
 * for shape — their `fetch()` is expected to throw `NotImplementedError`, asserted separately.
 */
export async function runProductSourceContractChecks(
  source: IProductSource,
  fixture: ProductSourceContractFixture = {},
): Promise<void> {
  assertValidShape(source);

  if (source.status !== 'available') return;

  if (fixture.validConfig === undefined) {
    throw new Error(
      'contract violation: an "available" source requires fixture.validConfig to exercise fetch()',
    );
  }
  const parsed = source.configSchema.safeParse(fixture.validConfig);
  if (!parsed.success) {
    throw new Error(
      `contract violation: fixture.validConfig does not satisfy configSchema: ${parsed.error.message}`,
    );
  }

  let index = 0;
  for await (const item of source.fetch(fixture.validConfig)) {
    assertValidStockItemInput(item, index);
    index += 1;
  }
}
