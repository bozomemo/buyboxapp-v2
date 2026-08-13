/**
 * `SubmitPriceChanges` (doc 07 §1, §2, §5) — drains the outbox in marketplace-sized
 * batches, admitting by priority against the remaining update budget (doc 03 §8). Budget is
 * **not** consumed here — only on confirmation (doc 07 §5, CLAUDE.md: audit record only
 * after the marketplace confirms), so a failed batch never burns quota.
 */
import type { MarketplaceCode } from '@buybox/core';
import { configRepo, eventsRepo, listingsRepo, newId, repricingRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { z } from 'zod';
import { admitByPriority } from '../budget.js';
import { getAdapter } from '../adapter-registry.js';
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

export async function submitPriceChanges(ctx: JobContext): Promise<JobResult> {
  const payload = SubmitPriceChangesPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode: MarketplaceCode = payload.marketplaceCode;
  const nowMs = ctx.clock.nowMs();
  const adapter = getAdapter(ctx.adapters, marketplaceCode);

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
    } catch (error) {
      // Transport failure: retry with backoff at the job level (JobRunner), budget untouched,
      // submissions stay `queued` for the next drain (doc 07 §11).
      itemsFailed += submittable.length;
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
