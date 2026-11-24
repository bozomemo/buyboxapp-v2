/**
 * `ResolveSellerIdentities` — _Seçilenlerin kimliğini çöz_: the firms behind several storefronts,
 * one after another (doc 06 §12.4 Faz 7, api-references §1.6a).
 *
 * ## Why this exists, against Faz 7's "never in bulk"
 *
 * Faz 7 offered one button per seller, so that the number of sellers resolved would be the
 * number a person meant to write to. The product owner changed that on 2026-11-25: a compliance
 * officer preparing notices for a list of storefronts was left pressing the same button dozens
 * of times and waiting on each. The six-per-minute limit itself was a design choice, not a
 * measured threshold, and it is kept — this job is the single button repeated, not a faster one.
 *
 * - **Same source, same limiter.** Each seller goes through `resolveOneSeller`, the very code the
 *   single button runs, against the one `TrendyolSellerIdentitySource` the worker owns. Its
 *   six-per-minute bucket and one-at-a-time chain bound this run exactly as they bound a person
 *   pressing the button, so a selection of a hundred costs a hundred presses' worth of pages and
 *   no more per minute.
 * - **One run, sellers in sequence.** One queued job per seller would have the scheduler's
 *   overlapping ticks each claim one and park it on the limiter — dozens of runs holding locks
 *   while waiting their turn. A single run walks the list itself.
 * - **A selection, never "all".** The payload names the sellers a person ticked, capped at
 *   `IDENTITY_BULK_MAX_SELLERS`; the route refuses a larger selection rather than truncating it.
 * - **Already resolved is skipped at run time**, not only when queued: the single button may have
 *   been pressed for one of them while this run waited, and a second page load would only replace
 *   a fresh answer with an identical one.
 *
 * ⚠️ **Reporting only**, as `ResolveSellerIdentity` is. Nothing here reaches a price.
 */
import type { MarketplaceCode } from '@buybox/core';
import { competitorSellersRepo, sellerIdentitiesRepo } from '@buybox/db';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';
import { getSellerIdentitySource } from '../seller-identity-source-registry.js';
import { IDENTITY_LOOKBACK_DAYS, IDENTITY_MAX_CANDIDATES, resolveOneSeller } from './resolve-seller-identity.js';

export const RESOLVE_SELLER_IDENTITIES_JOB = 'ResolveSellerIdentities';

/**
 * Ceiling on one selection. At six pages a minute and one to four pages a seller, two hundred
 * sellers is roughly half an hour to two hours — a run someone starts before lunch, not a crawl.
 */
export const IDENTITY_BULK_MAX_SELLERS = 200;

export const ResolveSellerIdentitiesPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  sellerRefs: z.array(z.string().min(1)).min(1).max(IDENTITY_BULK_MAX_SELLERS),
  lookbackDays: z.number().int().min(1).default(IDENTITY_LOOKBACK_DAYS),
  maxCandidates: z.number().int().min(1).default(IDENTITY_MAX_CANDIDATES),
});

export type ResolveSellerIdentitiesPayload = z.infer<typeof ResolveSellerIdentitiesPayloadSchema>;

export async function resolveSellerIdentities(ctx: JobContext): Promise<JobResult> {
  const payload = ResolveSellerIdentitiesPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode = payload.marketplaceCode as MarketplaceCode;
  const sellerRefs = [...new Set(payload.sellerRefs)];

  const source = getSellerIdentitySource(ctx.sellerIdentitySources, marketplaceCode);
  if (!source) return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };

  let ok = 0;
  let failed = 0;
  for (const [index, sellerRef] of sellerRefs.entries()) {
    const seller = await competitorSellersRepo.getCompetitorSeller(ctx.appDb, marketplaceCode, sellerRef);
    ctx.reportProgress({ done: index, total: sellerRefs.length, currentItem: seller?.sellerName ?? sellerRef });

    if (seller && (await sellerIdentitiesRepo.getSellerIdentity(ctx.appDb, seller.id))) {
      ok += 1;
      continue;
    }
    if (await resolveOneSeller(ctx, source, marketplaceCode, sellerRef, payload)) ok += 1;
    else failed += 1;
  }

  ctx.reportProgress({ done: sellerRefs.length, total: sellerRefs.length, currentItem: null });
  return { itemsTotal: sellerRefs.length, itemsOk: ok, itemsFailed: failed };
}
