/**
 * The concurrent-claim test doc 12 Phase 5.1 requires: many claimers racing for the same
 * small pool of ready jobs must never claim the same row twice, on any of the three engines.
 */
import { describe, expect, it } from 'vitest';
import { ALL_DIALECTS, createTestDb } from '../test-helpers.js';
import { newId } from '../id.js';
import * as jobsRepo from './jobs.js';

describe.each(ALL_DIALECTS)('claimNextJob (%s)', (dialect) => {
  it('never claims the same job twice under concurrent callers', async () => {
    const { appDb, cleanup } = await createTestDb(dialect);
    try {
      const jobIds = Array.from({ length: 6 }, () => newId());
      for (const id of jobIds) {
        await jobsRepo.enqueueJob(appDb, {
          id,
          jobName: 'TestJob',
          payload: '{}',
          priority: 0,
          state: 'ready',
          runAfter: 0,
          lockedBy: null,
          lockedUntil: null,
          attempts: 0,
          maxAttempts: 3,
          lastError: null,
          createdAt: 0,
          updatedAt: 0,
        });
      }

      // 12 concurrent claimers racing for 6 ready jobs.
      const claims = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          jobsRepo.claimNextJob(appDb, {
            jobNames: ['TestJob'],
            workerId: `worker-${i}`,
            nowMs: 1000,
            visibilityTimeoutMs: 60_000,
          }),
        ),
      );

      const claimedIds = claims.filter((c) => c !== undefined).map((c) => c!.id);
      expect(claimedIds).toHaveLength(6); // exactly the pool size, no more, no fewer
      expect(new Set(claimedIds).size).toBe(6); // no id claimed twice

      for (const claimed of claims) {
        if (!claimed) continue;
        expect(claimed.state).toBe('locked');
        expect(claimed.attempts).toBe(1);
      }

      // Nothing left claimable.
      const extra = await jobsRepo.claimNextJob(appDb, {
        jobNames: ['TestJob'],
        workerId: 'worker-extra',
        nowMs: 1000,
        visibilityTimeoutMs: 60_000,
      });
      expect(extra).toBeUndefined();
    } finally {
      await cleanup();
    }
  }, 30_000);

  it('does not claim a job whose runAfter is in the future', async () => {
    const { appDb, cleanup } = await createTestDb(dialect);
    try {
      await jobsRepo.enqueueJob(appDb, {
        id: newId(),
        jobName: 'FutureJob',
        payload: '{}',
        priority: 0,
        state: 'ready',
        runAfter: 5000,
        lockedBy: null,
        lockedUntil: null,
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        createdAt: 0,
        updatedAt: 0,
      });
      const claimed = await jobsRepo.claimNextJob(appDb, {
        jobNames: ['FutureJob'],
        workerId: 'w1',
        nowMs: 1000,
        visibilityTimeoutMs: 60_000,
      });
      expect(claimed).toBeUndefined();
    } finally {
      await cleanup();
    }
  }, 30_000);

  it('claims lowest priority number first, then oldest runAfter', async () => {
    const { appDb, cleanup } = await createTestDb(dialect);
    try {
      const low = newId();
      const high = newId();
      await jobsRepo.enqueueJob(appDb, {
        id: high,
        jobName: 'PriorityJob',
        payload: '{}',
        priority: 5,
        state: 'ready',
        runAfter: 0,
        lockedBy: null,
        lockedUntil: null,
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        createdAt: 0,
        updatedAt: 0,
      });
      await jobsRepo.enqueueJob(appDb, {
        id: low,
        jobName: 'PriorityJob',
        payload: '{}',
        priority: 0,
        state: 'ready',
        runAfter: 0,
        lockedBy: null,
        lockedUntil: null,
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        createdAt: 0,
        updatedAt: 0,
      });
      const claimed = await jobsRepo.claimNextJob(appDb, {
        jobNames: ['PriorityJob'],
        workerId: 'w1',
        nowMs: 1000,
        visibilityTimeoutMs: 60_000,
      });
      expect(claimed?.id).toBe(low);
    } finally {
      await cleanup();
    }
  }, 30_000);
});

describe.each(ALL_DIALECTS)('requeueExpiredJobs (%s)', (dialect) => {
  it('returns an expired lock to ready when attempts remain, or fails it when exhausted', async () => {
    const { appDb, cleanup } = await createTestDb(dialect);
    try {
      const retryable = newId();
      const exhausted = newId();
      await jobsRepo.enqueueJob(appDb, {
        id: retryable,
        jobName: 'Job',
        payload: '{}',
        priority: 0,
        state: 'locked',
        runAfter: 0,
        lockedBy: 'dead-worker',
        lockedUntil: 500,
        attempts: 1,
        maxAttempts: 3,
        lastError: null,
        createdAt: 0,
        updatedAt: 0,
      });
      await jobsRepo.enqueueJob(appDb, {
        id: exhausted,
        jobName: 'Job',
        payload: '{}',
        priority: 0,
        state: 'locked',
        runAfter: 0,
        lockedBy: 'dead-worker',
        lockedUntil: 500,
        attempts: 3,
        maxAttempts: 3,
        lastError: null,
        createdAt: 0,
        updatedAt: 0,
      });

      await jobsRepo.requeueExpiredJobs(appDb, 1000);

      const retried = await jobsRepo.getJob(appDb, retryable);
      expect(retried?.state).toBe('ready');
      expect(retried?.lockedBy).toBeNull();

      const failed = await jobsRepo.getJob(appDb, exhausted);
      expect(failed?.state).toBe('failed');
    } finally {
      await cleanup();
    }
  }, 30_000);
});
