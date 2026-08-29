/**
 * Manual trigger (doc 06 §7, doc 12 6.9 DoD: "Manual trigger ... work") — enqueues a job the
 * same way `Scheduler.enqueueNow` does (packages/jobs), just from this process instead of the
 * worker's: a row in `job_queue` is picked up by whichever process's `Scheduler.tick()` next
 * polls, regardless of which process inserted it.
 *
 * **One run of a job per target at a time.** A press while the same job is queued or running is
 * answered 409 rather than queued behind it. The scheduler's `countActiveJobs` guard covers only
 * the jobs it enqueues on a cadence, and its ticks do not wait for one another, so a second row
 * was claimed and started roughly one tick — two seconds — after the first: two concurrent runs
 * of the same job over the same data, from two clicks. `perMarketplace` jobs are scoped to their
 * marketplace so Trendyol and Hepsiburada stay independent, exactly as the worker's own tickers
 * are (`countActiveJobsForTarget`).
 */
import { NextResponse } from 'next/server';
import {
  DEFAULT_MAX_ATTEMPTS,
  IMPORT_STOCK_ITEMS_JOB,
  JOB_CATALOG,
  resolveImportStockItemsPayload,
} from '@buybox/jobs';
import { jobsRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as { jobName: string; marketplaceCode?: string; payload?: unknown };
  const entry = JOB_CATALOG.find((j) => j.jobName === body.jobName);
  if (!entry) {
    return NextResponse.json({ error: `Bilinmeyen iş: ${body.jobName}` }, { status: 400 });
  }
  if (entry.perMarketplace && !body.marketplaceCode) {
    return NextResponse.json({ error: 'Bu iş bir pazaryeri gerektirir.' }, { status: 400 });
  }

  const appDb = getAppDb();
  const nowMs = Date.now();

  const active = body.marketplaceCode
    ? await jobsRepo.countActiveJobsForTarget(appDb, entry.jobName, body.marketplaceCode)
    : await jobsRepo.countActiveJobs(appDb, entry.jobName);
  if (active > 0) {
    return NextResponse.json(
      { error: `${entry.label} zaten kuyrukta veya çalışıyor. İlerlemesi bu ekranda görünür.` },
      { status: 409 },
    );
  }

  // `ImportStockItems` is the one job whose payload cannot be a catalogue constant: it is the
  // product source the operator configured, and sending the catalogue's empty default failed the
  // handler's schema on every manual trigger (measured 2026-08-29). `null` means there is
  // genuinely nothing to run — no source configured, or one with no batch behind it (`manual`,
  // doc 10 §4) — which is worth saying rather than queueing a run that can only do nothing.
  let resolvedDefault: Record<string, unknown> = entry.defaultPayload;
  if (entry.jobName === IMPORT_STOCK_ITEMS_JOB && body.payload === undefined) {
    const configured = await resolveImportStockItemsPayload(appDb);
    if (!configured) {
      return NextResponse.json(
        {
          error:
            'Yapılandırılmış ürün kaynağından içe aktarılacak bir şey yok. Manuel kaynakta stok kalemleri Stok ekranından tek tek girilir.',
        },
        { status: 400 },
      );
    }
    resolvedDefault = configured;
  }

  const payload = {
    ...resolvedDefault,
    ...(body.marketplaceCode ? { marketplaceCode: body.marketplaceCode } : {}),
    ...(typeof body.payload === 'object' && body.payload !== null ? body.payload : {}),
  };
  const id = newId();
  await jobsRepo.enqueueJob(appDb, {
    id,
    jobName: entry.jobName,
    payload: JSON.stringify(payload),
    priority: 0,
    state: 'ready',
    runAfter: nowMs,
    lockedBy: null,
    lockedUntil: null,
    attempts: 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    lastError: null,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return NextResponse.json({ ok: true, id });
}
