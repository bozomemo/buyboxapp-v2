/**
 * One run, live: its progress heartbeat plus the events it has logged so far — what the Jobs
 * screen's "Detaylar" panel polls while a job is in flight (doc 06 §7).
 *
 * The web app cannot observe the worker directly (they are separate processes, doc 10 §2), so
 * everything here is read back out of the tables the worker writes: `job_runs` for progress,
 * `app_events` joined by `job_run_id` for the narrative. That also means a finished run reads
 * exactly the same way as a live one — the panel needs no special case for a run that ended
 * between two polls.
 */
import { NextResponse } from 'next/server';
import { eventsRepo, jobsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

/** Enough to cover a full `SCRAPE_MAX_LISTINGS_PER_RUN` sweep's debug lines without unbounded growth. */
const MAX_EVENTS = 300;

export async function GET(request: Request) {
  const appDb = getAppDb();
  const runId = new URL(request.url).searchParams.get('runId');
  if (!runId) {
    return NextResponse.json({ error: 'runId gerekli.' }, { status: 400 });
  }

  const run = await jobsRepo.getJobRun(appDb, runId);
  if (!run) {
    return NextResponse.json({ error: 'Çalışma bulunamadı.' }, { status: 404 });
  }

  // `debug` deliberately: `ScrapeCompetitors` logs each page failure at debug (doc 07 §7's
  // "per-failure silence" applies to *alerting*, not to the diagnosis this panel exists for).
  const events = await eventsRepo.listEventsFiltered(appDb, { jobRunId: runId, minLevel: 'debug' }, MAX_EVENTS);

  return NextResponse.json({
    run: {
      id: run.id,
      jobName: run.jobName,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      state: run.state,
      itemsTotal: run.itemsTotal,
      itemsDone: run.itemsDone ?? 0,
      itemsOk: run.itemsOk,
      itemsFailed: run.itemsFailed,
      currentItem: run.currentItem ?? null,
      progressAt: run.progressAt ?? null,
      error: run.error,
    },
    events: events.map((e) => ({
      id: e.id,
      at: e.at,
      level: e.level,
      code: e.code,
      message: e.message,
      listingId: e.listingId,
    })),
  });
}
