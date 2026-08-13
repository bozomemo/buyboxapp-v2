/**
 * `ConfirmSubmissions` (doc 07 §1, §2, §5, §7, §7.1) — polls each pending marketplace batch
 * to a terminal state, classifies rejections, and consumes budget **only on confirmation**
 * (CLAUDE.md hard rule: the audit record moves only after the marketplace confirms).
 */
import { configRepo, eventsRepo, listingsRepo, newId, repricingRepo } from '@buybox/db';
import type { MarketplaceCode } from '@buybox/core';
import { z } from 'zod';
import { getAdapter } from '../adapter-registry.js';
import type { JobContext, JobResult } from '../job.js';

export const CONFIRM_SUBMISSIONS_JOB = 'ConfirmSubmissions';

export const ConfirmSubmissionsPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  /** Shorter than Trendyol's 4-hour result-retention window (api-references §1.4). */
  confirmationTimeoutMs: z
    .number()
    .int()
    .min(1)
    .default(3 * 60 * 60_000),
  maxConsecutiveRejections: z.number().int().min(1).default(5),
});

export type ConfirmSubmissionsPayload = z.infer<typeof ConfirmSubmissionsPayloadSchema>;

type RejectionClass = 'priceRange' | 'campaign' | 'quota' | 'validation';

/**
 * doc 03 §7.1's table, matched against the raw marketplace failure text — the classifier
 * genuinely belongs at this layer (it reads marketplace-specific strings from
 * api-references.md), not in `packages/core`, which never sees raw marketplace text.
 */
export function classifyRejection(message: string): RejectionClass {
  if (/OutOfPriceRange/i.test(message)) return 'priceRange';
  if (/DiscountedListingPriceIncrease|DiscountedListingStockDecrease/i.test(message)) return 'campaign';
  if (/too many ongoing|exceeds.*inventory upload limit/i.test(message)) return 'quota';
  return 'validation';
}

function usageDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export async function confirmSubmissions(ctx: JobContext): Promise<JobResult> {
  const payload = ConfirmSubmissionsPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode: MarketplaceCode = payload.marketplaceCode;
  const nowMs = ctx.clock.nowMs();
  const adapter = getAdapter(ctx.adapters, marketplaceCode);
  const policyRow = await configRepo.getRepricingPolicy(ctx.appDb, marketplaceCode);

  const pending = await repricingRepo.listSubmittedSubmissions(ctx.appDb, marketplaceCode, 500);
  if (pending.length === 0) return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };

  // One poll per distinct batch (marketplace_handle), not per submission row.
  const byHandle = new Map<string, typeof pending>();
  for (const submission of pending) {
    if (!submission.marketplaceHandle) continue;
    const group = byHandle.get(submission.marketplaceHandle) ?? [];
    group.push(submission);
    byHandle.set(submission.marketplaceHandle, group);
  }

  let itemsOk = 0;
  let itemsFailed = 0;

  for (const [batchId, group] of byHandle) {
    const submittedAtMs = Math.min(...group.map((s) => s.submittedAt ?? s.decidedAt));
    const result = await adapter.pollSubmission({ batchId, submittedAt: new Date(submittedAtMs) });

    if (result.status === 'pending') {
      if (nowMs - submittedAtMs > payload.confirmationTimeoutMs) {
        for (const submission of group) {
          await failSubmission(
            ctx,
            submission,
            'ConfirmationTimeout',
            'Confirmation window elapsed',
            payload,
            nowMs,
          );
          itemsFailed += 1;
        }
      }
      continue; // still pending and within the window — retried next run
    }

    const listingByMarketplaceId = new Map<string, string>();
    for (const submission of group) {
      const listing = await listingsRepo.getListing(ctx.appDb, submission.listingId);
      if (listing) listingByMarketplaceId.set(listing.marketplaceListingId, submission.id);
    }

    for (const item of result.items) {
      const submissionId = listingByMarketplaceId.get(item.marketplaceListingId);
      const submission = group.find((s) => s.id === submissionId);
      if (!submission) continue;

      if (item.status === 'success') {
        await repricingRepo.markConfirmed(ctx.appDb, submission.id, nowMs);
        await repricingRepo.incrementBudgetUsage(
          ctx.appDb,
          marketplaceCode,
          usageDateKey(nowMs),
          adapter.capabilities.dailyUpdateAllowance(byHandle.size),
        );
        if (policyRow) {
          const state = await repricingRepo.getRepricingState(ctx.appDb, submission.listingId);
          if (state) {
            await repricingRepo.upsertRepricingState(ctx.appDb, {
              ...state,
              settleUntil: nowMs + policyRow.settleDurationMs,
              updatedAt: nowMs,
            });
          }
        }
        itemsOk += 1;
      } else {
        await failSubmission(
          ctx,
          submission,
          item.failureReason ?? 'Unknown',
          item.failureReason ?? 'Rejected without a reason',
          payload,
          nowMs,
        );
        itemsFailed += 1;
      }
    }
  }

  return { itemsTotal: pending.length, itemsOk, itemsFailed };
}

