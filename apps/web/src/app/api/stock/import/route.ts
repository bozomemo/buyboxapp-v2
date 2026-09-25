/**
 * Stock screen's "import from the configured source" action (doc 06 §3). Runs the same
 * `ImportStockItems` handler the scheduled worker cadence uses (packages/jobs), so a
 * UI-triggered import behaves identically to an automatic one — no separate import logic to
 * keep in sync. Preview (first 20 rows before committing) is served by the existing
 * `/api/setup/product-source/test` route, reused as-is.
 *
 * **The run is recorded in `job_runs`, like any other** (found 2026-09-20 testing the live
 * install's own configuration). It used to pass a freshly minted `correlationId` that named no
 * row, and `events.job_run_id` references `job_runs` — so the moment the handler logged anything
 * the insert failed the foreign key and the screen reported `FOREIGN KEY constraint failed`
 * instead of what happened. Every event the handler writes is on a path the operator can reach:
 * a `manual` source (the live install's setting) logs "this source has no bulk import", and any
 * per-item failure logs too. Recording the run fixes that at its cause and has a second effect
 * worth having on its own: an import somebody triggered by hand now appears in the Jobs screen's
 * history beside the scheduled ones, with the same counts (doc 06 §7).
 */
import { NextResponse } from 'next/server';
import { buildAdapterRegistry, IMPORT_STOCK_ITEMS_JOB, importStockItems, systemClock } from '@buybox/jobs';
import { jobsRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';

export async function POST(request: Request) {
  const body = await readJsonBody<{ sourceCode: string; sourceConfig: unknown }>(request);
  if (body === null) return invalidBody();
  const appDb = getAppDb();
  const runId = newId();
  const startedAt = systemClock.nowMs();

  await jobsRepo.startJobRun(appDb, {
    id: runId,
    jobName: IMPORT_STOCK_ITEMS_JOB,
    startedAt,
    finishedAt: null,
    state: 'running',
    itemsTotal: 0,
    itemsOk: 0,
    itemsFailed: 0,
    error: null,
    correlationId: runId,
    // No queue row: this run was triggered from the screen and executes here, so there is no
    // claim for an expiry sweep to close out.
    jobQueueId: null,
  });

  try {
    const result = await importStockItems({
      appDb,
      clock: systemClock,
      adapters: buildAdapterRegistry([]),
      correlationId: runId,
      payload: JSON.stringify({ sourceCode: body.sourceCode, sourceConfig: body.sourceConfig }),
      // The handler answers the browser with its finished result, and nothing polls this run
      // mid-flight. Progress is reporting only (see `JobContext.reportProgress`), so discarding
      // it is correct rather than merely convenient.
      reportProgress: () => undefined,
    });
    // A handler may finish *and* report a failure of the run as a whole (`JobResult.error`),
    // which is not the same as individual items failing — the run row has to say which happened.
    await jobsRepo.finishJobRun(appDb, runId, {
      state: result.error === undefined ? 'ok' : 'failed',
      finishedAt: systemClock.nowMs(),
      itemsTotal: result.itemsTotal,
      itemsOk: result.itemsOk,
      itemsFailed: result.itemsFailed,
      error: result.error ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await jobsRepo.finishJobRun(appDb, runId, {
      state: 'failed',
      finishedAt: systemClock.nowMs(),
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: message,
    });
    return NextResponse.json({ ok: false, error: message });
  }
}
