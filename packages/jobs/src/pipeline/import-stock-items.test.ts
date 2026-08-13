import { stockRepo } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { Scheduler } from '../scheduler.js';
import { createSqliteTestDb } from '../test-helpers.js';
import { IMPORT_STOCK_ITEMS_JOB, importStockItems } from './import-stock-items.js';

describe('importStockItems', () => {
  it('upserts from the Manual source, idempotent by baseStockCode', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const clock = new FakeClock(1000);
      const scheduler = new Scheduler({ appDb, clock, adapters: new Map(), instanceId: 'test' });
      scheduler.register({ jobName: IMPORT_STOCK_ITEMS_JOB, handler: importStockItems });

      await scheduler.enqueueNow(
        IMPORT_STOCK_ITEMS_JOB,
        JSON.stringify({
          sourceCode: 'manual',
          sourceConfig: { baseStockCode: 'ABC', name: 'Widget', unitCostMajor: '10.00', unitStock: 5 },
        }),
      );
      const tick = await scheduler.tick();
      expect(tick.ran).toEqual([{ jobName: IMPORT_STOCK_ITEMS_JOB, ok: true }]);

      const item = await stockRepo.getStockItem(appDb, 'ABC');
      expect(item?.unitCost).toBe(1000n);
      expect(item?.unitStock).toBe(5);
      expect(item?.sourceCode).toBe('manual');
    } finally {
      cleanup();
    }
  });
});
