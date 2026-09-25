/**
 * The pass loop shared by `SweepTrackedProducts` (doc 07 §7.4) and `SweepListedProducts`
 * (doc 07 §7.5, doc 17 §4.2) — "the same implementation with a different candidate set."
 *
 * ```
 * pass = the open pass of this scope, or a new one stamped at now
 * loop:
 *     chunk = candidates of this marketplace and scope not looked at since pass.started_at (100)
 *     if chunk is empty: close the pass; a later run opens the next one
 *     scrapeTrackedProducts(ids = chunk)            ← the same read §7.1 and §7.3 do
 * ```
 *
 * Both lanes advance the same `tracked_products.last_scraped_at` cursor and read through the same
 * source instance and its one shared rate limiter, so running both **does not raise the request
 * rate** the scraping exception was measured and authorised at (CLAUDE.md, api-references §1.6).
 * What differs between the two callers is only the candidate query (`onlyListed`) and the pass row
 * each one advances (`scope`) — `tracked_scrape_passes` numbers the two lanes independently, so a
 * card either lane reads counts as looked-at for the other's open pass without the two ever
 * fighting over the same row. See `sweep-tracked-products.ts`'s doc comment for the history of why
 * a pass — rather than a per-run product ceiling — is what makes this loop resumable.
 *
 * ⚠️ **Reporting only**, on the terms of doc 07 §7: it reads `tracked_products` and never
 * `listings`.
 */
import type { MarketplaceCode } from '@buybox/core';
import { eventsRepo, newId, trackedProductsRepo } from '@buybox/db';
import { getCompetitorSource } from '../competitor-source-registry.js';
import type { JobContext, JobResult } from '../job.js';
import { scrapeTrackedProducts } from './scrape-tracked-products.js';
import { byRotationPriority } from './tracked-rotation.js';

export interface SweepPassPayload {
  readonly marketplaceCode: MarketplaceCode;
  readonly chunkSize: number;
  readonly concurrency: number;
  readonly maxProductsPerRun: number;
}

export interface SweepPassOptions {
  readonly scope: trackedProductsRepo.ScrapePassScope;
  /** `false` for the whole catalogue (`SweepTrackedProducts`), `true` for İlanlar only. */
  readonly onlyListed: boolean;
  /** Event codes for the three points in a pass's life — kept exact so existing readers don't break. */
  readonly eventCodes: { readonly started: string; readonly completed: string; readonly halted: string };
  /** Used in event messages, e.g. "Tracked-product sweep" / "Listings sweep". */
  readonly passNoun: string;
  readonly countCandidates: (appDb: JobContext['appDb'], marketplaceCode: string) => Promise<number>;
}

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
 * The pass this run should work on: the open one of this scope, or a fresh one.
 *
 * Resuming an open pass rather than opening a new one on every run is the whole point — a new
 * pass would move the cursor to now and mark the entire candidate set as owed a look again, which
 * is the 2026-08-28 failure `sweep-tracked-products.ts` describes. A pass is only ever closed by
 * emptying, in `runSweepPass` below.
 */
async function openOrResumePass(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  options: SweepPassOptions,
): Promise<trackedProductsRepo.TrackedScrapePassRow> {
  const latest = await trackedProductsRepo.latestTrackedScrapePass(ctx.appDb, marketplaceCode, options.scope);
  if (latest && latest.finishedAt === null) return latest;

  const startedAt = ctx.clock.nowMs();
  const pass: trackedProductsRepo.TrackedScrapePassRow = {
    id: newId(),
    marketplaceCode,
    scope: options.scope,
    passNo: (latest?.passNo ?? 0) + 1,
    startedAt,
    finishedAt: null,
    plannedCount: await options.countCandidates(ctx.appDb, marketplaceCode),
    doneCount: 0,
    okCount: 0,
    failedCount: 0,
    changedCount: 0,
  };
  await trackedProductsRepo.insertTrackedScrapePass(ctx.appDb, pass);
  await notePassEvent(
    ctx,
    marketplaceCode,
    options.eventCodes.started,
    `${options.passNoun} pass #${pass.passNo} started over ${pass.plannedCount} product(s)`,
    { passNo: pass.passNo, plannedCount: pass.plannedCount },
  );
  return pass;
}

/**
 * One chunk's candidates: the products this pass still owes a look, most overdue first.
 *
 * Re-queried per chunk rather than listed once at the pass's start, so a product a brand sweep
 * added, an operator paused or favourited, or a rescan already read mid-pass is honoured within a
 * chunk. See `sweep-tracked-products.ts` for why ordering and the cursor are two separate filters.
 */
async function nextChunk(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  pass: trackedProductsRepo.TrackedScrapePassRow,
  limit: number,
  options: SweepPassOptions,
): Promise<trackedProductsRepo.TrackedProductRow[]> {
  const outstanding = await trackedProductsRepo.listProductsToScrape(ctx.appDb, {
    marketplaceCode,
    notScrapedSinceMs: pass.startedAt,
    onlyListed: options.onlyListed,
  });
  return byRotationPriority(outstanding, ctx.clock.nowMs()).slice(0, limit);
}

export async function runSweepPass(
  ctx: JobContext,
  payload: SweepPassPayload,
  options: SweepPassOptions,
): Promise<JobResult> {
  const marketplaceCode = payload.marketplaceCode;

  const source = getCompetitorSource(ctx.competitorSources, marketplaceCode);
  if (!source) {
    // A marketplace with no competitor source is a supported deployment, not a failure — the
    // same posture `scrapeCompetitors` and `rescanTrackedProducts` take. Deliberately before the
    // pass is opened: a pass nothing can read would close empty and burn a pass number.
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }

  const pass = await openOrResumePass(ctx, marketplaceCode, options);

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
      options,
    );

    if (chunk.length === 0) {
      // The pass is finished: every candidate has been looked at since it opened. Closed here and
      // not reopened in the same run, so the closing is durable before the next pass's cursor
      // exists — a crash between the two costs a minute, never a double-counted lap.
      const finishedAt = ctx.clock.nowMs();
      await trackedProductsRepo.finishTrackedScrapePass(ctx.appDb, pass.id, finishedAt);
      const durationMs = finishedAt - pass.startedAt;
      await notePassEvent(
        ctx,
        marketplaceCode,
        options.eventCodes.completed,
        `${options.passNoun} pass #${pass.passNo} completed: ${pass.doneCount + processed} product(s) in ${Math.round(durationMs / 60_000)} min`,
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
      // One counter across every chunk of the pass, and a denominator that is the candidate set
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
     * A whole chunk with nothing to show for it means the source is gone, not the page. The run
     * ends; the **pass stays open**. The products not reached keep their old `last_scraped_at`,
     * so they are the first candidates when the next run starts, and the pass resumes rather than
     * restarting. See `sweep-tracked-products.ts` for why this guard exists at all.
     */
    if (result.itemsOk === 0 && result.itemsFailed > 0) {
      await notePassEvent(
        ctx,
        marketplaceCode,
        options.eventCodes.halted,
        `${options.passNoun} stopped at ${pass.doneCount + processed}/${pass.plannedCount} of pass #${pass.passNo} — a whole chunk of ${result.itemsTotal} products failed, the source looks unavailable; the pass stays open and resumes`,
        { passNo: pass.passNo, chunkSize: result.itemsTotal },
        'warn',
      );
      break;
    }

    if (result.itemsTotal === 0) {
      // Only reachable if every row in the chunk vanished between the two queries, or if
      // `last_scraped_at` stopped advancing. Either way the loop would not make progress, so it
      // stops rather than spinning on the same chunk. The pass stays open.
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
