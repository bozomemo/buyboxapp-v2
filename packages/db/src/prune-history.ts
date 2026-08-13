/**
 * PruneHistory (doc 12 Phase 3.6, doc 05 §10) — enforces every retention window in one
 * place. `competitor_observations` and `scrape_runs` are retained indefinitely and are
 * deliberately not touched here (doc 10 §5: "every scrape retained ... never overwritten").
 * Windows are configurable — the caller supplies them, this function has no built-in
 * defaults, so "every retention window is configurable" holds without duplicating the
 * numbers doc 05 §10 lists as defaults.
 */
import type { AppDatabase } from './client.js';
import { prunePriceSubmissions } from './repositories/repricing.js';
import { pruneBuyboxObservations } from './repositories/competition.js';
import { pruneFinishedJobs, pruneJobRuns } from './repositories/jobs.js';
import { pruneEvents } from './repositories/events.js';

export interface RetentionWindows {
  readonly priceSubmissionsDays: number;
  readonly buyboxObservationsDays: number;
  readonly appEventsInfoDebugDays: number;
  readonly appEventsWarnErrorDays: number;
  readonly jobRunsDays: number;
  readonly jobQueueFinishedDays: number;
}

/** doc 05 §10's defaults — a starting point, not a hard-coded policy; see the module note. */
export const DEFAULT_RETENTION_WINDOWS: RetentionWindows = {
  priceSubmissionsDays: 60,
  buyboxObservationsDays: 90,
  appEventsInfoDebugDays: 90,
  appEventsWarnErrorDays: 365,
  jobRunsDays: 90,
  jobQueueFinishedDays: 7,
};

function daysAgo(nowMs: number, days: number): number {
  return nowMs - days * 24 * 60 * 60 * 1000;
}

export async function pruneHistory(
  appDb: AppDatabase,
  windows: RetentionWindows,
  nowMs: number,
): Promise<void> {
  await prunePriceSubmissions(appDb, daysAgo(nowMs, windows.priceSubmissionsDays));
  await pruneBuyboxObservations(appDb, daysAgo(nowMs, windows.buyboxObservationsDays));
  await pruneEvents(
    appDb,
    daysAgo(nowMs, windows.appEventsInfoDebugDays),
    daysAgo(nowMs, windows.appEventsWarnErrorDays),
  );
  await pruneJobRuns(appDb, daysAgo(nowMs, windows.jobRunsDays));
  await pruneFinishedJobs(appDb, daysAgo(nowMs, windows.jobQueueFinishedDays));
}
