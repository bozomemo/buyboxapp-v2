import { repricingRepo } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { Scheduler } from '../scheduler.js';
import { createFakeAdapter, createSqliteTestDb, NOW, seedListing, seedMarketplace } from '../test-helpers.js';
import { RESET_BUDGET_JOB, resetBudget } from './reset-budget.js';

describe('resetBudget', () => {
  it('creates a zero-consumed usage row with the computed allowance, once', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      await seedListing(appDb);
      const clock = new FakeClock(NOW);
      const scheduler = new Scheduler({
        appDb,
        clock,
        adapters: new Map([['trendyol', createFakeAdapter()]]),
        instanceId: 'test',
      });
      scheduler.register({ jobName: RESET_BUDGET_JOB, handler: resetBudget });
      await scheduler.enqueueNow(RESET_BUDGET_JOB, JSON.stringify({ marketplaceCode: 'trendyol' }));
      await scheduler.tick();

      const usageDate = new Date(NOW).toISOString().slice(0, 10);
      const usage = await repricingRepo.getBudgetUsage(appDb, 'trendyol', usageDate);
      expect(usage?.consumed).toBe(0);
      expect(usage?.allowance).toBe(10); // 1 listing × 10 (createFakeAdapter's formula)
    } finally {
      cleanup();
    }
  });

  it('never zeroes out budget already consumed on a second run the same day', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      await seedListing(appDb);
      const clock = new FakeClock(NOW);
      const usageDate = new Date(NOW).toISOString().slice(0, 10);
      await repricingRepo.incrementBudgetUsage(appDb, 'trendyol', usageDate, 10);

      const scheduler = new Scheduler({
        appDb,
        clock,
        adapters: new Map([['trendyol', createFakeAdapter()]]),
        instanceId: 'test',
      });
      scheduler.register({ jobName: RESET_BUDGET_JOB, handler: resetBudget });
      await scheduler.enqueueNow(RESET_BUDGET_JOB, JSON.stringify({ marketplaceCode: 'trendyol' }));
      await scheduler.tick();

      const usage = await repricingRepo.getBudgetUsage(appDb, 'trendyol', usageDate);
      expect(usage?.consumed).toBe(1); // untouched
    } finally {
      cleanup();
    }
  });
});
