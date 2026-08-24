/**
 * `countActiveJobsForPayload` is the guard `apps/worker`'s per-marketplace tickers use to avoid
 * queueing a job behind itself (doc 07 §8). The property that matters is that it separates
 * targets: the name-only `countActiveJobs` would let one marketplace's slow run suppress
 * another's, which stops repricing a marketplace rather than merely wasting quota.
 *
 * One database per dialect, shared by the cases below: creating and migrating a fresh MySQL
 * database per case exceeds vitest's default 5 s case timeout. The cases stay independent by
 * using a distinct job name each.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import { newId } from '../id.js';
import type { AppDatabase } from '../client.js';
import * as jobsRepo from './jobs.js';

const trendyol = JSON.stringify({ marketplaceCode: 'trendyol' });
const hepsiburada = JSON.stringify({ marketplaceCode: 'hepsiburada' });

async function enqueue(
  appDb: AppDatabase,
  jobName: string,
  payload: string,
  state: 'ready' | 'locked' | 'done' | 'failed',
): Promise<void> {
  await jobsRepo.enqueueJob(appDb, {
    id: newId(),
    jobName,
    payload,
    priority: 0,
    state,
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

describe.each(ALL_DIALECTS)('countActiveJobsForPayload (%s)', (dialect) => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb(dialect);
  }, 30_000);
  afterAll(async () => {
    await db.cleanup();
  }, 30_000);

  it('counts only the matching payload, so one marketplace never suppresses another', async () => {
    const job = 'SeparatesTargets';
    await enqueue(db.appDb, job, trendyol, 'locked');

    expect(await jobsRepo.countActiveJobsForPayload(db.appDb, job, trendyol)).toBe(1);
    // The whole point: Hepsiburada is free to run while Trendyol is busy.
    expect(await jobsRepo.countActiveJobsForPayload(db.appDb, job, hepsiburada)).toBe(0);
    // The name-only count cannot tell them apart — which is why this function exists.
    expect(await jobsRepo.countActiveJobs(db.appDb, job)).toBe(1);
  });

  it('ignores terminal rows, so a finished run does not block the next one forever', async () => {
    const job = 'IgnoresTerminal';
    await enqueue(db.appDb, job, trendyol, 'done');
    await enqueue(db.appDb, job, trendyol, 'failed');

    expect(await jobsRepo.countActiveJobsForPayload(db.appDb, job, trendyol)).toBe(0);

    await enqueue(db.appDb, job, trendyol, 'ready');
    expect(await jobsRepo.countActiveJobsForPayload(db.appDb, job, trendyol)).toBe(1);
  });

  it('does not match a different job name that happens to share a payload', async () => {
    await enqueue(db.appDb, 'SharesPayloadA', trendyol, 'ready');
    expect(await jobsRepo.countActiveJobsForPayload(db.appDb, 'SharesPayloadB', trendyol)).toBe(0);
  });
});
