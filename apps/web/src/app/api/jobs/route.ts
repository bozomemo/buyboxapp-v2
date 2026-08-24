/**
 * Jobs screen overview (doc 06 §7, doc 12 6.9): the catalog with each job's schedule,
 * last/next run, enabled state, plus queue depth and currently-claimed jobs.
 */
import { NextResponse } from 'next/server';
import { circuitBreakerRepo, configRepo, jobsRepo } from '@buybox/db';
import { getJobCadenceMs, JOB_CATALOG, jobCadenceSettingKey, jobEnabledSettingKey } from '@buybox/jobs';
import { isSystemPaused } from '@buybox/jobs';
import { getAppDb } from '@/lib/server/db';
import { getWorkerStatus } from '@/lib/server/worker-status';

export async function GET() {
  const appDb = getAppDb();
  const nowMs = Date.now();

  const [latestRuns, depth, active, runningRuns, circuitStates] = await Promise.all([
    jobsRepo.latestJobRunPerJobName(appDb),
    jobsRepo.queueDepthByState(appDb),
    jobsRepo.listActiveJobs(appDb),
    jobsRepo.listRunningJobRuns(appDb),
    circuitBreakerRepo.listCircuitBreakerStates(appDb),
  ]);
  const latestByName = new Map(latestRuns.map((r) => [r.jobName, r]));
  const claimed = active.filter((j) => j.state === 'locked');
  // Both halves of "this job is busy", kept separate because they mean different things to the
  // operator: `queued` is a row the worker has not picked up yet (a manual run spends up to one
  // scheduler tick here — `Scheduler.startLoop`'s 2s), `running` is a handler actually
  // executing. The Run button is disabled on either, so it stays disabled across a page reload
  // and for cadence-triggered runs this browser never started.
  const queuedByName = new Set(active.filter((j) => j.state === 'ready').map((j) => j.jobName));
  const runningByName = new Map(runningRuns.map((r) => [r.jobName, r]));

  const jobs = await Promise.all(
    JOB_CATALOG.map(async (entry) => {
      const enabledSetting = await configRepo.getAppSetting(appDb, jobEnabledSettingKey(entry.jobName));
      // Same precedence as `isJobEnabled` in packages/jobs: a stored setting wins, otherwise
      // the catalogue default — which is off for `ScrapeCompetitors` (api-references §1.6).
      const enabled =
        enabledSetting?.value === 'false'
          ? false
          : enabledSetting?.value === 'true'
            ? true
            : entry.defaultEnabled;
      const lastRun = latestByName.get(entry.jobName);
      const runningRun = runningByName.get(entry.jobName);
      // Effective cadence: an operator override (doc 07 §8) if stored, else the catalog default.
      const [cadenceMs, cadenceSetting] = await Promise.all([
        getJobCadenceMs(appDb, entry.jobName),
        entry.cadenceMs !== null ? configRepo.getAppSetting(appDb, jobCadenceSettingKey(entry.jobName)) : undefined,
      ]);
      const nextRunAt =
        cadenceMs !== null && enabled
          ? (lastRun?.finishedAt ?? lastRun?.startedAt ?? nowMs) + cadenceMs
          : null;
      return {
        jobName: entry.jobName,
        label: entry.label,
        cadenceMs,
        isCadenceOverride: cadenceSetting !== undefined,
        defaultCadenceMs: entry.cadenceMs,
        perMarketplace: entry.perMarketplace,
        defaultPayload: entry.defaultPayload,
        enabled,
        nextRunAt,
        queued: queuedByName.has(entry.jobName),
        activeRun: runningRun
          ? {
              id: runningRun.id,
              startedAt: runningRun.startedAt,
              itemsTotal: runningRun.itemsTotal,
              itemsDone: runningRun.itemsDone ?? 0,
              currentItem: runningRun.currentItem ?? null,
              progressAt: runningRun.progressAt ?? null,
            }
          : null,
        lastRun: lastRun
          ? {
              id: lastRun.id,
              startedAt: lastRun.startedAt,
              finishedAt: lastRun.finishedAt,
              state: lastRun.state,
              itemsTotal: lastRun.itemsTotal,
              itemsOk: lastRun.itemsOk,
              itemsFailed: lastRun.itemsFailed,
              error: lastRun.error,
            }
          : null,
      };
    }),
  );

  // Everything the Jobs screen needs to explain "queued, but nothing happens" without the
  // operator having to guess. Each of these has silently held the whole queue at least once.
  const worker = getWorkerStatus();
  const scheduler = {
    ...worker,
    systemPaused: await isSystemPaused(appDb),
  };

  return NextResponse.json({
    jobs,
    scheduler,
    queueDepth: depth,
    claimed: claimed.map((j) => ({
      id: j.id,
      jobName: j.jobName,
      lockedBy: j.lockedBy,
      lockedUntil: j.lockedUntil,
      attempts: j.attempts,
    })),
    circuitBreakers: circuitStates.map((c) => ({
      marketplaceCode: c.marketplaceCode,
      state: c.state,
      consecutiveFailures: c.consecutiveFailures,
      openedAt: c.openedAt,
      lastError: c.lastError,
      updatedAt: c.updatedAt,
    })),
  });
}
