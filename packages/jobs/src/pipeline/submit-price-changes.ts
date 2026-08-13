/**
 * `SubmitPriceChanges` (doc 07 §1, §2, §5) — drains the outbox in marketplace-sized
 * batches, admitting by priority against the remaining update budget (doc 03 §8). Budget is
 * **not** consumed here — only on confirmation (doc 07 §5, CLAUDE.md: audit record only
 * after the marketplace confirms), so a failed batch never burns quota.
 */
import type { MarketplaceCode } from '@buybox/core';
import { circuitBreakerRepo, configRepo, eventsRepo, listingsRepo, newId, repricingRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { z } from 'zod';
import { admitByPriority } from '../budget.js';
import { getAdapter } from '../adapter-registry.js';
import {
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  CIRCUIT_BREAKER_OPEN_DURATION_MS,
} from '../circuit-breaker-config.js';
import type { JobContext, JobResult } from '../job.js';

export const SUBMIT_PRICE_CHANGES_JOB = 'SubmitPriceChanges';

export const SubmitPriceChangesPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  /** How many queued rows to consider this run — the outbox can hold more than one batch. */
  drainLimit: z.number().int().min(1).default(1000),
});

export type SubmitPriceChangesPayload = z.infer<typeof SubmitPriceChangesPayloadSchema>;

function usageDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** doc 06 §2, R-UI-9: a global kill switch reachable from any screen, checked before every drain
 *  so it "stops submissions within one poll interval" of being flipped — this is that gate. */
const GLOBAL_KILL_SWITCH_SETTING = 'global.killSwitch';

/** doc 06 §2: "Kill switches — global **and per marketplace**" — same gate, scoped to one marketplace. */
export function marketplaceKillSwitchSetting(marketplaceCode: string): string {
  return `marketplace.${marketplaceCode}.killSwitch`;
}

export async function submitPriceChanges(ctx: JobContext): Promise<JobResult> {
  const payload = SubmitPriceChangesPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode: MarketplaceCode = payload.marketplaceCode;
  const nowMs = ctx.clock.nowMs();
  const adapter = getAdapter(ctx.adapters, marketplaceCode);

  const killSwitch = await configRepo.getAppSetting(ctx.appDb, GLOBAL_KILL_SWITCH_SETTING);
  if (killSwitch?.value === 'true') {
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }
  const marketplaceKillSwitch = await configRepo.getAppSetting(
    ctx.appDb,
    marketplaceKillSwitchSetting(marketplaceCode),
  );
  if (marketplaceKillSwitch?.value === 'true') {
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }

  // doc 07 §3: "Circuit breaker per marketplace ... stop outbound calls" while open. Submissions
  // stay `queued` — `drainOutbox` hasn't been called yet, so nothing here has any side effect to
  // undo. Doc 07 §3 also requires the tripped state not silently disable repricing: the Jobs
  // screen (doc 12 6.9) surfaces this as "degraded" from `circuitBreakerRepo`, it isn't hidden.
  if (
    !(await circuitBreakerRepo.canProceed(
      ctx.appDb,
      marketplaceCode,
      nowMs,
      CIRCUIT_BREAKER_OPEN_DURATION_MS,
    ))
  ) {
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0, error: `circuit open for ${marketplaceCode}` };
  }

  const policyRow = await configRepo.getRepricingPolicy(ctx.appDb, marketplaceCode);
  if (!policyRow) {
    return {
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: `no repricing policy configured for ${marketplaceCode}`,
    };
  }

  const listingCount = (await listingsRepo.listRepriceableListings(ctx.appDb, marketplaceCode)).length;
  const dailyAllowance = adapter.capabilities.dailyUpdateAllowance(listingCount);
  const usage = await repricingRepo.getBudgetUsage(ctx.appDb, marketplaceCode, usageDateKey(nowMs));
  let remaining = Math.max(0, dailyAllowance - (usage?.consumed ?? 0));

  const queued = await repricingRepo.drainOutbox(ctx.appDb, marketplaceCode, payload.drainLimit);

  const admitted: typeof queued = [];
  for (const submission of queued) {
    if (!admitByPriority(submission.priority, remaining, policyRow.budgetReservePct, dailyAllowance))
      continue;
    admitted.push(submission);
    remaining -= 1; // reserved provisionally; the real ledger only moves on confirmation
  }

  let itemsOk = 0;
  let itemsFailed = 0;

  for (const batch of chunk(admitted, adapter.capabilities.maxBatchSize)) {
    const withListingId = await Promise.all(
      batch.map(async (submission) => ({
        submission,
        listing: await listingsRepo.getListing(ctx.appDb, submission.listingId),
      })),
    );
    const submittable = withListingId.filter(
      (x): x is { submission: (typeof batch)[number]; listing: NonNullable<(typeof x)['listing']> } =>
        x.listing !== undefined,
    );

    try {
      const handle = await adapter.submitPriceChanges(
        submittable.map(({ submission, listing }) => ({
          marketplaceListingId: listing.marketplaceListingId,
          newPrice: Money.fromKurus(submission.newPrice),
        })),
      );
      for (const { submission } of submittable) {
        await repricingRepo.markSubmitted(ctx.appDb, submission.id, handle.batchId, nowMs);
        itemsOk += 1;
      }
      await circuitBreakerRepo.recordSuccess(ctx.appDb, marketplaceCode, nowMs);
    } catch (error) {
      // Transport failure: retry with backoff at the job level (JobRunner), budget untouched,
      // submissions stay `queued` for the next drain (doc 07 §11). Also counts toward the
      // circuit breaker (doc 07 §3) — enough consecutive failures across drains trips it.
      itemsFailed += submittable.length;
      await circuitBreakerRepo.recordFailure(
        ctx.appDb,
        marketplaceCode,
        nowMs,
        error instanceof Error ? error.message : String(error),
        CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      );
      await eventsRepo.logEvent(ctx.appDb, {
        id: newId(),
        at: nowMs,
        level: 'error',
        marketplaceCode,
        listingId: null,
        jobRunId: ctx.correlationId,
        code: 'SubmitPriceChangesBatchFailed',
        message: `Batch of ${submittable.length} price changes failed to submit: ${error instanceof Error ? error.message : String(error)}`,
        context: null,
      });
    }
  }

  return { itemsTotal: admitted.length, itemsOk, itemsFailed };
}