async function failSubmission(
  ctx: JobContext,
  submission: repricingRepo.PriceSubmissionRow,
  failureCode: string,
  failureMessage: string,
  payload: ConfirmSubmissionsPayload,
  nowMs: number,
): Promise<void> {
  const rejectionClass = classifyRejection(failureMessage);
  await repricingRepo.markFailed(ctx.appDb, submission.id, 'rejected', failureCode, failureMessage);

  const state = await repricingRepo.getRepricingState(ctx.appDb, submission.listingId);
  const consecutiveRejections = (state?.consecutiveRejections ?? 0) + 1;

  if (state && state.pendingSubmissionId === submission.id) {
    await repricingRepo.upsertRepricingState(ctx.appDb, {
      ...state,
      pendingSubmissionId: null,
      consecutiveRejections,
      updatedAt: nowMs,
    });
  }

  // doc 03 §7.1 — price-range rejections become a hard bound; the classifier can't tell
  // increase-vs-decrease from the failure text alone, so both bounds are derived from the
  // rejected price itself relative to the listing's price before this submission.
  if (rejectionClass === 'priceRange') {
    const listing = await listingsRepo.getListing(ctx.appDb, submission.listingId);
    if (listing) {
      const rejectedIncrease = submission.newPrice > submission.oldPrice;
      await listingsRepo.setListingOverrides(
        ctx.appDb,
        submission.listingId,
        rejectedIncrease ? { maxPrice: submission.oldPrice } : { minPrice: submission.oldPrice },
        nowMs,
      );
    }
  }

  await eventsRepo.logEvent(ctx.appDb, {
    id: newId(),
    at: nowMs,
    level: rejectionClass === 'validation' ? 'error' : 'warn',
    marketplaceCode: submission.marketplaceCode,
    listingId: submission.listingId,
    jobRunId: ctx.correlationId,
    code: `SubmissionRejected:${rejectionClass}`,
    message: `Submission ${submission.id} rejected (${rejectionClass}): ${failureMessage}`,
    context: JSON.stringify({ failureCode, consecutiveRejections }),
  });

  if (consecutiveRejections >= payload.maxConsecutiveRejections) {
    // doc 03 §7: "a listing must never be retried forever."
    await listingsRepo.setListingOverrides(ctx.appDb, submission.listingId, { repriceEnabled: false }, nowMs);
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: nowMs,
      level: 'error',
      marketplaceCode: submission.marketplaceCode,
      listingId: submission.listingId,
      jobRunId: ctx.correlationId,
      code: 'AutomationDisabledAfterRejections',
      message: `Listing ${submission.listingId} disabled after ${consecutiveRejections} consecutive rejections`,
      context: null,
    });
  }
}
