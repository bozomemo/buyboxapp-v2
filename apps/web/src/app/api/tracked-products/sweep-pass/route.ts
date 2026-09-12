/**
 * "Tur #12 — 1.240 / 4.679" — where the tracked-products screen gets the sweep's position
 * (doc 06 §12.2, doc 07 §7.4).
 *
 * The figure exists because the old answer was unavailable anywhere: the sweep read 300 products
 * an hour out of a catalogue of 4,679, the Jobs screen reported the run's own 300 as its total,
 * and "how far through my catalogue is this?" had no home. A pass row carries the plan, the work
 * done, and — once closed — how long a full lap actually took.
 *
 * Read-only and cheap: one row per marketplace, plus the previous few for the "önceki tur" line.
 * The estimate is computed from **this pass's own observed rate**, never from a configured
 * requests-per-minute: the two differ by a factor of four on the operator's machine (a page load
 * is the bound, not the rate limit), and a prediction built from the limit would promise a
 * finishing time the machine cannot reach.
 */
import { NextResponse } from 'next/server';
import { trackedProductsRepo } from '@buybox/db';
import { estimateFinishAtMs } from '@/lib/sweep-pass';
import { getAppDb } from '@/lib/server/db';

/** How many earlier passes to summarise beside the current one. */
const HISTORY_LIMIT = 5;

export async function GET(request: Request) {
  const appDb = getAppDb();
  const marketplaceCode = new URL(request.url).searchParams.get('marketplaceCode') ?? 'trendyol';

  const passes = await trackedProductsRepo.listTrackedScrapePasses(appDb, marketplaceCode, HISTORY_LIMIT + 1);
  const current = passes[0];
  if (!current) {
    return NextResponse.json({ marketplaceCode, current: null, previous: [] });
  }

  const nowMs = Date.now();

  return NextResponse.json({
    marketplaceCode,
    current: {
      passNo: current.passNo,
      startedAt: current.startedAt,
      finishedAt: current.finishedAt,
      plannedCount: current.plannedCount,
      doneCount: current.doneCount,
      okCount: current.okCount,
      failedCount: current.failedCount,
      changedCount: current.changedCount,
      estimatedFinishAtMs: estimateFinishAtMs(current, nowMs),
    },
    previous: passes
      .slice(1)
      .filter((pass) => pass.finishedAt !== null)
      .map((pass) => ({
        passNo: pass.passNo,
        doneCount: pass.doneCount,
        durationMs: pass.finishedAt! - pass.startedAt,
      })),
  });
}
