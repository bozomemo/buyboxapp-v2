/**
 * `countActiveJobsForTarget` is the guard `apps/worker`'s per-marketplace tickers use to avoid
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

describe.each(ALL_DIALECTS)('countActiveJobsForTarget (%s)', (dialect) => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb(dialect);
  }, 30_000);
  afterAll(async () => {
    await db.cleanup();
  }, 30_000);

  it('counts only the matching target, so one marketplace never suppresses another', async () => {
    const job = 'SeparatesTargets';
    await enqueue(db.appDb, job, trendyol, 'locked');

    expect(await jobsRepo.countActiveJobsForTarget(db.appDb, job, 'trendyol')).toBe(1);
    // The whole point: Hepsiburada is free to run while Trendyol is busy.
    expect(await jobsRepo.countActiveJobsForTarget(db.appDb, job, 'hepsiburada')).toBe(0);
    // The name-only count cannot tell them apart — which is why this function exists.
    expect(await jobsRepo.countActiveJobs(db.appDb, job)).toBe(1);
  });

  it('ignores terminal rows, so a finished run does not block the next one forever', async () => {
    const job = 'IgnoresTerminal';
    await enqueue(db.appDb, job, trendyol, 'done');
    await enqueue(db.appDb, job, trendyol, 'failed');

    expect(await jobsRepo.countActiveJobsForTarget(db.appDb, job, 'trendyol')).toBe(0);

    await enqueue(db.appDb, job, trendyol, 'ready');
    expect(await jobsRepo.countActiveJobsForTarget(db.appDb, job, 'trendyol')).toBe(1);
  });

  it('does not match a different job name that happens to share a payload', async () => {
    await enqueue(db.appDb, 'SharesPayloadA', trendyol, 'ready');
    expect(await jobsRepo.countActiveJobsForTarget(db.appDb, 'SharesPayloadB', 'trendyol')).toBe(0);
  });

  it('still matches a row queued by an older build whose payload carried extra fields', async () => {
    // The 2026-08-26 regression this function was rewritten for: `cycleNumber` was dropped from
    // these payloads, a row written before the upgrade survived it, and exact string matching
    // admitted a second concurrent run against the same marketplace.
    const job = 'SurvivesPayloadChange';
    await enqueue(db.appDb, job, JSON.stringify({ marketplaceCode: 'trendyol', cycleNumber: 0 }), 'locked');

    expect(await jobsRepo.countActiveJobsForTarget(db.appDb, job, 'trendyol')).toBe(1);
    // Target separation still holds across the shape change.
    expect(await jobsRepo.countActiveJobsForTarget(db.appDb, job, 'hepsiburada')).toBe(0);
  });

  it('counts a payload with no target at all, so a global job never runs twice', async () => {
    // `ImportStockItems` is global; its payload names a product source, not a marketplace.
    const job = 'GlobalJob';
    await enqueue(db.appDb, job, JSON.stringify({ sourceCode: 'excel', sourceConfig: {} }), 'ready');
    expect(await jobsRepo.countActiveJobsForTarget(db.appDb, job, 'trendyol')).toBe(1);
  });

  it('counts an unreadable payload, erring toward suppressing rather than admitting', async () => {
    const job = 'UnreadablePayload';
    await enqueue(db.appDb, job, 'not json at all', 'locked');
    expect(await jobsRepo.countActiveJobsForTarget(db.appDb, job, 'trendyol')).toBe(1);
  });

  // The general form, used as the single-flight guard behind "Şimdi tara" — one sweep per brand,
  // while leaving other brands free to run alongside it.
  describe('countActiveJobsForPayloadField', () => {
    const forBrand = (brandId: string) => JSON.stringify({ marketplaceCode: 'trendyol', watchedBrandId: brandId });

    it('separates one brand from another', async () => {
      const job = 'SeparatesBrands';
      await enqueue(db.appDb, job, forBrand('brand-a'), 'locked');

      expect(await jobsRepo.countActiveJobsForPayloadField(db.appDb, job, 'watchedBrandId', 'brand-a')).toBe(1);
      expect(await jobsRepo.countActiveJobsForPayloadField(db.appDb, job, 'watchedBrandId', 'brand-b')).toBe(0);
    });

    it('lets an unscoped run suppress a scoped request, because it already covers it', async () => {
      // A sweep queued with no `watchedBrandId` sweeps every brand on the marketplace.
      const job = 'UnscopedCoversScoped';
      await enqueue(db.appDb, job, JSON.stringify({ marketplaceCode: 'trendyol' }), 'ready');
      expect(await jobsRepo.countActiveJobsForPayloadField(db.appDb, job, 'watchedBrandId', 'brand-a')).toBe(1);
    });

    it('ignores rows that have finished', async () => {
      const job = 'FinishedBrandSweep';
      await enqueue(db.appDb, job, forBrand('brand-a'), 'done');
      expect(await jobsRepo.countActiveJobsForPayloadField(db.appDb, job, 'watchedBrandId', 'brand-a')).toBe(0);
    });
  });
});
