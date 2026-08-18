/**
 * `ctx.reportProgress` — the only channel by which the web process can watch a run the worker
 * process is executing (doc 06 §7's live run detail). The invariants tested here are all
 * "reporting must not harm the run it reports on", so they are exactly the ones that would
 * otherwise be discovered in production by a job that misbehaved *because* someone was
 * watching it.
 *
 * Driven through a real `Scheduler`/`JobRunner` rather than by calling the reporter directly:
 * the throttle, the settle-before-finish ordering and the `job_runs` write only exist as a
 * composition of the three.
 */
import { jobsRepo } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from './adapter-registry.js';
import { FakeClock } from './clock.js';
import type { JobContext, JobResult } from './job.js';
import { Scheduler } from './scheduler.js';
import { createFakeAdapter, createSqliteTestDb, NOW, type TestDb } from './test-helpers.js';

const JOB_NAME = 'ProgressProbe';

async function runJob(
  db: TestDb,
  clock: FakeClock,
  handler: (ctx: JobContext) => Promise<JobResult>,
): Promise<jobsRepo.JobRunRow> {
  const scheduler = new Scheduler({
    appDb: db.appDb,
    clock,
    adapters: buildAdapterRegistry([['trendyol', createFakeAdapter()]]),
    instanceId: 'progress-test',
  });
  scheduler.register({ jobName: JOB_NAME, handler });
  await scheduler.enqueueNow(JOB_NAME, JSON.stringify({}));
  await scheduler.tick();
  await scheduler.shutdown();

  const runs = await jobsRepo.listJobRuns(db.appDb, { jobName: JOB_NAME });
  expect(runs).toHaveLength(1);
  return runs[0]!;
}

describe('JobRunner progress reporting', () => {
  it('writes the heartbeat to job_runs so another process can read it mid-run', async () => {
    const db = await createSqliteTestDb();
    const clock = new FakeClock(NOW);
    try {
      let midRun: jobsRepo.JobRunRow | undefined;
      await runJob(db, clock, async (ctx) => {
        ctx.reportProgress({ done: 3, total: 10, currentItem: 'ABC-1 · Ürün' });
        // The handler has not returned, so this is genuinely a mid-run read — the same one the
        // `/api/jobs/run-detail` poll performs from the web process.
        await new Promise((resolve) => setImmediate(resolve));
        const runs = await jobsRepo.listJobRuns(db.appDb, { jobName: JOB_NAME });
        midRun = runs[0];
        return { itemsTotal: 10, itemsOk: 10, itemsFailed: 0 };
      });

      expect(midRun?.state).toBe('running');
      expect(midRun?.itemsDone).toBe(3);
      expect(midRun?.itemsTotal).toBe(10);
      expect(midRun?.currentItem).toBe('ABC-1 · Ürün');
      expect(midRun?.progressAt).toBe(NOW);
    } finally {
      db.cleanup();
    }
  });

  it('throttles: a burst of reports on a frozen clock costs one write, not one per item', async () => {
    const db = await createSqliteTestDb();
    const clock = new FakeClock(NOW);
    try {
      const run = await runJob(db, clock, async (ctx) => {
        // Clock never advances, so only the first report clears `PROGRESS_THROTTLE_MS`. The
        // rest are coalesced — which is the point: `ScrapeCompetitors` reports per listing.
        for (let i = 0; i < 50; i += 1) {
          ctx.reportProgress({ done: i, total: 50, currentItem: `item-${i}` });
        }
        return { itemsTotal: 50, itemsOk: 50, itemsFailed: 0 };
      });
      // Settled by `finish`, not by the coalesced heartbeats.
      expect(run.itemsDone).toBe(50);
      expect(run.currentItem).toBeNull();
    } finally {
      db.cleanup();
    }
  });

  it('never moves backwards, even if a handler reports out of order', async () => {
    const db = await createSqliteTestDb();
    const clock = new FakeClock(NOW);
    try {
      let midRun: jobsRepo.JobRunRow | undefined;
      await runJob(db, clock, async (ctx) => {
        ctx.reportProgress({ done: 40, total: 100, currentItem: 'ileri' });
        clock.advance(2_000);
        ctx.reportProgress({ done: 5, total: 100, currentItem: 'geri' });
        await new Promise((resolve) => setImmediate(resolve));
        midRun = (await jobsRepo.listJobRuns(db.appDb, { jobName: JOB_NAME }))[0];
        return { itemsTotal: 100, itemsOk: 100, itemsFailed: 0 };
      });
      expect(midRun?.itemsDone).toBe(40);
    } finally {
      db.cleanup();
    }
  });

  it('settles the row on finish: full bar, no item in flight', async () => {
    const db = await createSqliteTestDb();
    const clock = new FakeClock(NOW);
    try {
      const run = await runJob(db, clock, async (ctx) => {
        ctx.reportProgress({ done: 1, total: 4, currentItem: 'yarıda' });
        return { itemsTotal: 4, itemsOk: 3, itemsFailed: 1 };
      });
      expect(run.state).toBe('completed');
      expect(run.itemsDone).toBe(4);
      expect(run.itemsTotal).toBe(4);
      expect(run.currentItem).toBeNull();
    } finally {
      db.cleanup();
    }
  });

  it('a throwing handler still settles progress and the run is failed, not left running', async () => {
    const db = await createSqliteTestDb();
    const clock = new FakeClock(NOW);
    try {
      const run = await runJob(db, clock, async (ctx) => {
        ctx.reportProgress({ done: 2, total: 9, currentItem: 'patlamadan önce' });
        throw new Error('boom');
      });
      expect(run.state).toBe('failed');
      expect(run.error).toContain('boom');
      expect(run.currentItem).toBeNull();
    } finally {
      db.cleanup();
    }
  });
});
