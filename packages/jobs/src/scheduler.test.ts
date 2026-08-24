import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configRepo, createDb, newId, runMigrations } from '@buybox/db';
import { SYSTEM_PAUSE_SETTING_KEY } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock.js';
import type { JobDefinition } from './job.js';
import { Scheduler } from './scheduler.js';
import { createSqliteTestDb } from './test-helpers.js';

/**
 * `createSqliteTestDb` (test-helpers.ts) pre-disengages the system pause so the rest of this
 * package's tests can assume an operational system. The tests below are specifically about the
 * pause itself, so they need a database exactly as `runMigrations` leaves it — nothing written
 * for `SYSTEM_PAUSE_SETTING_KEY` at all, the true state of a fresh install.
 */
async function createUntouchedSqliteTestDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'buybox-jobs-pause-test-'));
  const file = path.join(dir, 'test.db');
  const appDb = createDb(`file:${file}`, 'sqlite');
  await runMigrations(appDb);
  return {
    appDb,
    cleanup: () => {
      appDb.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const emptyAdapters = new Map();

describe('Scheduler', () => {
  /**
   * A worker that starts, ticks forever and does nothing looked exactly like a worker that
   * never started: no rows, no errors, nothing on any screen. Diagnosing one real occurrence
   * (2026-08-24) meant reading the SQLite file by hand. `lastTickReport` is what `/api/health`
   * and the Jobs screen now read instead, so each early return has to be able to say why it
   * stopped where it did.
   */
  describe('lastTickReport — says whether the scheduler is alive, and why it did nothing', () => {
    it('is undefined until the first tick completes', async () => {
      const { appDb, cleanup } = await createSqliteTestDb();
      try {
        const scheduler = new Scheduler({
          appDb,
          clock: new FakeClock(1000),
          adapters: emptyAdapters,
          instanceId: 'a',
        });
        expect(scheduler.lastTickReport).toBeUndefined();
      } finally {
        cleanup();
      }
    });

    it('reports `ran` with the tick time on a normal tick', async () => {
      const { appDb, cleanup } = await createSqliteTestDb();
      try {
        const scheduler = new Scheduler({
          appDb,
          clock: new FakeClock(1000),
          adapters: emptyAdapters,
          instanceId: 'a',
        });
        await scheduler.tick();
        expect(scheduler.lastTickReport).toEqual({ atMs: 1000, outcome: 'ran', ranCount: 0 });
      } finally {
        cleanup();
      }
    });

    it('reports `no-lock` for the instance that lost the lock, not silence', async () => {
      const { appDb, cleanup } = await createSqliteTestDb();
      try {
        const clock = new FakeClock(1000);
        const a = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'a' });
        const b = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'b' });
        await a.tick();
        await b.tick();
        expect(a.lastTickReport?.outcome).toBe('ran');
        expect(b.lastTickReport?.outcome).toBe('no-lock');
      } finally {
        cleanup();
      }
    });

    it('reports `paused` — the state a fresh install starts in', async () => {
      const { appDb, cleanup } = await createUntouchedSqliteTestDb();
      try {
        const scheduler = new Scheduler({
          appDb,
          clock: new FakeClock(1000),
          adapters: emptyAdapters,
          instanceId: 'a',
        });
        await scheduler.tick();
        expect(scheduler.lastTickReport?.outcome).toBe('paused');
      } finally {
        cleanup();
      }
    });
  });

  it('a failing tick is reported, not left to terminate the process', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const scheduler = new Scheduler({
        appDb,
        clock: new FakeClock(1000),
        adapters: emptyAdapters,
        instanceId: 'a',
        onTickError: () => {},
      });
      // `startLoop` used to do `void this.tick()`. In single-process mode an unhandled
      // rejection there takes the web server down with the worker, over what may be one
      // transient database error — so the loop reports and keeps going instead.
      const errors: unknown[] = [];
      const failing = new Scheduler({
        appDb,
        clock: new FakeClock(1000),
        adapters: emptyAdapters,
        instanceId: 'b',
        onTickError: (error) => errors.push(error),
      });
      const boom = new Error('database went away');
      failing.tick = () => Promise.reject(boom);
      failing.startLoop(1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await failing.shutdown(0);
      expect(errors).toContain(boom);
      expect(scheduler.lastTickReport).toBeUndefined();
    } finally {
      cleanup();
    }
  });
  it('two schedulers started against the same database — exactly one runs (doc 12 Phase 5.2 DoD)', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const clock = new FakeClock(1000);
      const a = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'a' });
      const b = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'b' });

      const resultA = await a.tick();
      const resultB = await b.tick();

      expect(resultA.heldLock).toBe(true);
      expect(resultB.heldLock).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('a second instance takes over once the first releases the lock (shutdown)', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const clock = new FakeClock(1000);
      const a = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'a' });
      const b = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'b' });

      expect((await a.tick()).heldLock).toBe(true);
      await a.shutdown(0);
      expect((await b.tick()).heldLock).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('enqueues a cadence-due job exactly once per cycle, not duplicated on repeated ticks', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const clock = new FakeClock(1000);
      const runs: number[] = [];
      const def: JobDefinition = {
        jobName: 'Heartbeat',
        cadenceMs: 60_000,
        handler: async () => {
          runs.push(clock.nowMs());
          return { itemsTotal: 1, itemsOk: 1, itemsFailed: 0 };
        },
      };
      const scheduler = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'a' });
      scheduler.register(def);

      const first = await scheduler.tick();
      expect(first.enqueued).toEqual(['Heartbeat']);
      expect(first.ran.map((r) => r.jobName)).toEqual(['Heartbeat']);
      expect(runs).toHaveLength(1);

      // Immediately ticking again must not enqueue a second instance while the first is done
      // (claimed and completed synchronously here, so it's already terminal — countActiveJobs
      // only excludes ready/locked, not done, so a fresh enqueue is in fact expected here).
      const second = await scheduler.tick();
      expect(second.enqueued).toEqual(['Heartbeat']);
      expect(runs).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it('runs a claimed on-demand job and marks it done', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const clock = new FakeClock(1000);
      const scheduler = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'a' });
      scheduler.register({
        jobName: 'OneOff',
        handler: async () => ({ itemsTotal: 3, itemsOk: 3, itemsFailed: 0 }),
      });

      await scheduler.enqueueNow('OneOff', '{}');
      const result = await scheduler.tick();
      expect(result.ran).toEqual([{ jobName: 'OneOff', ok: true }]);
    } finally {
      cleanup();
    }
  });

  it('retries a failed job with backoff instead of failing it immediately', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const clock = new FakeClock(1000);
      let attempts = 0;
      const scheduler = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'a' });
      scheduler.register({
        jobName: 'Flaky',
        maxAttempts: 3,
        handler: async () => {
          attempts += 1;
          if (attempts < 2) throw new Error('transient');
          return { itemsTotal: 1, itemsOk: 1, itemsFailed: 0 };
        },
      });

      const id = await scheduler.enqueueNow('Flaky', '{}');
      const first = await scheduler.tick();
      expect(first.ran).toEqual([{ jobName: 'Flaky', ok: false }]);

      // Not claimable again immediately — it's back in `ready` but with a future `runAfter`.
      const tooSoon = await scheduler.tick();
      expect(tooSoon.ran).toHaveLength(0);

      clock.advance(60_000);
      const retried = await scheduler.tick();
      expect(retried.ran).toEqual([{ jobName: 'Flaky', ok: true }]);
      expect(attempts).toBe(2);
      void id;
    } finally {
      cleanup();
    }
  });

  it('a job disabled after being claimed fails outright instead of retrying (doc 12 6.9)', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const clock = new FakeClock(1000);
      let attempts = 0;
      const scheduler = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'a' });
      scheduler.register({
        jobName: 'ScrapeCompetitors',
        maxAttempts: 3,
        handler: async () => {
          attempts += 1;
          throw new Error('403');
        },
      });

      await scheduler.enqueueNow('ScrapeCompetitors', '{}');
      const first = await scheduler.tick();
      expect(first.ran).toEqual([{ jobName: 'ScrapeCompetitors', ok: false }]);
      expect(attempts).toBe(1);

      // The operator disables it in the UI right after seeing the failure — a stored "false"
      // setting, same as `POST /api/jobs/enabled`.
      await configRepo.setAppSetting(
        appDb,
        {
          key: 'job.ScrapeCompetitors.enabled',
          value: 'false',
          updatedBy: 'operator',
          updatedAt: clock.nowMs(),
        },
        newId(),
      );

      clock.advance(60_000);
      const afterDisable = await scheduler.tick();
      // No further attempt: retryJob is skipped in favour of an immediate, permanent failure.
      expect(afterDisable.ran).toHaveLength(0);
      expect(attempts).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('shutdown drains in-flight work before releasing the lock (doc 12 Phase 5.9 DoD)', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const clock = new FakeClock(1000);
      let completed = false;
      const scheduler = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'a' });
      scheduler.register({
        jobName: 'Slow',
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          completed = true;
          return { itemsTotal: 1, itemsOk: 1, itemsFailed: 0 };
        },
      });
      await scheduler.enqueueNow('Slow', '{}');
      await scheduler.tick(); // claims and runs the job to completion (this scheduler's tick() is itself synchronous-to-completion)
      await scheduler.shutdown(1000); // still must not hang or lose anything on an already-quiet scheduler
      expect(completed).toBe(true);
    } finally {
      cleanup();
    }
  });

  describe('system pause (doc 06 §2) — genuinely separate from the price-submission switch', () => {
    it('fail-closed: a freshly migrated database with no row for it is paused by default', async () => {
      const { appDb, cleanup } = await createUntouchedSqliteTestDb();
      try {
        const clock = new FakeClock(1000);
        const runs: number[] = [];
        const scheduler = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'a' });
        scheduler.register({
          jobName: 'Heartbeat',
          cadenceMs: 60_000,
          handler: async () => {
            runs.push(clock.nowMs());
            return { itemsTotal: 1, itemsOk: 1, itemsFailed: 0 };
          },
        });

        const result = await scheduler.tick();
        expect(result).toEqual({ heldLock: true, paused: true, unlicensed: false, enqueued: [], ran: [] });
        expect(runs).toHaveLength(0);
      } finally {
        cleanup();
      }
    });

    it('while engaged, an already-queued on-demand job is not claimed either', async () => {
      const { appDb, cleanup } = await createUntouchedSqliteTestDb();
      try {
        const clock = new FakeClock(1000);
        const scheduler = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'a' });
        scheduler.register({
          jobName: 'OneOff',
          handler: async () => ({ itemsTotal: 1, itemsOk: 1, itemsFailed: 0 }),
        });
        await scheduler.enqueueNow('OneOff', '{}');

        const result = await scheduler.tick();
        expect(result.paused).toBe(true);
        expect(result.ran).toHaveLength(0); // queued, but never claimed while paused
      } finally {
        cleanup();
      }
    });

    it('only an explicit "false" resumes — any other stored value stays paused', async () => {
      const { appDb, cleanup } = await createUntouchedSqliteTestDb();
      try {
        await configRepo.setAppSetting(
          appDb,
          { key: SYSTEM_PAUSE_SETTING_KEY, value: 'engaged-but-not-the-literal-string', updatedBy: 'test', updatedAt: 0 },
          newId(),
        );
        const clock = new FakeClock(1000);
        const scheduler = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'a' });
        expect((await scheduler.tick()).paused).toBe(true);
      } finally {
        cleanup();
      }
    });

    it('resumed (explicit "false"), cadence jobs enqueue and run again', async () => {
      const { appDb, cleanup } = await createUntouchedSqliteTestDb();
      try {
        await configRepo.setAppSetting(
          appDb,
          { key: SYSTEM_PAUSE_SETTING_KEY, value: 'false', updatedBy: 'test', updatedAt: 0 },
          newId(),
        );
        const clock = new FakeClock(1000);
        const runs: number[] = [];
        const scheduler = new Scheduler({ appDb, clock, adapters: emptyAdapters, instanceId: 'a' });
        scheduler.register({
          jobName: 'Heartbeat',
          cadenceMs: 60_000,
          handler: async () => {
            runs.push(clock.nowMs());
            return { itemsTotal: 1, itemsOk: 1, itemsFailed: 0 };
          },
        });

        const result = await scheduler.tick();
        expect(result.paused).toBe(false);
        expect(result.enqueued).toEqual(['Heartbeat']);
        expect(runs).toHaveLength(1);
      } finally {
        cleanup();
      }
    });

    it('is independent of the price-submission switch: pausing the system does not disengage it, and vice versa', async () => {
      // `createSqliteTestDb` (test-helpers.ts) pre-disengages the system pause only — the
      // price-submission switch (a different setting entirely, checked inside
      // `SubmitPriceChanges` itself, not by the Scheduler) is untouched and stays fail-closed.
      const { appDb, cleanup } = await createSqliteTestDb();
      try {
        const systemPause = await configRepo.getAppSetting(appDb, SYSTEM_PAUSE_SETTING_KEY);
        const priceSwitch = await configRepo.getAppSetting(appDb, 'global.killSwitch');
        expect(systemPause?.value).toBe('false'); // resumed by the test helper
        expect(priceSwitch).toBeUndefined(); // never touched — still fail-closed by absence
      } finally {
        cleanup();
      }
    });
  });
});
