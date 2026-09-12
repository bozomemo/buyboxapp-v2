/**
 * `SweepTrackedProducts` — read every tracked product of a marketplace, in **passes** that start
 * again as soon as they finish (doc 07 §7.4, operator request 2026-09-12).
 *
 * ```
 * pass = the open pass, or a new one stamped at now
 * loop:
 *     chunk = active products of this marketplace not looked at since pass.started_at  (100)
 *     if chunk is empty: close the pass; a later run opens the next one
 *     scrapeTrackedProducts(ids = chunk)            ← the same read §7.1 and §7.3 do
 * ```
 *
 * ## What this replaces, and why the old shape could not be fixed in place
 *
 * Until now the tracked read was the second half of `ScrapeCompetitors`: hourly, and capped at
 * `SCRAPE_MAX_TRACKED_PER_RUN` (300) products a run. On the operator-curated list of a few dozen
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
import type { MarketplaceCode } from '@buybox/core';
import { eventsRepo, newId, trackedProductsRepo } from '@buybox/db';
import { z } from 'zod';
import { getCompetitorSource } from '../competitor-source-registry.js';
import type { JobContext, JobResult } from '../job.js';
import { SCRAPE_TRACKED_CHUNK, SCRAPE_TRACKED_CONCURRENCY } from '../scrape-config.js';
import { scrapeTrackedProducts } from './scrape-tracked-products.js';
import { byRotationPriority } from './tracked-rotation.js';

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

async function notePassEvent(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  code: string,
  message: string,
  context: Record<string, unknown>,
  level: 'info' | 'warn' = 'info',
): Promise<void> {
  await eventsRepo.logEvent(ctx.appDb, {
    id: newId(),
    at: ctx.clock.nowMs(),
    level,
    marketplaceCode,
    listingId: null,
    jobRunId: ctx.correlationId,
    code,
    message,
    context: JSON.stringify(context),
  });
}

/**
 * The pass this run should work on: the open one if there is one, otherwise a fresh one.
 *
 * Resuming an open pass rather than opening a new one on every run is the whole point — a new
 * pass would move the cursor to now and mark the entire catalogue as owed a look again, which is
 * the 2026-08-28 failure exactly. A pass is only ever closed by emptying, in `sweepTrackedProducts`
 * below.
 */
async function openOrResumePass(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
): Promise<trackedProductsRepo.TrackedScrapePassRow> {
  const latest = await trackedProductsRepo.latestTrackedScrapePass(ctx.appDb, marketplaceCode);
  if (latest && latest.finishedAt === null) return latest;

  const startedAt = ctx.clock.nowMs();
  const pass: trackedProductsRepo.TrackedScrapePassRow = {
    id: newId(),
    marketplaceCode,
    passNo: (latest?.passNo ?? 0) + 1,
    startedAt,
    finishedAt: null,
    // The whole active catalogue, not what is outstanding: see `countActiveTrackedProducts`.
    plannedCount: await trackedProductsRepo.countActiveTrackedProducts(ctx.appDb, marketplaceCode),
    doneCount: 0,
    okCount: 0,
    failedCount: 0,
    changedCount: 0,
  };
  await trackedProductsRepo.insertTrackedScrapePass(ctx.appDb, pass);
  await notePassEvent(
    ctx,
    marketplaceCode,
    'TrackedSweepPassStarted',
    `Tracked-product sweep pass #${pass.passNo} started over ${pass.plannedCount} product(s)`,
    { passNo: pass.passNo, plannedCount: pass.plannedCount },
  );
  return pass;
}

/**
 * One chunk's candidates: the products this pass still owes a look, most overdue first.
 *
 * Two filters that do not overlap, and both are needed. The **pass cursor** decides what is still
 * owed a look at all; `byRotationPriority` decides in what order the remainder is read. Since
 * 2026-09-12 the weights no longer decide *whether* a product is read in a given lap — every
 * active product is read exactly once per pass — only how early in the pass it is reached, which
 * is what the operator asked for and what makes "hepsi gezildi" true of every pass.
 *
 * Re-queried per chunk rather than listed once at the pass's start, so a product a brand sweep
 * added, an operator paused, or a rescan already read mid-pass is honoured within a chunk.
 */
async function nextChunk(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  pass: trackedProductsRepo.TrackedScrapePassRow,
  limit: number,
): Promise<trackedProductsRepo.TrackedProductRow[]> {
  const outstanding = await trackedProductsRepo.listProductsToScrape(ctx.appDb, {
    marketplaceCode,
    notScrapedSinceMs: pass.startedAt,
  });
  return byRotationPriority(outstanding, ctx.clock.nowMs()).slice(0, limit);
}

