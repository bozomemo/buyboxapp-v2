import { configRepo, eventsRepo, newId, stockRepo } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { Scheduler } from '../scheduler.js';
import { createSqliteTestDb } from '../test-helpers.js';
import {
  IMPORT_STOCK_ITEMS_JOB,
  PRODUCT_SOURCE_CONFIG_SETTING_KEY,
  importStockItems,
  isBulkImportSource,
  resolveImportStockItemsPayload,
} from './import-stock-items.js';

const LISTINGS = {
  listings: [{ sellerStockCode: 'ABC', productName: 'Widget' }],
};

async function runJob(appDb: Parameters<typeof importStockItems>[0]['appDb'], payload: unknown) {
  const scheduler = new Scheduler({
    appDb,
    clock: new FakeClock(1000),
    adapters: new Map(),
    instanceId: 'test',
  });
  scheduler.register({ jobName: IMPORT_STOCK_ITEMS_JOB, handler: importStockItems });
  await scheduler.enqueueNow(IMPORT_STOCK_ITEMS_JOB, JSON.stringify(payload));
  return scheduler.tick();
}

describe('importStockItems', () => {
  it('imports a set from a bulk source', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const tick = await runJob(appDb, { sourceCode: 'marketplaceListing', sourceConfig: LISTINGS });
      expect(tick.ran).toEqual([{ jobName: IMPORT_STOCK_ITEMS_JOB, ok: true }]);

      const item = await stockRepo.getStockItem(appDb, 'ABC');
      expect(item?.name).toBe('Widget');
      expect(item?.sourceCode).toBe('marketplaceListing');
    } finally {
      cleanup();
    }
  });

  // doc 10 §4: MarketplaceListing has no cost to give and emits zero. Before this, a second
  // import reset an operator's entered cost to 0 — the value doc 02's floor price is built on.
  it('never writes a cost-less source over an established unit cost', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await stockRepo.upsertStockItem(appDb, {
        baseStockCode: 'ABC',
        name: 'Widget',
        unitCost: 4250n,
        unitStock: 3,
        sourceCode: 'manual',
        sourceRef: null,
        costUpdatedAt: 500,
        createdAt: 500,
        updatedAt: 500,
      });

      await runJob(appDb, { sourceCode: 'marketplaceListing', sourceConfig: LISTINGS });

      const item = await stockRepo.getStockItem(appDb, 'ABC');
      expect(item?.unitCost).toBe(4250n);
      expect(item?.costUpdatedAt).toBe(500);
      // The descriptive half is still refreshed.
      expect(item?.name).toBe('Widget');
    } finally {
      cleanup();
    }
  });

  // The manual source is a single UI entry (doc 10 §4), not a batch: the stored `sourceConfig`
  // is `{}` and running the job on it used to fail the schema, once a day, for ever.
  it('completes as a no-op for a source with no batch behind it', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const tick = await runJob(appDb, { sourceCode: 'manual', sourceConfig: {} });
      expect(tick.ran).toEqual([{ jobName: IMPORT_STOCK_ITEMS_JOB, ok: true }]);

      const events = await eventsRepo.listRecentEvents(appDb, 10);
      expect(events.map((e) => e.code)).toContain('StockImportNotApplicable');
    } finally {
      cleanup();
    }
  });

  it('knows which sources a scheduled run can pull from', () => {
    expect(isBulkImportSource('manual')).toBe(false);
    expect(isBulkImportSource('excel')).toBe(true);
    expect(isBulkImportSource('marketplaceListing')).toBe(true);
  });
});

describe('resolveImportStockItemsPayload', () => {
  async function storeSource(
    appDb: Parameters<typeof resolveImportStockItemsPayload>[0],
    value: unknown,
  ) {
    await configRepo.setAppSetting(
      appDb,
      {
        key: PRODUCT_SOURCE_CONFIG_SETTING_KEY,
        value: JSON.stringify(value),
        updatedBy: 'test',
        updatedAt: 1000,
      },
      newId(),
    );
  }

  it('is null before the wizard has stored a source', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      expect(await resolveImportStockItemsPayload(appDb)).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('is null for a source with nothing to pull', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await storeSource(appDb, { sourceCode: 'manual', sourceConfig: {} });
      expect(await resolveImportStockItemsPayload(appDb)).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('returns the stored source for a bulk one', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await storeSource(appDb, { sourceCode: 'marketplaceListing', sourceConfig: LISTINGS });
      expect(await resolveImportStockItemsPayload(appDb)).toEqual({
        sourceCode: 'marketplaceListing',
        sourceConfig: LISTINGS,
      });
    } finally {
      cleanup();
    }
  });
});
