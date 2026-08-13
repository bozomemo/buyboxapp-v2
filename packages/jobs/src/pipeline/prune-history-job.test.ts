import { eventsRepo, newId } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { Scheduler } from '../scheduler.js';
import { createSqliteTestDb, NOW } from '../test-helpers.js';
import { PRUNE_HISTORY_JOB, pruneHistoryJob } from './prune-history-job.js';

describe('pruneHistoryJob', () => {
  it('applies doc 05 §10 retention (default windows) via the shared pruneHistory', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const oldEventAt = NOW - 200 * 24 * 60 * 60 * 1000; // 200 days ago — past the 90-day info/debug window
      await eventsRepo.logEvent(appDb, {
        id: newId(),
        at: oldEventAt,
        level: 'info',
        marketplaceCode: null,
        listingId: null,
        jobRunId: null,
        code: 'Old',
        message: 'old event',
        context: null,
      });
      await eventsRepo.logEvent(appDb, {
        id: newId(),
        at: NOW,
        level: 'info',
        marketplaceCode: null,
        listingId: null,
        jobRunId: null,
        code: 'Recent',
        message: 'recent event',
        context: null,
      });

      const clock = new FakeClock(NOW);
      const scheduler = new Scheduler({ appDb, clock, adapters: new Map(), instanceId: 'test' });
      scheduler.register({ jobName: PRUNE_HISTORY_JOB, handler: pruneHistoryJob });
      await scheduler.enqueueNow(PRUNE_HISTORY_JOB, '{}');
      const tick = await scheduler.tick();
      expect(tick.ran).toEqual([{ jobName: PRUNE_HISTORY_JOB, ok: true }]);

      const remaining = await eventsRepo.listRecentEvents(appDb, 10);
      expect(remaining.map((e) => e.code)).toEqual(['Recent']);
    } finally {
      cleanup();
    }
  });
});
