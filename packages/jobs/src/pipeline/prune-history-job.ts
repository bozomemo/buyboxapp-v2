/**
 * `PruneHistory` (doc 07 §1) — the nightly job wrapper around `packages/db`'s
 * `pruneHistory`, which already implements every retention window in doc 05 §10.
 */
import { DEFAULT_RETENTION_WINDOWS, pruneHistory, type RetentionWindows } from '@buybox/db';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';

export const PRUNE_HISTORY_JOB = 'PruneHistory';

const RetentionWindowsSchema = z.object({
  priceSubmissionsDays: z.number().int().min(1),
  buyboxObservationsDays: z.number().int().min(1),
  // Defaulted, not required, unlike its neighbours: this window was added after installs were
  // already storing a `retention.windows` setting, and a stored object written before it
  // existed must keep parsing. Without the default such a payload fails validation and the
  // nightly prune stops running altogether — every window silently unenforced, which is a far
  // worse outcome than one window falling back to its documented default.
  competitorObservationsDays: z.number().int().min(1).default(90),
  trackedProductObservationsDays: z.number().int().min(1).default(90),
  // Defaulted for the same reason as the two above: a stored payload written before this
  // window existed must keep pruning everything else rather than failing the whole run.
  trackedProductMetricsDays: z.number().int().min(1).default(365),
  appEventsInfoDebugDays: z.number().int().min(1),
  appEventsWarnErrorDays: z.number().int().min(1),
  jobRunsDays: z.number().int().min(1),
  jobQueueFinishedDays: z.number().int().min(1),
});

export const PruneHistoryPayloadSchema = z.object({
  windows: RetentionWindowsSchema.default(DEFAULT_RETENTION_WINDOWS),
});

export async function pruneHistoryJob(ctx: JobContext): Promise<JobResult> {
  const payload = PruneHistoryPayloadSchema.parse(JSON.parse(ctx.payload || '{}'));
  const windows: RetentionWindows = payload.windows;
  await pruneHistory(ctx.appDb, windows, ctx.clock.nowMs());
  return { itemsTotal: 1, itemsOk: 1, itemsFailed: 0 };
}
