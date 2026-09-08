/**
 * The metrics reads (doc 16 §3), across all three dialects.
 *
 * These tests exist to prove the **SQL runs and selects the right rows** — the arithmetic they
 * feed is tested separately and without a database in `apps/web/src/lib/server/metrics.test.ts`.
 * All three engines are exercised because the queries here lean on the parts that genuinely
 * differ between them: `count(*)`'s return type (a number on SQLite, a string on Postgres), a
 * `GROUP BY` on a text column, and an ordered `LIMIT 1` over a `bigint` timestamp column.
 *
 * The `count(*)` point is the reason this file is worth its runtime. A count arriving as the
 * string `"7"` renders as `7` in the Prometheus payload and looks perfectly correct, then sorts
 * and compares as a string in every dashboard and alert built on top of it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as configRepo from './config.js';
import * as eventsRepo from './events.js';
import * as jobsRepo from './jobs.js';
import * as metricsRepo from './metrics.js';
import * as repricingRepo from './repricing.js';

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

async function seedMarketplaces(appDb: AppDatabase): Promise<void> {
  for (const [code, name] of [
    ['TY', 'Trendyol'],
    ['HB', 'Hepsiburada'],
  ] as const) {
    await configRepo.upsertMarketplace(appDb, {
      code,
      displayName: name,
      enabled: true,
      merchantRef: `merchant-${code}`,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
}

interface RunSpec {
  readonly jobName: string;
  readonly startedAt: number;
  readonly finishedAt?: number | null;
  readonly state?: string;
  readonly itemsOk?: number;
  readonly itemsFailed?: number;
}

async function insertRun(appDb: AppDatabase, spec: RunSpec): Promise<string> {
  const id = newId();
  await jobsRepo.startJobRun(appDb, {
    id,
    jobName: spec.jobName,
    startedAt: spec.startedAt,
    finishedAt: null,
    state: spec.state ?? 'running',
    itemsTotal: 0,
    itemsOk: 0,
    itemsFailed: 0,
    error: null,
    correlationId: newId(),
    jobQueueId: null,
    itemsDone: 0,
    currentItem: null,
    progressAt: null,
  });
  if (spec.finishedAt !== undefined && spec.finishedAt !== null) {
    await jobsRepo.finishJobRun(appDb, id, {
      finishedAt: spec.finishedAt,
      state: spec.state ?? 'succeeded',
      itemsTotal: (spec.itemsOk ?? 0) + (spec.itemsFailed ?? 0),
      itemsOk: spec.itemsOk ?? 0,
      itemsFailed: spec.itemsFailed ?? 0,
      error: null,
    });
  }
  return id;
}

for (const dialect of ALL_DIALECTS) {
  describe(`metrics repository (${dialect})`, () => {
    let db: TestDb | undefined;

    // 30s rather than vitest's 5s default, matching the other three-dialect suites here: a
    // MySQL test database is created and fully migrated per test, which alone exceeds the
    // default. A timeout that fires on setup cost reports a working query as a broken one.
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    async function fresh(): Promise<AppDatabase> {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      return db.appDb;
    }

    it('returns nothing at all from an empty database rather than failing', async () => {
      const appDb = await fresh();
      expect(await metricsRepo.listJobRunsSince(appDb, NOW - HOUR)).toEqual([]);
      expect(await metricsRepo.countRunningJobRunsByName(appDb)).toEqual([]);
      expect(await metricsRepo.countQueueByState(appDb)).toEqual([]);
      expect(await metricsRepo.oldestReadyQueueRunAfter(appDb, NOW)).toBeUndefined();
      expect(await metricsRepo.countEventsByLevelSince(appDb, NOW - HOUR)).toEqual([]);
      expect(await metricsRepo.lastProblemEventAt(appDb, NOW - HOUR)).toBeUndefined();
      expect(await metricsRepo.listBudgetUsageForDate(appDb, '2026-09-08')).toEqual([]);
    }, 30_000);

    it('bounds job runs by start time, keeping an unfinished run inside the window', async () => {
      const appDb = await fresh();
      await insertRun(appDb, {
        jobName: 'Old',
        startedAt: NOW - 3 * HOUR,
        finishedAt: NOW - 3 * HOUR + 1000,
      });
      await insertRun(appDb, {
        jobName: 'Recent',
        startedAt: NOW - 10 * 60_000,
        finishedAt: NOW - 9 * 60_000,
        itemsOk: 4,
        itemsFailed: 1,
      });
      await insertRun(appDb, { jobName: 'StillGoing', startedAt: NOW - 5 * 60_000 });

      const rows = await metricsRepo.listJobRunsSince(appDb, NOW - HOUR);
      const names = rows.map((r) => r.jobName).sort();
      expect(names).toEqual(['Recent', 'StillGoing']);

      // A run in flight must survive the window filter: it is the one worth seeing.
      const inFlight = rows.find((r) => r.jobName === 'StillGoing');
      expect(inFlight?.finishedAt).toBeNull();

      const finished = rows.find((r) => r.jobName === 'Recent');
      expect(finished?.itemsOk).toBe(4);
      expect(finished?.itemsFailed).toBe(1);
      expect(finished?.state).toBe('succeeded');
    }, 30_000);

    it('counts running runs by name as real numbers, ignoring the time window', async () => {
      const appDb = await fresh();
      // Deliberately started long before any window this endpoint uses.
      await insertRun(appDb, { jobName: 'Stuck', startedAt: NOW - 8 * HOUR });
      await insertRun(appDb, { jobName: 'Stuck', startedAt: NOW - 60_000 });
      await insertRun(appDb, { jobName: 'Done', startedAt: NOW - 60_000, finishedAt: NOW });

      const counts = await metricsRepo.countRunningJobRunsByName(appDb);
      expect(counts).toEqual([{ key: 'Stuck', count: 2 }]);
      // The point of the whole exercise: a driver-supplied string here would pass a loose
      // equality check and then behave as a string everywhere downstream.
      expect(typeof counts[0]?.count).toBe('number');
    }, 30_000);

    it('counts queue depth per state and finds the oldest overdue ready item', async () => {
      const appDb = await fresh();
      await jobsRepo.enqueueJob(appDb, {
        id: newId(),
        jobName: 'A',
        payload: '{}',
        priority: 1,
        state: 'ready',
        runAfter: NOW - 5 * 60_000,
        lockedBy: null,
        lockedUntil: null,
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await jobsRepo.enqueueJob(appDb, {
        id: newId(),
        jobName: 'B',
        payload: '{}',
        priority: 1,
        state: 'ready',
        runAfter: NOW - 20 * 60_000,
        lockedBy: null,
        lockedUntil: null,
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
      // Scheduled for the future: it is not overdue and must not count as staleness.
      await jobsRepo.enqueueJob(appDb, {
        id: newId(),
        jobName: 'C',
        payload: '{}',
        priority: 1,
        state: 'ready',
        runAfter: NOW + 6 * HOUR,
        lockedBy: null,
        lockedUntil: null,
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        createdAt: NOW,
        updatedAt: NOW,
      });

      const byState = await metricsRepo.countQueueByState(appDb);
      expect(byState).toEqual([{ key: 'ready', count: 3 }]);

      expect(await metricsRepo.oldestReadyQueueRunAfter(appDb, NOW)).toBe(NOW - 20 * 60_000);
    }, 30_000);

    it('reports no staleness when every ready item is scheduled for the future', async () => {
      const appDb = await fresh();
      await jobsRepo.enqueueJob(appDb, {
        id: newId(),
        jobName: 'Later',
        payload: '{}',
        priority: 1,
        state: 'ready',
        runAfter: NOW + HOUR,
        lockedBy: null,
        lockedUntil: null,
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(await metricsRepo.oldestReadyQueueRunAfter(appDb, NOW)).toBeUndefined();
    }, 30_000);

    it('counts events by level within the window and finds the last warn/error', async () => {
      const appDb = await fresh();
      const write = async (level: 'debug' | 'info' | 'warn' | 'error', at: number): Promise<void> => {
        await eventsRepo.logEvent(appDb, {
          id: newId(),
          at,
          level,
          marketplaceCode: null,
          listingId: null,
          jobRunId: null,
          code: 'Test',
          message: `${level} at ${at}`,
          context: null,
        });
      };
      await write('info', NOW - 30 * 60_000);
      await write('info', NOW - 20 * 60_000);
      await write('warn', NOW - 15 * 60_000);
      await write('error', NOW - 4 * 60_000);
      await write('error', NOW - 3 * HOUR); // outside the window

      const counts = await metricsRepo.countEventsByLevelSince(appDb, NOW - HOUR);
      const asMap = new Map(counts.map((c) => [c.key, c.count]));
      expect(asMap.get('info')).toBe(2);
      expect(asMap.get('warn')).toBe(1);
      expect(asMap.get('error')).toBe(1);
      expect(asMap.has('debug')).toBe(false);

      // The most recent problem, not the most recent event and not the oldest problem.
      expect(await metricsRepo.lastProblemEventAt(appDb, NOW - HOUR)).toBe(NOW - 4 * 60_000);
    }, 30_000);

    it('ignores info and debug when looking for the last problem', async () => {
      const appDb = await fresh();
      await eventsRepo.logEvent(appDb, {
        id: newId(),
        at: NOW - 60_000,
        level: 'info',
        marketplaceCode: null,
        listingId: null,
        jobRunId: null,
        code: 'Test',
        message: 'nothing wrong',
        context: null,
      });
      expect(await metricsRepo.lastProblemEventAt(appDb, NOW - HOUR)).toBeUndefined();
    }, 30_000);

    it('reads budget usage for exactly the requested day', async () => {
      const appDb = await fresh();
      await repricingRepo.incrementBudgetUsage(appDb, 'TY', '2026-09-08', 500);
      await repricingRepo.incrementBudgetUsage(appDb, 'TY', '2026-09-08', 500);
      await repricingRepo.incrementBudgetUsage(appDb, 'HB', '2026-09-08', 300);
      await repricingRepo.incrementBudgetUsage(appDb, 'TY', '2026-09-07', 500);

      const rows = await metricsRepo.listBudgetUsageForDate(appDb, '2026-09-08');
      const byCode = new Map(rows.map((r) => [r.marketplaceCode, r]));
      expect(rows).toHaveLength(2);
      expect(byCode.get('TY')?.consumed).toBe(2);
      expect(byCode.get('TY')?.allowance).toBe(500);
      expect(byCode.get('HB')?.consumed).toBe(1);
    }, 30_000);
  });
}
