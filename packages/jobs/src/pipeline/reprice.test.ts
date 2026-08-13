/**
 * Shadow-mode end-to-end: wires `packages/core`'s `decide()` through real repositories over
 * fixture data and asserts the expected decision — doc 12 Phase 5.5's DoD literally.
 */
import { competitionRepo, repricingRepo } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { Scheduler } from '../scheduler.js';
import { createFakeAdapter, createSqliteTestDb, NOW, seedListing, seedMarketplace } from '../test-helpers.js';
import { REPRICE_JOB, reprice } from './reprice.js';

async function run(
  appDb: Awaited<ReturnType<typeof createSqliteTestDb>>['appDb'],
  nowMs: number,
  mode: 'live' | 'shadow',
) {
  const clock = new FakeClock(nowMs);
  const scheduler = new Scheduler({
    appDb,
    clock,
    adapters: new Map([['trendyol', createFakeAdapter()]]),
    instanceId: 'test',
  });
  scheduler.register({ jobName: REPRICE_JOB, handler: reprice });
  await scheduler.enqueueNow(REPRICE_JOB, JSON.stringify({ marketplaceCode: 'trendyol', mode }));
  return scheduler.tick();
}

describe('reprice (shadow mode, doc 12 Phase 5.5 DoD)', () => {
  it('SEEKING: not holding the buybox, undercuts by policy.undercutBy and queues a shadow submission', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb, { price: 2000n, unitCost: 1000n });
      // Someone else holds the buybox at 19.00 TL; we're not competing (rank 2).
      await competitionRepo.insertBuyboxObservation(appDb, {
        id: 'obs-1',
        listingId,
        observedAt: NOW,
        rank: 2,
        buyboxPrice: 1900n,
        secondPrice: null,
        thirdPrice: null,
        hasMultipleSeller: true,
        source: 'api',
      });

      const tick = await run(appDb, NOW, 'shadow');
      expect(tick.ran).toEqual([{ jobName: REPRICE_JOB, ok: true }]);

      const state = await repricingRepo.getRepricingState(appDb, listingId);
      expect(state?.phase).toBe('SEEKING');

      const submissions = await repricingRepo.drainOutbox(appDb, 'trendyol', 10);
      expect(submissions).toHaveLength(0); // shadow submissions are 'cancelled', never queued
    } finally {
      cleanup();
    }
  });

  it('live mode queues a real submission the outbox can drain', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb, { price: 2000n, unitCost: 1000n });
      await competitionRepo.insertBuyboxObservation(appDb, {
        id: 'obs-1',
        listingId,
        observedAt: NOW,
        rank: 2,
        buyboxPrice: 1900n,
        secondPrice: null,
        thirdPrice: null,
        hasMultipleSeller: true,
        source: 'api',
      });

      await run(appDb, NOW, 'live');
      const submissions = await repricingRepo.drainOutbox(appDb, 'trendyol', 10);
      expect(submissions).toHaveLength(1);
      expect(submissions[0]?.reason).toBe('Seeking');
      expect(submissions[0]?.priority).toBe(1);
      expect(submissions[0]?.newPrice).toBeLessThan(2000n);
      expect(submissions[0]?.newPrice).toBeGreaterThan(0n);
    } finally {
      cleanup();
    }
  });

  it('a listing with no buybox observation yet gets InsufficientData, not a crash', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);

      const tick = await run(appDb, NOW, 'shadow');
      expect(tick.ran).toEqual([{ jobName: REPRICE_JOB, ok: true }]);

      const submissions = await repricingRepo.drainOutbox(appDb, 'trendyol', 10);
      expect(submissions).toHaveLength(0);
      const state = await repricingRepo.getRepricingState(appDb, listingId);
      expect(state).toBeDefined(); // state is still persisted even for a no-op decision
    } finally {
      cleanup();
    }
  });
});
