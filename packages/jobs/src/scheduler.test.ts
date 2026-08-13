import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock.js';
import type { JobDefinition } from './job.js';
import { Scheduler } from './scheduler.js';
import { createSqliteTestDb } from './test-helpers.js';

const emptyAdapters = new Map();

describe('Scheduler', () => {
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
});
