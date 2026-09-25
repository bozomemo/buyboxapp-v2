/**
 * The repository halves of three 2026-09-25 fixes, on every dialect:
 *
 * - `listJobLockOwners` / `expireJobLocksHeldBy` — a restarted worker frees the claims its dead
 *   predecessor held, instead of waiting out a six-hour visibility timeout;
 * - `listActiveJobsCovering` / `runningJobStartTimes` — a brand sweep is "already covered" only
 *   by a run of the same marketplace that could have seen the brand;
 * - `findHepsiburadaVariantsByParent` — a `-pm-` link resolves to the tracked variant.
 *
 * One database per dialect, shared; cases stay apart by job name or product ref.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import { newId } from '../id.js';
import type { AppDatabase } from '../client.js';
import * as configRepo from './config.js';
import * as jobsRepo from './jobs.js';
import * as trackedProductsRepo from './tracked-products.js';

async function enqueue(
  appDb: AppDatabase,
  jobName: string,
  payload: Record<string, unknown>,
  lock: { by: string; until: number } | null,
): Promise<string> {
  const id = newId();
  await jobsRepo.enqueueJob(appDb, {
    id,
    jobName,
    payload: JSON.stringify(payload),
    priority: 0,
    state: lock ? 'locked' : 'ready',
    runAfter: 0,
    lockedBy: lock?.by ?? null,
    lockedUntil: lock?.until ?? null,
    attempts: lock ? 1 : 0,
    maxAttempts: 3,
    lastError: null,
    createdAt: 0,
    updatedAt: 0,
  });
  return id;
}

describe.each(ALL_DIALECTS)('stale claims, sweep scope, -pm- lookup (%s)', (dialect) => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb(dialect);
    await configRepo.upsertMarketplace(db.appDb, {
      code: 'hepsiburada',
      displayName: 'Hepsiburada',
      enabled: true,
      merchantRef: null,
      createdAt: 0,
      updatedAt: 0,
    });
  }, 30_000);
  afterAll(async () => {
    await db.cleanup();
  }, 30_000);

  it('lists who holds claims and expires one holder’s claims only', async () => {
    const dead = `worker-111-dead${dialect.slice(0, 2)}@HOST`;
    const live = `worker-222-live${dialect.slice(0, 2)}@HOST`;
    const deadJob = await enqueue(db.appDb, 'StaleA', {}, { by: dead, until: 9_000_000 });
    const liveJob = await enqueue(db.appDb, 'StaleB', {}, { by: live, until: 9_000_000 });

    expect(await jobsRepo.listJobLockOwners(db.appDb)).toEqual(expect.arrayContaining([dead, live]));

    await jobsRepo.expireJobLocksHeldBy(db.appDb, dead, 1000);
    await jobsRepo.requeueExpiredJobs(db.appDb, 1000);

    expect((await jobsRepo.getJob(db.appDb, deadJob))?.state).toBe('ready');
    expect((await jobsRepo.getJob(db.appDb, liveJob))?.state).toBe('locked');
  });

  it('covers a brand only with a run of its own marketplace', async () => {
    const job = `Sweep${dialect}`;
    const running = await enqueue(db.appDb, job, { marketplaceCode: 'trendyol' }, { by: 'w', until: 9_000_000 });
    await jobsRepo.startJobRun(db.appDb, {
      id: newId(),
      jobName: job,
      startedAt: 5000,
      finishedAt: null,
      state: 'running',
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: null,
      correlationId: newId(),
      jobQueueId: running,
    });

    const hb = await jobsRepo.listActiveJobsCovering(db.appDb, job, {
      marketplaceCode: 'hepsiburada',
      watchedBrandId: 'b1',
    });
    const ty = await jobsRepo.listActiveJobsCovering(db.appDb, job, {
      marketplaceCode: 'trendyol',
      watchedBrandId: 'b1',
    });
    expect(hb).toEqual([]);
    expect(ty.map((row) => row.id)).toEqual([running]);
    expect(await jobsRepo.runningJobStartTimes(db.appDb, [running])).toEqual(new Map([[running, 5000]]));
  });

  it('finds the tracked Hepsiburada variants of a parent product', async () => {
    const parent = `HBC${dialect.toUpperCase()}PARENT`;
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id: newId(),
      marketplaceCode: 'hepsiburada',
      productRef: `HBCV${dialect.toUpperCase()}1`,
      productUrl: `/orijen-kitten-pm-${parent}`,
      label: 'Orijen',
      isActive: true,
      addedAt: 0,
    });
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id: newId(),
      marketplaceCode: 'hepsiburada',
      productRef: `HBCV${dialect.toUpperCase()}2`,
      // A longer id sharing the prefix must not match.
      productUrl: `/orijen-kitten-pm-${parent}X?magaza=x`,
      label: 'Orijen',
      isActive: true,
      addedAt: 0,
    });

    const variants = await trackedProductsRepo.findHepsiburadaVariantsByParent(db.appDb, parent);
    expect(variants.map((row) => row.productRef)).toEqual([`HBCV${dialect.toUpperCase()}1`]);
  });
});
