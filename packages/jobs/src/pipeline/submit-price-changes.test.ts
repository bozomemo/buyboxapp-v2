/**
 * doc 12 Phase 5.6 DoD: "Budget test: exhausted budget admits priority 0 only."
 */
import { circuitBreakerRepo, configRepo, newId, repricingRepo } from '@buybox/db';
import { GLOBAL_KILL_SWITCH_SETTING_KEY } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { Scheduler } from '../scheduler.js';
import { createFakeAdapter, createSqliteTestDb, NOW, seedListing, seedMarketplace } from '../test-helpers.js';
import {
  SUBMIT_PRICE_CHANGES_JOB,
  marketplaceKillSwitchSetting,
  submitPriceChanges,
} from './submit-price-changes.js';

/**
 * The global kill switch is fail-closed (`@buybox/shared`): every test in this file except the
 * ones exercising the switch itself needs it explicitly disengaged first, exactly as a real
 * operator would have to before *any* submission can happen.
 */
async function disengageGlobalKillSwitch(
  appDb: Awaited<ReturnType<typeof createSqliteTestDb>>['appDb'],
): Promise<void> {
  await configRepo.setAppSetting(
    appDb,
    { key: GLOBAL_KILL_SWITCH_SETTING_KEY, value: 'false', updatedBy: 'test', updatedAt: NOW },
    newId(),
  );
}

async function run(
  appDb: Awaited<ReturnType<typeof createSqliteTestDb>>['appDb'],
  adapter: ReturnType<typeof createFakeAdapter>,
  options: { keepGlobalKillSwitchEngaged?: boolean } = {},
) {
  if (!options.keepGlobalKillSwitchEngaged) await disengageGlobalKillSwitch(appDb);
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

  it('fail-closed: with NO kill switch setting ever written (a fresh install), submissions are blocked by default', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      await queueSubmission(appDb, listingId, 0, 'sub-a'); // even priority 0 is blocked

      // No configRepo.setAppSetting call at all — this is the state of a database that has
      // never had the switch touched, which is exactly the state right after `runMigrations`.
      const tick = await run(appDb, createFakeAdapter(), { keepGlobalKillSwitchEngaged: true });
      expect(tick.ran).toEqual([{ jobName: SUBMIT_PRICE_CHANGES_JOB, ok: true }]);

      const a = await repricingRepo.getPriceSubmission(appDb, 'sub-a');
      expect(a?.state).toBe('queued');
    } finally {
      cleanup();
    }
  });

  it('the global kill switch (doc 06 §2, R-UI-9) blocks all submissions, leaving them queued', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      await queueSubmission(appDb, listingId, 0, 'sub-a'); // even priority 0 is blocked
      await configRepo.setAppSetting(
        appDb,
        { key: GLOBAL_KILL_SWITCH_SETTING_KEY, value: 'true', updatedBy: 'test', updatedAt: NOW },
        'audit-1',
      );

      const tick = await run(appDb, createFakeAdapter(), { keepGlobalKillSwitchEngaged: true });
      expect(tick.ran).toEqual([{ jobName: SUBMIT_PRICE_CHANGES_JOB, ok: true }]);

      const a = await repricingRepo.getPriceSubmission(appDb, 'sub-a');
      expect(a?.state).toBe('queued');
    } finally {
      cleanup();
    }
  });

  it('only an explicit "false" disengages the global switch — any other value stays blocked', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      await queueSubmission(appDb, listingId, 0, 'sub-a');
      await configRepo.setAppSetting(
        appDb,
        { key: GLOBAL_KILL_SWITCH_SETTING_KEY, value: 'False', updatedBy: 'test', updatedAt: NOW },
        'audit-1',
      );

      const tick = await run(appDb, createFakeAdapter(), { keepGlobalKillSwitchEngaged: true });
      expect(tick.ran).toEqual([{ jobName: SUBMIT_PRICE_CHANGES_JOB, ok: true }]);

      const a = await repricingRepo.getPriceSubmission(appDb, 'sub-a');
      expect(a?.state).toBe('queued');
    } finally {
      cleanup();
    }
  });

  it('the per-marketplace kill switch (doc 06 §2) blocks only that marketplace, leaving submissions queued, even with the global switch disengaged', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      await queueSubmission(appDb, listingId, 0, 'sub-a');
      await configRepo.setAppSetting(
        appDb,
        { key: marketplaceKillSwitchSetting('trendyol'), value: 'true', updatedBy: 'test', updatedAt: NOW },
        'audit-1',
      );

      const tick = await run(appDb, createFakeAdapter());
      expect(tick.ran).toEqual([{ jobName: SUBMIT_PRICE_CHANGES_JOB, ok: true }]);

      const a = await repricingRepo.getPriceSubmission(appDb, 'sub-a');
      expect(a?.state).toBe('queued');
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

  it('circuit breaker: repeated transport failures trip it, then a subsequent drain is skipped without calling the adapter (doc 07 §3, doc 12 6.9)', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      let calls = 0;
      const failingAdapter = createFakeAdapter({
        async submitPriceChanges() {
          calls += 1;
          throw new Error('ECONNRESET');
        },
      });

      // CIRCUIT_BREAKER_FAILURE_THRESHOLD is 5 (packages/jobs/src/circuit-breaker-config.ts) —
      // five separate drains, each with a submission queued, to accumulate five consecutive
      // transport failures.
      for (let i = 0; i < 5; i += 1) {
        await queueSubmission(appDb, listingId, 1, `sub-${i}`);
        await run(appDb, failingAdapter);
      }
      expect(calls).toBe(5);
      const state = await circuitBreakerRepo.getCircuitBreakerState(appDb, 'trendyol');
      expect(state?.state).toBe('open');

      // A sixth queued submission: the drain must skip entirely — the circuit is open, so the
      // failing adapter must not be called a sixth time, and the submission stays `queued`
      // rather than being marked failed (doc 07 §3: not a silent repricing disable, just a pause).
      await queueSubmission(appDb, listingId, 1, 'sub-5');
      await run(appDb, failingAdapter);
      expect(calls).toBe(5); // unchanged — adapter was never called
      const sub5 = await repricingRepo.getPriceSubmission(appDb, 'sub-5');
      expect(sub5?.state).toBe('queued');
    } finally {
      cleanup();
    }
  });

  it('circuit breaker: a successful submit closes the circuit and clears the failure count', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      await queueSubmission(appDb, listingId, 1, 'sub-a');
      const failingAdapter = createFakeAdapter({
        async submitPriceChanges() {
          throw new Error('ECONNRESET');
        },
      });
      await run(appDb, failingAdapter);
      let state = await circuitBreakerRepo.getCircuitBreakerState(appDb, 'trendyol');
      expect(state?.consecutiveFailures).toBe(1);

      await queueSubmission(appDb, listingId, 1, 'sub-b');
      await run(appDb, createFakeAdapter()); // succeeds
      state = await circuitBreakerRepo.getCircuitBreakerState(appDb, 'trendyol');
      expect(state?.state).toBe('closed');
      expect(state?.consecutiveFailures).toBe(0);
      const subB = await repricingRepo.getPriceSubmission(appDb, 'sub-b');
      expect(subB?.state).toBe('submitted');
    } finally {
      cleanup();
    }
  });
});
