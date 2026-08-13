/**
 * `ResetBudget` (doc 07 §1, §5) — at marketplace midnight, ensure today's `update_budget_usage`
 * row exists with `consumed: 0` and the allowance computed from the current listing count.
 * Actual daily rollover happens for free: usage is keyed by `(marketplaceCode, usageDate)`, so
 * a new date is a fresh row the moment anything increments it. This job just makes the day's
 * allowance visible in the UI *before* the first confirmation, and pins it for the day.
 */
import type { MarketplaceCode } from '@buybox/core';
import { listingsRepo, repricingRepo } from '@buybox/db';
import { z } from 'zod';
import { getAdapter } from '../adapter-registry.js';
import type { JobContext, JobResult } from '../job.js';

export const RESET_BUDGET_JOB = 'ResetBudget';

export const ResetBudgetPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
});

export type ResetBudgetPayload = z.infer<typeof ResetBudgetPayloadSchema>;

export async function resetBudget(ctx: JobContext): Promise<JobResult> {
  const payload = ResetBudgetPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode: MarketplaceCode = payload.marketplaceCode;
  const nowMs = ctx.clock.nowMs();
  const adapter = getAdapter(ctx.adapters, marketplaceCode);

  const listingCount = (await listingsRepo.listRepriceableListings(ctx.appDb, marketplaceCode)).length;
  const allowance = adapter.capabilities.dailyUpdateAllowance(listingCount);
  const usageDate = new Date(nowMs).toISOString().slice(0, 10);

  await repricingRepo.ensureBudgetUsageRow(ctx.appDb, marketplaceCode, usageDate, allowance);

  return { itemsTotal: 1, itemsOk: 1, itemsFailed: 0 };
}
