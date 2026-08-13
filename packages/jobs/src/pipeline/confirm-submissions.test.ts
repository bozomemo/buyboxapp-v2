/**
 * doc 12 Phase 5.7 DoD: "Confirmation-timeout path tested." Plus rejection classification
 * and budget-on-confirm-only (CLAUDE.md hard rule).
 */
import { listingsRepo, repricingRepo } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { Scheduler } from '../scheduler.js';
import { createFakeAdapter, createSqliteTestDb, NOW, seedListing, seedMarketplace } from '../test-helpers.js';
import { classifyRejection, CONFIRM_SUBMISSIONS_JOB, confirmSubmissions } from './confirm-submissions.js';

async function seedSubmitted(
  appDb: Awaited<ReturnType<typeof createSqliteTestDb>>['appDb'],
  listingId: string,
  id: string,
  batchId: string,
  submittedAt: number,
): Promise<void> {
  await repricingRepo.insertPriceSubmission(appDb, {
    id,
    listingId,
    marketplaceCode: 'trendyol',
    oldPrice: 2000n,
    newPrice: 1900n,
    reason: 'Seeking',
    explanation: 'test',
    priority: 1,
    decidedAt: submittedAt,
    state: 'submitted',
    submittedAt,
    confirmedAt: null,
    marketplaceHandle: batchId,
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
  await repricingRepo.upsertRepricingState(appDb, {
    listingId,
    phase: 'SEEKING',
    lastGoodPrice: null,
    lastBadPrice: null,
    optimumPrice: null,
    optimumCtxUnitCost: null,
    optimumCtxCommissionRate: null,
    optimumCtxVatRate: null,
    optimumCtxCampaignRatio: null,
    optimumCtxSecondPrice: null,
    optimumCtxSecondSellerRef: null,
    pendingSubmissionId: id,
    settleUntil: null,
    consecutiveRejections: 0,
    updatedAt: submittedAt,
  });
}

async function run(
  appDb: Awaited<ReturnType<typeof createSqliteTestDb>>['appDb'],
  nowMs: number,
  adapter: ReturnType<typeof createFakeAdapter>,
  payload: Record<string, unknown> = {},
) {
  const clock = new FakeClock(nowMs);
  const scheduler = new Scheduler({
    appDb,
    clock,
    adapters: new Map([['trendyol', adapter]]),
    instanceId: 'test',
  });
  scheduler.register({ jobName: CONFIRM_SUBMISSIONS_JOB, handler: confirmSubmissions });
  await scheduler.enqueueNow(
    CONFIRM_SUBMISSIONS_JOB,
    JSON.stringify({ marketplaceCode: 'trendyol', ...payload }),
  );
  return scheduler.tick();
}

describe('classifyRejection (doc 03 §7.1)', () => {
  it.each([
    ['OutOfPriceRange', 'priceRange'],
    ['DiscountedListingPriceIncrease', 'campaign'],
    ['DiscountedListingStockDecrease', 'campaign'],
    ['There are too many ongoing/waiting inventory uploads', 'quota'],
    ['merchant exceeds his inventory upload limit', 'quota'],
    ['malformed payload: missing barcode', 'validation'],
  ] as const)('%s -> %s', (message, expected) => {
    expect(classifyRejection(message)).toBe(expected);
  });
});

describe('confirmSubmissions', () => {
  it('confirms on success, consumes budget only now, and sets the settle window', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      await seedSubmitted(appDb, listingId, 'sub-1', 'batch-1', NOW);

      const adapter = createFakeAdapter({
        async pollSubmission() {
          return {
            status: 'completed',
            items: [{ marketplaceListingId: 'barcode-1', status: 'success', failureReason: null }],
          };
        },
      });

      const usageDate = new Date(NOW).toISOString().slice(0, 10);
      expect(await repricingRepo.getBudgetUsage(appDb, 'trendyol', usageDate)).toBeUndefined();

      await run(appDb, NOW, adapter);

      const submission = await repricingRepo.getPriceSubmission(appDb, 'sub-1');
      expect(submission?.state).toBe('confirmed');

      const usage = await repricingRepo.getBudgetUsage(appDb, 'trendyol', usageDate);
      expect(usage?.consumed).toBe(1); // consumed now, not at submission time

      const state = await repricingRepo.getRepricingState(appDb, listingId);
      expect(state?.settleUntil).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it('classifies a price-range rejection and sets a hard bound on the listing', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb, { price: 2000n });
      await seedSubmitted(appDb, listingId, 'sub-1', 'batch-1', NOW);
      // The rejected submission proposed a decrease (1900 < oldPrice 2000).

      const adapter = createFakeAdapter({
        async pollSubmission() {
          return {
            status: 'completed',
            items: [
              { marketplaceListingId: 'barcode-1', status: 'failed', failureReason: 'OutOfPriceRange' },
            ],
          };
        },
      });

      await run(appDb, NOW, adapter);

      const submission = await repricingRepo.getPriceSubmission(appDb, 'sub-1');
      expect(submission?.state).toBe('rejected');

      const listing = await listingsRepo.getListing(appDb, listingId);
      expect(listing?.minPrice).toBe(2000n); // a rejected decrease sets minPrice = the old price

      const state = await repricingRepo.getRepricingState(appDb, listingId);
      expect(state?.pendingSubmissionId).toBeNull(); // cleared so Reprice can act again
      expect(state?.consecutiveRejections).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('a batch still pending past the confirmation timeout is marked failed, not left stuck forever', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      await seedSubmitted(appDb, listingId, 'sub-1', 'batch-1', NOW);

      const adapter = createFakeAdapter({
        async pollSubmission() {
          return { status: 'pending' };
        },
      });

      // Still within the window: nothing changes yet.
      await run(appDb, NOW + 60_000, adapter, { confirmationTimeoutMs: 3 * 60 * 60_000 });
      expect((await repricingRepo.getPriceSubmission(appDb, 'sub-1'))?.state).toBe('submitted');

      // Past the window: times out.
      await run(appDb, NOW + 4 * 60 * 60_000, adapter, { confirmationTimeoutMs: 3 * 60 * 60_000 });
      const submission = await repricingRepo.getPriceSubmission(appDb, 'sub-1');
      expect(submission?.state).toBe('rejected');
      expect(submission?.failureCode).toBe('ConfirmationTimeout');

      const state = await repricingRepo.getRepricingState(appDb, listingId);
      expect(state?.pendingSubmissionId).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('disables automation after too many consecutive rejections (doc 03 §7: never retried forever)', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);

      const adapter = createFakeAdapter({
        async pollSubmission() {
          return {
            status: 'completed',
            items: [
              { marketplaceListingId: 'barcode-1', status: 'failed', failureReason: 'malformed payload' },
            ],
          };
        },
      });

      for (let i = 0; i < 2; i += 1) {
        if (i === 0) {
          await seedSubmitted(appDb, listingId, `sub-${i}`, `batch-${i}`, NOW);
        } else {
          // Re-link a fresh submission to the *existing* state row without resetting
          // `consecutiveRejections` — that's the whole point of this test.
          await repricingRepo.insertPriceSubmission(appDb, {
            id: `sub-${i}`,
            listingId,
            marketplaceCode: 'trendyol',
            oldPrice: 2000n,
            newPrice: 1900n,
            reason: 'Seeking',
            explanation: 'test',
            priority: 1,
            decidedAt: NOW,
            state: 'submitted',
            submittedAt: NOW,
            confirmedAt: null,
            marketplaceHandle: `batch-${i}`,
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
          const current = await repricingRepo.getRepricingState(appDb, listingId);
          if (current) {
            await repricingRepo.upsertRepricingState(appDb, {
              ...current,
              pendingSubmissionId: `sub-${i}`,
              updatedAt: NOW,
            });
          }
        }
        await run(appDb, NOW, adapter, { maxConsecutiveRejections: 2 });
      }

      const listing = await listingsRepo.getListing(appDb, listingId);
      expect(listing?.repriceEnabled).toBe(false);
    } finally {
      cleanup();
    }
  });
});
