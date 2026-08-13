import { stockRepo } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { Scheduler } from '../scheduler.js';
import { createSqliteTestDb, NOW } from '../test-helpers.js';
import { IMPORT_BUNDLES_JOB, importBundles } from './import-bundles.js';

describe('importBundles', () => {
  it('rebuilds a bundle definition via replaceBundle', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await stockRepo.upsertStockItem(appDb, {
        baseStockCode: 'A',
        name: 'A',
        unitCost: 100n,
        unitStock: 10,
        sourceCode: 'manual',
        sourceRef: null,
        costUpdatedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });

      const clock = new FakeClock(NOW);
      const scheduler = new Scheduler({ appDb, clock, adapters: new Map(), instanceId: 'test' });
      scheduler.register({ jobName: IMPORT_BUNDLES_JOB, handler: importBundles });
      await scheduler.enqueueNow(
        IMPORT_BUNDLES_JOB,
        JSON.stringify({
          bundles: [
            { bundleStockCode: 'A-k2', name: 'Twin pack', members: [{ memberStockCode: 'A', quantity: 2 }] },
          ],
        }),
      );
      const tick = await scheduler.tick();
      expect(tick.ran).toEqual([{ jobName: IMPORT_BUNDLES_JOB, ok: true }]);

      const members = await stockRepo.getBundleMembers(appDb, 'A-k2');
      expect(members).toEqual([{ memberStockCode: 'A', quantity: 2 }]);
    } finally {
      cleanup();
    }
  });
});
