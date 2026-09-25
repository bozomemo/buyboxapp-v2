/**
 * "Tur #12 — 1.240 / 4.679" — where the tracked-products and Jobs screens get a sweep's position
 * (doc 06 §12.2, doc 07 §7.4, §7.5).
 *
 * The figure exists because the old answer was unavailable anywhere: the sweep read 300 products
 * an hour out of a catalogue of 4,679, the Jobs screen reported the run's own 300 as its total,
 * and "how far through my catalogue is this?" had no home. A pass row carries the plan, the work
 * done, and — once closed — how long a full lap actually took.
 *
 * `scope` (`all` | `listed`, default `all`) picks which lane: `SweepTrackedProducts`' whole
 * catalogue or `SweepListedProducts`' İlanlar cards (doc 17 §4.2). The two number their passes
 * independently, so the Jobs screen calls this twice for its two progress bars.
 *
 * Read-only and cheap: one row per (marketplace, scope), plus the previous few for the "önceki
 * tur" line. The estimate is computed from **this pass's own observed rate**, never from a
 * configured requests-per-minute: the two differ by a factor of four on the operator's machine (a
 * page load is the bound, not the rate limit), and a prediction built from the limit would
 * promise a finishing time the machine cannot reach.
 */
import { NextResponse } from 'next/server';
import { trackedProductsRepo } from '@buybox/db';
import { estimateFinishAtMs } from '@/lib/sweep-pass';
import { getAppDb } from '@/lib/server/db';

/** How many earlier passes to summarise beside the current one. */
const HISTORY_LIMIT = 5;

export async function GET(request: Request) {
  const appDb = getAppDb();
  const params = new URL(request.url).searchParams;
  const marketplaceCode = params.get('marketplaceCode') ?? 'trendyol';
  const scope: trackedProductsRepo.ScrapePassScope = params.get('scope') === 'listed' ? 'listed' : 'all';

  const passes = await trackedProductsRepo.listTrackedScrapePasses(
    appDb,
    marketplaceCode,
    HISTORY_LIMIT + 1,
    scope,
  );
  const current = passes[0];
  if (!current) {
    return NextResponse.json({ marketplaceCode, scope, current: null, previous: [] });
  }

  const nowMs = Date.now();

  return NextResponse.json({
    marketplaceCode,
    scope,
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
