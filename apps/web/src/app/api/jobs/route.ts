/**
 * Jobs screen overview (doc 06 §7, doc 12 6.9): the catalog with each job's schedule,
 * last/next run, enabled state, plus queue depth and currently-claimed jobs.
 */
import { NextResponse } from 'next/server';
import { circuitBreakerRepo, configRepo, jobsRepo } from '@buybox/db';
import { JOB_CATALOG, jobEnabledSettingKey } from '@buybox/jobs';
import { getAppDb } from '@/lib/server/db';

export async function GET() {
  const appDb = getAppDb();
  const nowMs = Date.now();

  const [latestRuns, depth, claimed, circuitStates] = await Promise.all([
    jobsRepo.latestJobRunPerJobName(appDb),
    jobsRepo.queueDepthByState(appDb),
    jobsRepo.listClaimedJobs(appDb),
    circuitBreakerRepo.listCircuitBreakerStates(appDb),
  ]);
  const latestByName = new Map(latestRuns.map((r) => [r.jobName, r]));

  const jobs = await Promise.all(
    JOB_CATALOG.map(async (entry) => {
      const enabledSetting = await configRepo.getAppSetting(appDb, jobEnabledSettingKey(entry.jobName));
      const enabled = enabledSetting?.value !== 'false';
      const lastRun = latestByName.get(entry.jobName);
      const nextRunAt =
        entry.cadenceMs !== null && enabled
          ? (lastRun?.finishedAt ?? lastRun?.startedAt ?? nowMs) + entry.cadenceMs
          : null;
      return {
        jobName: entry.jobName,
        label: entry.label,
        cadenceMs: entry.cadenceMs,
        perMarketplace: entry.perMarketplace,
        defaultPayload: entry.defaultPayload,
        enabled,
        nextRunAt,
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

  return NextResponse.json({
    jobs,
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
