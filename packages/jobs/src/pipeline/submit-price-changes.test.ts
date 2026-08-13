/**
 * doc 12 Phase 5.6 DoD: "Budget test: exhausted budget admits priority 0 only."
 */
import { repricingRepo } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { Scheduler } from '../scheduler.js';
import { createFakeAdapter, createSqliteTestDb, NOW, seedListing, seedMarketplace } from '../test-helpers.js';
import { SUBMIT_PRICE_CHANGES_JOB, submitPriceChanges } from './submit-price-changes.js';

async function run(
  appDb: Awaited<ReturnType<typeof createSqliteTestDb>>['appDb'],
  adapter: ReturnType<typeof createFakeAdapter>,
) {
  const clock = new FakeClock(NOW);
  const scheduler = new Scheduler({
    appDb,
    clock,
    adapters: new Map([['trendyol', adapter]]),
    instanceId: 'test',
  });
  scheduler.register({ jobName: SUBMIT_PRICE_CHANGES_JOB, handler: submitPriceChanges });
  await scheduler.enqueueNow(SUBMIT_PRICE_CHANGES_JOB, JSON.stringify({ marketplaceCode: 'trendyol' }));
  return scheduler.tick();
}

async function queueSubmission(
  appDb: Awaited<ReturnType<typeof createSqliteTestDb>>['appDb'],
  listingId: string,
  priority: number,
  id: string,
): Promise<void> {
  await repricingRepo.insertPriceSubmission(appDb, {
    id,
    listingId,
    marketplaceCode: 'trendyol',
    oldPrice: 2000n,
    newPrice: 1900n,
    reason: priority === 0 ? 'SellingAtLoss' : 'Refining',
    explanation: 'test',
    priority,
    decidedAt: NOW,
    state: 'queued',
    submittedAt: null,
    confirmedAt: null,
    marketplaceHandle: null,
    failureCode: null,
    failureMessage: null,
    attempts: 0,
    unitCost: 1000n,
    floorPrice: 1000n,
    buyboxPrice: null,
    secondPrice: null,
    rank: null,
    commissionRate: 15,
    vatRate: 20,
  });
}

describe('submitPriceChanges', () => {
  it('an exhausted budget admits priority 0 only', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);

      // dailyUpdateAllowance(1 listing) = max(10, 1*10) = 10 via createFakeAdapter's formula;
      // consume all of it so `remaining` is exactly 0 going into this run.
      const adapter = createFakeAdapter();
      for (let i = 0; i < 10; i += 1) {
        await repricingRepo.incrementBudgetUsage(
          appDb,
          'trendyol',
          new Date(NOW).toISOString().slice(0, 10),
          10,
        );
      }
      const usage = await repricingRepo.getBudgetUsage(
        appDb,
        'trendyol',
        new Date(NOW).toISOString().slice(0, 10),
      );
      expect(usage?.consumed).toBe(10); // fully exhausted

      await queueSubmission(appDb, listingId, 0, 'sub-p0');
      await queueSubmission(appDb, listingId, 1, 'sub-p1');
      await queueSubmission(appDb, listingId, 2, 'sub-p2');

      const tick = await run(appDb, adapter);
      expect(tick.ran).toEqual([{ jobName: SUBMIT_PRICE_CHANGES_JOB, ok: true }]);

      const p0 = await repricingRepo.getPriceSubmission(appDb, 'sub-p0');
      const p1 = await repricingRepo.getPriceSubmission(appDb, 'sub-p1');
      const p2 = await repricingRepo.getPriceSubmission(appDb, 'sub-p2');

      expect(p0?.state).toBe('submitted');
      expect(p1?.state).toBe('queued'); // refused — held for the next window
      expect(p2?.state).toBe('queued');
    } finally {
      cleanup();
    }
  });

  it('with budget available, all admitted submissions are batched into one adapter call', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      const adapter = createFakeAdapter();

      await queueSubmission(appDb, listingId, 1, 'sub-a');
      await queueSubmission(appDb, listingId, 1, 'sub-b');

      await run(appDb, adapter);

      const a = await repricingRepo.getPriceSubmission(appDb, 'sub-a');
      const b = await repricingRepo.getPriceSubmission(appDb, 'sub-b');
      expect(a?.state).toBe('submitted');
      expect(b?.state).toBe('submitted');
      expect(a?.marketplaceHandle).toBe(b?.marketplaceHandle); // one batch
    } finally {
      cleanup();
    }
  });

  it('does not touch the budget ledger itself — only ConfirmSubmissions consumes it', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      await queueSubmission(appDb, listingId, 1, 'sub-a');

      await run(appDb, createFakeAdapter());

      const usage = await repricingRepo.getBudgetUsage(
        appDb,
        'trendyol',
        new Date(NOW).toISOString().slice(0, 10),
      );
      expect(usage).toBeUndefined(); // nothing confirmed yet, so no usage row at all
    } finally {
      cleanup();
    }
  });
});
