import { competitionRepo, repricingRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { Scheduler } from '../scheduler.js';
import { createFakeAdapter, createSqliteTestDb, NOW, seedListing, seedMarketplace } from '../test-helpers.js';
import { OBSERVE_BUYBOX_JOB, observeBuybox } from './observe-buybox.js';

describe('observeBuybox (handler)', () => {
  it('polls a due (never-observed, therefore Hot) listing and records the observation', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      const clock = new FakeClock(NOW);

      const adapter = createFakeAdapter({
        async fetchBuyboxObservations(ids) {
          expect(ids).toEqual(['barcode-1']);
          return [
            {
              marketplaceListingId: 'barcode-1',
              rank: 1,
              buyboxPrice: Money.fromKurus(2000n),
              secondPrice: null,
              thirdPrice: null,
              hasMultipleSeller: false,
              observedAt: new Date(NOW),
            },
          ];
        },
      });

      const scheduler = new Scheduler({
        appDb,
        clock,
        adapters: new Map([['trendyol', adapter]]),
        instanceId: 'test',
      });
      scheduler.register({ jobName: OBSERVE_BUYBOX_JOB, handler: observeBuybox });
      await scheduler.enqueueNow(
        OBSERVE_BUYBOX_JOB,
        JSON.stringify({ marketplaceCode: 'trendyol', cycleNumber: 0 }),
      );
      const tick = await scheduler.tick();
      expect(tick.ran).toEqual([{ jobName: OBSERVE_BUYBOX_JOB, ok: true }]);

      const observation = await competitionRepo.latestBuyboxObservation(appDb, listingId);
      expect(observation?.rank).toBe(1);
      expect(observation?.buyboxPrice).toBe(2000n);
    } finally {
      cleanup();
    }
  });

  it('a Cold-tier listing (BLOCKED) is skipped on a cycle where it is not due', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      const clock = new FakeClock(NOW);

      // Establish BLOCKED phase so the tier becomes Cold (polled every 20 cycles by default).
      await repricingRepo.upsertRepricingState(appDb, {
        listingId,
        phase: 'BLOCKED',
        lastGoodPrice: null,
        lastBadPrice: null,
        optimumPrice: null,
        optimumCtxUnitCost: null,
        optimumCtxCommissionRate: null,
        optimumCtxVatRate: null,
        optimumCtxCampaignRatio: null,
        optimumCtxSecondPrice: null,
        optimumCtxSecondSellerRef: null,
        pendingSubmissionId: null,
        settleUntil: null,
        consecutiveRejections: 0,
        updatedAt: NOW,
      });

      let called = false;
      const adapter = createFakeAdapter({
        async fetchBuyboxObservations(ids) {
          called = true;
          return ids.map((id) => ({
            marketplaceListingId: id,
            rank: 1,
            buyboxPrice: null,
            secondPrice: null,
            thirdPrice: null,
            hasMultipleSeller: false,
            observedAt: new Date(NOW),
          }));
        },
      });

      const scheduler = new Scheduler({
        appDb,
        clock,
        adapters: new Map([['trendyol', adapter]]),
        instanceId: 'test',
      });
      scheduler.register({ jobName: OBSERVE_BUYBOX_JOB, handler: observeBuybox });
      // cycle 1 is not a multiple of the default coldEveryNCycles (20) — not due.
      await scheduler.enqueueNow(
        OBSERVE_BUYBOX_JOB,
        JSON.stringify({ marketplaceCode: 'trendyol', cycleNumber: 1 }),
      );
      await scheduler.tick();

      expect(called).toBe(false);
    } finally {
      cleanup();
    }
  });
});
