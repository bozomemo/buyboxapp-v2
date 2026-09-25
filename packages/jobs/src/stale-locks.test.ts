import { jobsRepo, newId } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from './adapter-registry.js';
import { FakeClock } from './clock.js';
import { DEFAULT_VISIBILITY_TIMEOUT_MS } from './job.js';
import { Scheduler } from './scheduler.js';
import {
  parseWorkerInstanceId,
  releaseLocksOfDeadLocalWorkers,
  workerInstanceId,
} from './stale-locks.js';
import { createFakeAdapter, createSqliteTestDb, NOW, type TestDb } from './test-helpers.js';

const SIX_HOURS = 6 * 60 * 60_000;

/** A claim as a worker that has since stopped left it: locked, six hours out, run still open. */
async function seedAbandonedClaim(db: TestDb, lockedBy: string, jobName = 'ScrapeCompetitors') {
  const id = newId();
  await jobsRepo.enqueueJob(db.appDb, {
    id,
    jobName,
    payload: '{"marketplaceCode":"trendyol"}',
    priority: 0,
    state: 'locked',
    runAfter: NOW - 60_000,
    lockedBy,
    lockedUntil: NOW + SIX_HOURS,
    attempts: 1,
    maxAttempts: 3,
    lastError: null,
    createdAt: NOW - 60_000,
    updatedAt: NOW - 60_000,
  });
  const runId = newId();
  await jobsRepo.startJobRun(db.appDb, {
    id: runId,
    jobName,
    startedAt: NOW - 60_000,
    finishedAt: null,
    state: 'running',
    itemsTotal: 47,
    itemsOk: 0,
    itemsFailed: 0,
    error: null,
    correlationId: newId(),
    jobQueueId: id,
  });
  return { id, runId };
}

describe('parseWorkerInstanceId', () => {
  const cases: { id: string; expected: ReturnType<typeof parseWorkerInstanceId> }[] = [
    { id: workerInstanceId(4242, 'OPS-PC', 'abc123'), expected: { pid: 4242, host: 'OPS-PC' } },
    { id: 'worker-11480-t8700l@my-host.local', expected: { pid: 11480, host: 'my-host.local' } },
    // The shape written before the host suffix existed (the live install's stale row).
    { id: 'worker-11480-t8700l', expected: { pid: 11480, host: null } },
    { id: 'progress-test', expected: null },
    { id: 'worker-abc-123', expected: null },
  ];
  for (const { id, expected } of cases) {
    it(`${id} → ${JSON.stringify(expected)}`, () => {
      expect(parseWorkerInstanceId(id)).toEqual(expected);
    });
  }
});

describe('releaseLocksOfDeadLocalWorkers', () => {
  const HOST = 'OPS-PC';
  const self = workerInstanceId(1, HOST, 'self00');

  it('requeues a dead local worker’s claim at once and closes its run', async () => {
    const db = await createSqliteTestDb();
    try {
      const dead = workerInstanceId(11480, HOST, 't8700l');
      const { id, runId } = await seedAbandonedClaim(db, dead);

      const released = await releaseLocksOfDeadLocalWorkers(db.appDb, {
        selfId: self,
        host: HOST,
        isPidAlive: () => false,
        nowMs: NOW,
      });

      expect(released).toEqual([dead]);
      expect((await jobsRepo.getJob(db.appDb, id))?.state).toBe('ready');
      const run = await jobsRepo.getJobRun(db.appDb, runId);
      expect(run?.state).toBe('failed');
      expect(run?.finishedAt).toBe(NOW);
    } finally {
      db.cleanup();
    }
  });

  it('also releases a legacy id with no host when its pid is gone', async () => {
    const db = await createSqliteTestDb();
    try {
      const { id } = await seedAbandonedClaim(db, 'worker-11480-t8700l');
      await releaseLocksOfDeadLocalWorkers(db.appDb, {
        selfId: self,
        host: HOST,
        isPidAlive: () => false,
        nowMs: NOW,
      });
      expect((await jobsRepo.getJob(db.appDb, id))?.state).toBe('ready');
    } finally {
      db.cleanup();
    }
  });

  const leftAlone: { name: string; owner: string; alive: boolean }[] = [
    { name: 'a live local worker', owner: workerInstanceId(2222, HOST, 'live00'), alive: true },
    { name: 'a worker on another host', owner: workerInstanceId(3333, 'OTHER-PC', 'far000'), alive: false },
    { name: 'this worker itself', owner: self, alive: false },
    { name: 'an id it cannot read', owner: 'progress-test', alive: false },
  ];
  for (const { name, owner, alive } of leftAlone) {
    it(`leaves ${name} to its timeout`, async () => {
      const db = await createSqliteTestDb();
      try {
        const { id } = await seedAbandonedClaim(db, owner);
        const released = await releaseLocksOfDeadLocalWorkers(db.appDb, {
          selfId: self,
          host: HOST,
          isPidAlive: () => alive,
          nowMs: NOW,
        });
        expect(released).toEqual([]);
        const job = await jobsRepo.getJob(db.appDb, id);
        expect(job?.state).toBe('locked');
        expect(job?.lockedUntil).toBe(NOW + SIX_HOURS);
      } finally {
        db.cleanup();
      }
    });
  }
});

describe('a claim is held for the claimed job’s own timeout, not the longest registered', () => {
  it('a default-timeout job runs under a five-minute lock beside a six-hour job', async () => {
    const db = await createSqliteTestDb();
    const clock = new FakeClock(NOW);
    try {
      const scheduler = new Scheduler({
        appDb: db.appDb,
        clock,
        adapters: buildAdapterRegistry([['trendyol', createFakeAdapter()]]),
        instanceId: 'lock-test',
      });
      let lockedUntilMidRun: number | null | undefined;
      scheduler.register({
        jobName: 'Quick',
        handler: async (ctx) => {
          const active = await jobsRepo.listActiveJobs(ctx.appDb);
          lockedUntilMidRun = active.find((row) => row.jobName === 'Quick')?.lockedUntil;
          return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
        },
      });
      scheduler.register({
        jobName: 'LongPass',
        handler: async () => ({ itemsTotal: 0, itemsOk: 0, itemsFailed: 0 }),
        visibilityTimeoutMs: SIX_HOURS,
      });
      await scheduler.enqueueNow('Quick', '{}');
      await scheduler.tick();
      await scheduler.shutdown();

      expect(lockedUntilMidRun).toBe(NOW + DEFAULT_VISIBILITY_TIMEOUT_MS);
    } finally {
      db.cleanup();
    }
  });
});
