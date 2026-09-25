/**
 * `SweepListedProducts` — the listings lane (doc 07 §7.5, doc 17 §4.2).
 *
 * The same pass loop as `SweepTrackedProducts` (`runSweepPass` in `sweep-pass.ts`), over a smaller
 * candidate set: active tracked products that are **linked to a brand product or marked
 * favourite** — the İlanlar set (doc 17 §4.1) — instead of the whole catalogue. Its passes are
 * `tracked_scrape_passes` rows with `scope = 'listed'`; the catalogue sweep's are `scope = 'all'`.
 *
 * - **Both lanes may run at once.** Different job names, so `countActiveJobsForTarget` never
 *   makes one wait for the other. They read through the **same source instance and its one shared
 *   rate limiter**, so running both does not raise the request rate — it only means the listings
 *   lane is not queued behind a catalogue pass that takes hours.
 * - **They share the cursor column.** Both advance `tracked_products.last_scraped_at`, so a card
 *   either lane has read since a pass opened is done for the other lane's pass too.
 * - **Cadence 30 min, not continuous** (`job-catalog.ts`). A listings pass over tens of cards
 *   finishes in minutes; at the catalogue sweep's 60 s cadence it would re-read the same pages all
 *   day. The cadence is the gap between pass *starts*.
 * - Consecutive-failure guard, `is_active` handling and disabled-by-default are exactly the
 *   catalogue sweep's — see `sweep-tracked-products.ts`'s doc comment.
 *
 * **Band evaluation is not here.** Doc 07 §7.5 describes it running inside this same read; it
 * lands with `evaluateBand` and `band_violations` in build-plan Phase 11.6, once those exist to
 * evaluate against. Until then this job only keeps İlanlar's prices and seller data fresh.
 *
 * ⚠️ **Reporting only**, on the terms of doc 07 §7. It reads `tracked_products` and never
 * `listings`.
 */
import { trackedProductsRepo } from '@buybox/db';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';
import { SCRAPE_TRACKED_CHUNK, SCRAPE_TRACKED_CONCURRENCY } from '../scrape-config.js';
import { runSweepPass } from './sweep-pass.js';

export const SWEEP_LISTED_PRODUCTS_JOB = 'SweepListedProducts';

export const SweepListedProductsPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  chunkSize: z.number().int().min(1).default(SCRAPE_TRACKED_CHUNK),
  concurrency: z.number().int().min(1).max(10).default(SCRAPE_TRACKED_CONCURRENCY),
  /**
   * Stop this run after this many products, leaving the pass open for the next one. Far above a
   * plausible İlanlar size (doc 17's example: ~50 of a brand's 1,000 cards) — it exists only so a
   * `job_runs` row cannot grow without bound, and so tests can drive a run to completion in one
   * step. See `sweep-tracked-products.ts`'s copy of this field for the full reasoning.
   */
  maxProductsPerRun: z.number().int().min(1).default(50_000),
});

export type SweepListedProductsPayload = z.infer<typeof SweepListedProductsPayloadSchema>;

export async function sweepListedProducts(ctx: JobContext): Promise<JobResult> {
  const payload = SweepListedProductsPayloadSchema.parse(JSON.parse(ctx.payload));
  return runSweepPass(ctx, payload, {
    scope: 'listed',
    onlyListed: true,
    eventCodes: {
      started: 'ListedSweepPassStarted',
      completed: 'ListedSweepPassCompleted',
      halted: 'ListedSweepHalted',
    },
    passNoun: 'Listings sweep',
    countCandidates: trackedProductsRepo.countListedTrackedProducts,
  });
}
