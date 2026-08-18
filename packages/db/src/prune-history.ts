/**
 * PruneHistory (doc 12 Phase 3.6, doc 05 §10) — enforces every retention window in one
 * place. Windows are configurable — the caller supplies them, this function has no built-in
 * defaults, so "every retention window is configurable" holds without duplicating the
 * numbers doc 05 §10 lists as defaults.
 *
 * `scrape_runs` is still retained indefinitely: it is the proof-of-look row (doc 10 §5), it is
 * small, and every coverage figure and alert snapshot is anchored to it.
 * `competitor_observations` is **no longer** indefinite. That policy was written for a
 * 64-listing catalogue; measured against the live archive it costs roughly 32,000 rows a day
 * at the 2,000-listing target, or ~12M rows a year, and the reports that justify keeping it
 * that long read summaries rather than raw rows. Raw offers age out on a window like
 * everything else, and the long-term memory becomes the daily rollup (doc 05 §10).
 */
import type { AppDatabase } from './client.js';
import { prunePriceSubmissions } from './repositories/repricing.js';
import { pruneBuyboxObservations, pruneCompetitorObservations } from './repositories/competition.js';
import { pruneFinishedJobs, pruneJobRuns } from './repositories/jobs.js';
import { pruneEvents } from './repositories/events.js';

export interface RetentionWindows {
  readonly priceSubmissionsDays: number;
  readonly buyboxObservationsDays: number;
  readonly competitorObservationsDays: number;
  readonly appEventsInfoDebugDays: number;
  readonly appEventsWarnErrorDays: number;
  readonly jobRunsDays: number;
  readonly jobQueueFinishedDays: number;
}

/** doc 05 §10's defaults — a starting point, not a hard-coded policy; see the module note. */
export const DEFAULT_RETENTION_WINDOWS: RetentionWindows = {
  priceSubmissionsDays: 60,
  buyboxObservationsDays: 90,
  competitorObservationsDays: 90,
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
  await pruneCompetitorObservations(appDb, daysAgo(nowMs, windows.competitorObservationsDays));
  await pruneEvents(
    appDb,
    daysAgo(nowMs, windows.appEventsInfoDebugDays),
    daysAgo(nowMs, windows.appEventsWarnErrorDays),
  );
  await pruneJobRuns(appDb, daysAgo(nowMs, windows.jobRunsDays));
  await pruneFinishedJobs(appDb, daysAgo(nowMs, windows.jobQueueFinishedDays));
}
