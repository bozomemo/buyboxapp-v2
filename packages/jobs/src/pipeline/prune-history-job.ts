/**
 * `PruneHistory` (doc 07 §1) — the nightly job wrapper around `packages/db`'s
 * `pruneHistory`, which already implements every retention window in doc 05 §10.
 *
 * Which windows apply, first match wins: a `windows` object in the payload (a manual run), the
 * operator's `retention.windows` setting (Settings > Retention, doc 06 §9), doc 05 §10's
 * defaults. The middle step was missing until 2026-10-03: the scheduler enqueues this job with
 * `'{}'`, so every nightly run fell through to the defaults and the settings screen saved windows
 * nothing ever read — showing an operator a retention policy the install was not applying.
 */
import {
  configRepo,
  DEFAULT_RETENTION_WINDOWS,
  eventsRepo,
  newId,
  pruneHistory,
  type AppDatabase,
  type RetentionWindows,
} from '@buybox/db';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';

export const PRUNE_HISTORY_JOB = 'PruneHistory';

/** The `app_settings` key Settings > Retention writes and this job reads. */
export const RETENTION_WINDOWS_SETTING_KEY = 'retention.windows';

/** Exported so the retention settings screen validates with exactly what this job will parse. */
export const RetentionWindowsSchema = z.object({
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
  // Defaulted like the windows above: added 2026-09-27, after installs already stored this setting.
  authEventsDays: z.number().int().min(1).default(365),
});

export const PruneHistoryPayloadSchema = z.object({
  windows: RetentionWindowsSchema.optional(),
});

/**
 * The operator's stored windows, parsed with the schema the settings route validates with, so a
 * window added after the setting was saved takes its default rather than `undefined`.
 * `undefined` when nothing is stored, or when what is stored no longer parses — the second is
 * also written to `app_events`, because falling back silently is exactly how this setting went
 * unread for a week without anyone noticing.
 */
export async function readRetentionWindowsSetting(
  appDb: AppDatabase,
  nowMs: number,
): Promise<RetentionWindows | undefined> {
  const setting = await configRepo.getAppSetting(appDb, RETENTION_WINDOWS_SETTING_KEY);
  if (!setting) return undefined;
  let parsed: ReturnType<typeof RetentionWindowsSchema.safeParse> | undefined;
  try {
    parsed = RetentionWindowsSchema.safeParse(JSON.parse(setting.value));
  } catch {
    parsed = undefined;
  }
  if (parsed?.success) return parsed.data;
  await eventsRepo.logEvent(appDb, {
    id: newId(),
    at: nowMs,
    level: 'warn',
    marketplaceCode: null,
    listingId: null,
    jobRunId: null,
    code: 'RetentionSettingInvalid',
    message: 'Kayıtlı saklama süreleri okunamadı; geçmiş temizliği varsayılan sürelerle çalıştı.',
    context: JSON.stringify({ key: RETENTION_WINDOWS_SETTING_KEY }),
  });
  return undefined;
}

export async function pruneHistoryJob(ctx: JobContext): Promise<JobResult> {
  const payload = PruneHistoryPayloadSchema.parse(JSON.parse(ctx.payload || '{}'));
  const nowMs = ctx.clock.nowMs();
  const windows: RetentionWindows =
    payload.windows ?? (await readRetentionWindowsSetting(ctx.appDb, nowMs)) ?? DEFAULT_RETENTION_WINDOWS;
  await pruneHistory(ctx.appDb, windows, nowMs);
  return { itemsTotal: 1, itemsOk: 1, itemsFailed: 0 };
}
