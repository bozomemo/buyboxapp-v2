/**
 * `SweepTrackedProducts` — read every tracked product of a marketplace, in **passes** that start
 * again as soon as they finish (doc 07 §7.4, operator request 2026-09-12).
 *
 * The pass loop itself — cursor, chunking, the consecutive-failure guard, event logging — is
 * `runSweepPass` in `sweep-pass.ts`, shared with `SweepListedProducts` (§7.5). This file is only
 * the whole-catalogue candidate set (`onlyListed: false`) and the payload/job-name wiring.
 *
 * ## What this replaced, and why the old shape could not be fixed in place
 *
 * Until 2026-09-12 the tracked read was the second half of `ScrapeCompetitors`: hourly, and capped
 * at `SCRAPE_MAX_TRACKED_PER_RUN` (300) products a run. On the operator-curated list of a few dozen
 * products it was written for, that read everything every hour. `SweepBrandCatalogue` turned the
 * tracked set into a catalogue — 4,679 active Trendyol rows on the live install — and the cap
 * turned into a rotation taking a little under sixteen hours to come round, reporting "300 items"
 * on a screen whose reader wanted to know how far through the catalogue the system was.
 *
 * The cap itself was sound at the time: the *uncapped* run had already been measured, on
 * 2026-08-28, and it did not merely run long — it never reached its own end, the next cycle was
 * suppressed by `countActiveJobs`, and an earlier one died at `visibility timeout expired` after
 * nineteen hours with competitor collection stopped while every screen showed a job in progress.
 * What made that unrecoverable was not the length of the walk but that the walk had **no cursor**:
 * a restart, a retry or a requeue began the catalogue again from the top.
 *
 * A pass is exactly that missing cursor, and it is why the ceiling can now go:
 *
 * - **it terminates** — `recordTrackedProductLook` advances `last_scraped_at` on every look,
 *   success *or* failure, so the candidate set shrinks by precisely the work done and a product
 *   whose page 404s does not come back round inside the same pass;
 * - **it resumes** — the cursor is an instant on a durable row, so a worker restart mid-pass
 *   continues with what is left instead of re-reading thousands of pages;
 * - **it says how far along it is** — `planned_count` against `done_count` is the whole catalogue,
 *   which is the figure the Jobs screen and the tracked-products screen now show.
 *
 * The same shape as `ScrapeBrandSellers` (§7.3), one scope wider: that job walks one brand once,
 * on a button; this one walks a whole marketplace, for ever.
 *
 * ## Why it never idles
 *
 * `cadenceMs` is one minute and `Scheduler.tick` refuses to enqueue a job of a name that is still
 * active (`countActiveJobs`), so the next run is queued within a minute of the last one ending and
 * never while one is in flight. A pass that takes hours is one job run; the minute only governs
 * the gap between passes, and between the chunks a halted run gave up on.
 *
 * ⚠️ **Reporting only**, on the terms of doc 07 §7. It reads `tracked_products` and never
 * `listings`; there is no path from anything it writes to a pricing decision, and a failed page is
 * recorded while the walk continues. Disabled by default like every other scraping job — reading
 * the public page needs an explicit business decision (api-references §1.6).
 */
import { trackedProductsRepo } from '@buybox/db';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';
import { SCRAPE_TRACKED_CHUNK, SCRAPE_TRACKED_CONCURRENCY } from '../scrape-config.js';
import { runSweepPass } from './sweep-pass.js';

export const SWEEP_TRACKED_PRODUCTS_JOB = 'SweepTrackedProducts';

export const SweepTrackedProductsPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  /** Products per database page and per `scrapeTrackedProducts` call. */
  chunkSize: z.number().int().min(1).default(SCRAPE_TRACKED_CHUNK),
  /** How many products are read at once; see `SCRAPE_TRACKED_CONCURRENCY`. */
  concurrency: z.number().int().min(1).max(10).default(SCRAPE_TRACKED_CONCURRENCY),
  /**
   * Stop this run after this many products, leaving the pass open for the next one.
   *
   * **Not a rotation cap** — nothing is skipped, and the products not reached are the first
   * candidates of the very next run. It exists so that a `job_runs` row cannot grow without
   * bound on an install where a pass genuinely never ends (a catalogue growing faster than it is
   * read), and so tests can drive a run to completion in one step. Deliberately far above a
   * plausible pass.
   */
  maxProductsPerRun: z.number().int().min(1).default(50_000),
});

export type SweepTrackedProductsPayload = z.infer<typeof SweepTrackedProductsPayloadSchema>;

export async function sweepTrackedProducts(ctx: JobContext): Promise<JobResult> {
  const payload = SweepTrackedProductsPayloadSchema.parse(JSON.parse(ctx.payload));
  return runSweepPass(ctx, payload, {
    scope: 'all',
    onlyListed: false,
    eventCodes: {
      started: 'TrackedSweepPassStarted',
      completed: 'TrackedSweepPassCompleted',
      halted: 'TrackedSweepHalted',
    },
    passNoun: 'Tracked-product sweep',
    countCandidates: trackedProductsRepo.countActiveTrackedProducts,
  });
}
