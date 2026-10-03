import { configRepo, DEFAULT_RETENTION_WINDOWS, eventsRepo, newId, type AppDatabase } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { Scheduler } from '../scheduler.js';
import { createSqliteTestDb, NOW } from '../test-helpers.js';
import {
  PRUNE_HISTORY_JOB,
  RETENTION_WINDOWS_SETTING_KEY,
  pruneHistoryJob,
  readRetentionWindowsSetting,
} from './prune-history-job.js';

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

  // The case that went wrong in production: the nightly run is enqueued with '{}', and the
  // windows the operator saved on Settings > Retention were never read.
  describe('which windows apply', () => {
    const DAY = 24 * 60 * 60 * 1000;

    async function logInfoEvent(appDb: AppDatabase, code: string, ageDays: number): Promise<void> {
      await eventsRepo.logEvent(appDb, {
        id: newId(),
        at: NOW - ageDays * DAY,
        level: 'info',
        marketplaceCode: null,
        listingId: null,
        jobRunId: null,
        code,
        message: code,
        context: null,
      });
    }

    async function storeSetting(appDb: AppDatabase, value: string): Promise<void> {
      await configRepo.setAppSetting(
        appDb,
        { key: RETENTION_WINDOWS_SETTING_KEY, value, updatedBy: 'test', updatedAt: NOW },
        newId(),
      );
    }

    async function runNightly(appDb: AppDatabase, payload = '{}'): Promise<string[]> {
      const scheduler = new Scheduler({ appDb, clock: new FakeClock(NOW), adapters: new Map(), instanceId: 'test' });
      scheduler.register({ jobName: PRUNE_HISTORY_JOB, handler: pruneHistoryJob });
      await scheduler.enqueueNow(PRUNE_HISTORY_JOB, payload);
      const tick = await scheduler.tick();
      expect(tick.ran).toEqual([{ jobName: PRUNE_HISTORY_JOB, ok: true }]);
      return (await eventsRepo.listRecentEvents(appDb, 50)).map((e) => e.code).sort();
    }

    it.each([
      {
        name: 'no setting stored: the defaults (info/debug 3 days)',
        setting: undefined,
        payload: '{}',
        kept: ['Day1'],
      },
      {
        name: 'a stored setting is applied to the nightly run',
        setting: { ...DEFAULT_RETENTION_WINDOWS, appEventsInfoDebugDays: 10 },
        payload: '{}',
        kept: ['Day1', 'Day5'],
      },
      {
        name: 'windows in the payload win over the stored setting',
        setting: { ...DEFAULT_RETENTION_WINDOWS, appEventsInfoDebugDays: 10 },
        payload: JSON.stringify({ windows: { ...DEFAULT_RETENTION_WINDOWS, appEventsInfoDebugDays: 30 } }),
        kept: ['Day1', 'Day20', 'Day5'],
      },
    ])('$name', async ({ setting, payload, kept }) => {
      const { appDb, cleanup } = await createSqliteTestDb();
      try {
        for (const days of [1, 5, 20]) await logInfoEvent(appDb, `Day${days}`, days);
        if (setting) await storeSetting(appDb, JSON.stringify(setting));
        expect(await runNightly(appDb, payload)).toEqual(kept);
      } finally {
        cleanup();
      }
    });

    it('gives a window missing from an older stored setting its default, not NaN', async () => {
      const { appDb, cleanup } = await createSqliteTestDb();
      try {
        const { authEventsDays: _omitted, trackedProductMetricsDays: _alsoOmitted, ...older } = DEFAULT_RETENTION_WINDOWS;
        await storeSetting(appDb, JSON.stringify({ ...older, buyboxObservationsDays: 30 }));
        expect(await readRetentionWindowsSetting(appDb, NOW)).toEqual({
          ...DEFAULT_RETENTION_WINDOWS,
          buyboxObservationsDays: 30,
        });
      } finally {
        cleanup();
      }
    });

    it.each([
      { name: 'not JSON', value: '{oops' },
      { name: 'an invalid window', value: JSON.stringify({ ...DEFAULT_RETENTION_WINDOWS, jobRunsDays: 0 }) },
    ])('falls back to the defaults, and says so, when the stored setting is $name', async ({ value }) => {
      const { appDb, cleanup } = await createSqliteTestDb();
      try {
        await storeSetting(appDb, value);
        expect(await readRetentionWindowsSetting(appDb, NOW)).toBeUndefined();
        const events = await eventsRepo.listRecentEvents(appDb, 10);
        expect(events.map((e) => [e.code, e.level])).toContainEqual(['RetentionSettingInvalid', 'warn']);
      } finally {
        cleanup();
      }
    });
  });
});