export async function sweepTrackedProducts(ctx: JobContext): Promise<JobResult> {
  const payload = SweepTrackedProductsPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode = payload.marketplaceCode as MarketplaceCode;

  const source = getCompetitorSource(ctx.competitorSources, marketplaceCode);
  if (!source) {
    // A marketplace with no competitor source is a supported deployment, not a failure — the
    // same posture `scrapeCompetitors` and `rescanTrackedProducts` take. Deliberately before the
    // pass is opened: a pass nothing can read would close empty and burn a pass number.
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }

  const pass = await openOrResumePass(ctx, marketplaceCode);

  let itemsOk = 0;
  let itemsFailed = 0;
  let itemsRemoved = 0;
  let processed = 0;

  while (processed < payload.maxProductsPerRun) {
    const chunk = await nextChunk(
      ctx,
      marketplaceCode,
      pass,
      Math.min(payload.chunkSize, payload.maxProductsPerRun - processed),
    );

    if (chunk.length === 0) {
      // The pass is finished: every active product has been looked at since it opened. Closed
      // here and not reopened in the same run, so the closing is durable before the next pass's
      // cursor exists — a crash between the two costs a minute, never a double-counted lap.
      const finishedAt = ctx.clock.nowMs();
      await trackedProductsRepo.finishTrackedScrapePass(ctx.appDb, pass.id, finishedAt);
      const durationMs = finishedAt - pass.startedAt;
      await notePassEvent(
        ctx,
        marketplaceCode,
        'TrackedSweepPassCompleted',
        `Tracked-product sweep pass #${pass.passNo} completed: ${pass.doneCount + processed} product(s) in ${Math.round(durationMs / 60_000)} min`,
        {
          passNo: pass.passNo,
          plannedCount: pass.plannedCount,
          doneCount: pass.doneCount + processed,
          durationMs,
        },
      );
      break;
    }

    const result = await scrapeTrackedProducts(ctx, marketplaceCode, source, {
      ids: chunk.map((product) => product.id),
      concurrency: payload.concurrency,
      // One counter across every chunk of the pass, and a denominator that is the catalogue
      // rather than the chunk — the figure the operator is actually asking for.
      progressOffset: pass.doneCount + processed,
      progressTotal: Math.max(pass.plannedCount, pass.doneCount + processed + chunk.length),
    });

    itemsOk += result.itemsOk;
    itemsFailed += result.itemsFailed;
    itemsRemoved += result.itemsRemoved;
    processed += result.itemsTotal;

    // Written per chunk, not per run: a pass outlives the run working on it, and its counters
    // have to survive a restart for the screens to keep telling the truth across one.
    await trackedProductsRepo.addTrackedScrapePassProgress(ctx.appDb, pass.id, {
      done: result.itemsTotal,
      ok: result.itemsOk,
      failed: result.itemsFailed,
      changed: result.itemsChanged,
    });

    /**
     * A whole chunk with nothing to show for it means the source is gone, not the page.
     *
     * `scrapeTrackedProducts` already stops its own chunk at
     * `SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT`; that guard would otherwise be re-entered a
     * hundred products at a time here, for the whole remaining catalogue — the exact failure the
     * constant was written for (a headless browser that died mid-run), just paced differently.
     *
     * The run ends; the **pass stays open**. The products not reached keep their old
     * `last_scraped_at`, so they are the first candidates when the next run starts a minute
     * later, and the pass resumes rather than restarting.
     */
    if (result.itemsOk === 0 && result.itemsFailed > 0) {
      await notePassEvent(
        ctx,
        marketplaceCode,
        'TrackedSweepHalted',
        `Tracked-product sweep stopped at ${pass.doneCount + processed}/${pass.plannedCount} of pass #${pass.passNo} — a whole chunk of ${result.itemsTotal} products failed, the source looks unavailable; the pass stays open and resumes`,
        { passNo: pass.passNo, chunkSize: result.itemsTotal },
        'warn',
      );
      break;
    }

    if (result.itemsTotal === 0) {
      /**
       * A chunk came back but nothing in it was read — only reachable if every row in it vanished
       * between the two queries, or if `last_scraped_at` stopped advancing. Either way the loop
       * would not make progress, so it stops rather than spinning on the same chunk. The pass
       * stays open; the next run re-reads the candidate set from scratch.
       */
      break;
    }
  }

  // Deliberately no `error`: individual page failures never fail the run (doc 07 §7). What this
  // run reports is its own work — the pass's total lives on the pass row, which is what the
  // screens read.
  return {
    itemsTotal: processed + itemsRemoved,
    itemsOk,
    itemsFailed,
  };
}
