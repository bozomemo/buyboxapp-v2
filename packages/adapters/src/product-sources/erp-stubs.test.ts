import { describe, expect, it } from 'vitest';
import { runProductSourceContractChecks } from '../contract/product-source-contract.js';
import { NotImplementedError } from '../ports/product-source.js';
import { ErpApiProductSource } from './erp-api.js';
import { ErpDatabaseProductSource } from './erp-database.js';

describe.each([
  ['ErpDatabase', ErpDatabaseProductSource],
  ['ErpApi', ErpApiProductSource],
])('%s (registered stub, doc 12 Phase 4.6)', (_name, source) => {
  it('is registered as comingSoon with a defined config schema', async () => {
    expect(source.status).toBe('comingSoon');
    await expect(runProductSourceContractChecks(source)).resolves.toBeUndefined();
  });

  it('testConnection reports not-implemented rather than throwing', async () => {
    const result = await source.testConnection?.({});
    expect(result?.ok).toBe(false);
  });

  it('fetch() throws NotImplementedError', () => {
    expect(() => {
      const iterable = source.fetch({});
      // The stub throws synchronously on call, before any iteration.
      void iterable;
    }).toThrow(NotImplementedError);
  });
});
