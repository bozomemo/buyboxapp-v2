/** Run history table (doc 06 §7): filterable by job name and state. */
import { NextResponse } from 'next/server';
import { jobsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

/**
 * How many of the newest matching runs one response carries. Sent to the browser with the rows so
 * the screen's pager can say the list is capped rather than presenting the newest 200 runs as the
 * whole history.
 */
const RUN_HISTORY_LIMIT = 200;

export async function GET(request: Request) {
  const appDb = getAppDb();
  const url = new URL(request.url);
  const jobName = url.searchParams.get('jobName') ?? undefined;
  const state = url.searchParams.get('state') ?? undefined;
  const sinceMs = url.searchParams.get('sinceMs');

  const runs = await jobsRepo.listJobRuns(
    appDb,
    { jobName, state, sinceMs: sinceMs ? Number(sinceMs) : undefined },
    RUN_HISTORY_LIMIT,
  );
  return NextResponse.json({
    limit: RUN_HISTORY_LIMIT,
    runs: runs.map((r) => ({
      id: r.id,
      jobName: r.jobName,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      state: r.state,
      itemsTotal: r.itemsTotal,
      itemsOk: r.itemsOk,
      itemsFailed: r.itemsFailed,
      error: r.error,
      correlationId: r.correlationId,
    })),
  });
}
