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
import {
  pruneTrackedProductMetrics,
  pruneTrackedProductObservations,
} from './repositories/tracked-products.js';

export interface RetentionWindows {
  readonly priceSubmissionsDays: number;
  readonly buyboxObservationsDays: number;
  readonly competitorObservationsDays: number;
  readonly trackedProductObservationsDays: number;
  readonly trackedProductMetricsDays: number;
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
  // Matches `competitorObservationsDays`: it is the same kind of data, observed the same way,
  // and read by the same kind of report. Added 2026-08-26 — this table previously had no
  // window at all and grew without bound (doc 05 §10's note).
  trackedProductObservationsDays: 90,
  // Longer than the observations above, deliberately: this series is change-detected, so it is
  // a fraction of their row count, and the question it answers — "is this product accumulating
  // ratings, and how fast?" — needs more than a quarter to be worth asking.
  trackedProductMetricsDays: 365,
  // Operator's policy, set 2026-09-03 (was 90/365). `app_events` is a *diagnostic* log, not an
  // audit trail — the audit trail is `price_submissions`, which keeps its own 60 days. Info and
  // debug rows exist to answer "what happened in the last few runs", a question nobody asks of a
  // three-month-old row, and they are the bulk of the table. Warn and error rows are kept ten
  // times longer because a fault that recurs monthly must still have its first occurrence on
  // record. These two windows are also the file logs' rough shape: WinSW keeps 30 rolled files.
  appEventsInfoDebugDays: 3,
  appEventsWarnErrorDays: 30,
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
  await pruneTrackedProductObservations(appDb, daysAgo(nowMs, windows.trackedProductObservationsDays));
  await pruneTrackedProductMetrics(appDb, daysAgo(nowMs, windows.trackedProductMetricsDays));
  await pruneEvents(
    appDb,
    daysAgo(nowMs, windows.appEventsInfoDebugDays),
    daysAgo(nowMs, windows.appEventsWarnErrorDays),
  );
  await pruneJobRuns(appDb, daysAgo(nowMs, windows.jobRunsDays));
  await pruneFinishedJobs(appDb, daysAgo(nowMs, windows.jobQueueFinishedDays));
}
