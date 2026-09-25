/**
 * Claims left behind by a worker that is gone (2026-09-25).
 *
 * A claim's lock only lapses on wall-clock time, and the scheduler claims with the *longest*
 * visibility timeout any registered job asks for — six hours, for `SweepTrackedProducts`'
 * passes. So a worker stopped mid-run (a service restart, a closed dev server) left its claims
 * `locked` for up to six hours: the Jobs screen showed a run frozen at "6/47", "Şimdi çalıştır"
 * answered 409 and the cadence never enqueued another, measured on the live install that day.
 * Restarting the worker did not help, because the new one could not tell a dead holder from a
 * slow one.
 *
 * On one machine it can. A worker id names its process and host
 * (`worker-<pid>-<rand>@<host>`), so at startup every claim held by *this* host's worker whose
 * process no longer exists is expired, and the ordinary `requeueExpiredJobs` path returns it to
 * the queue and closes its run. Anything it cannot prove dead is left to its timeout: a worker on
 * another host, and a pid that was recycled by an unrelated process — the safe direction, since
 * the cost of guessing wrong the other way is two concurrent runs of the same job.
 */
import { jobsRepo, type AppDatabase } from '@buybox/db';

export function workerInstanceId(pid: number, host: string, random: string): string {
  return `worker-${pid}-${random}@${host}`;
}

export interface ParsedWorkerId {
  readonly pid: number;
  /** `null` for an id written before the host was part of it. */
  readonly host: string | null;
}

export function parseWorkerInstanceId(id: string): ParsedWorkerId | null {
  const match = /^worker-(\d+)-[a-z0-9]+(?:@(.+))?$/.exec(id);
  if (!match) return null;
  return { pid: Number(match[1]), host: match[2] ?? null };
}

export interface DeadWorkerCheck {
  readonly selfId: string;
  readonly host: string;
  /** `process.kill(pid, 0)` in production; injected so tests need no real processes. */
  readonly isPidAlive: (pid: number) => boolean;
  readonly nowMs: number;
}

/**
 * Expires the claims of every dead worker this host can vouch for, and returns their ids.
 *
 * An id with no host predates the host suffix. It is judged by pid on this machine all the same:
 * those ids were only ever written by installs that run one worker beside their database, and
 * leaving them alone would keep the very six-hour freeze this exists to end on the first restart
 * after an upgrade.
 */
export async function releaseLocksOfDeadLocalWorkers(
  appDb: AppDatabase,
  check: DeadWorkerCheck,
): Promise<string[]> {
  const released: string[] = [];
  for (const owner of await jobsRepo.listJobLockOwners(appDb)) {
    if (owner === check.selfId) continue;
    const parsed = parseWorkerInstanceId(owner);
    if (!parsed) continue;
    if (parsed.host !== null && parsed.host !== check.host) continue;
    if (check.isPidAlive(parsed.pid)) continue;
    await jobsRepo.expireJobLocksHeldBy(appDb, owner, check.nowMs);
    released.push(owner);
  }
  if (released.length > 0) await jobsRepo.requeueExpiredJobs(appDb, check.nowMs);
  return released;
}

/** `process.kill(pid, 0)` throws `ESRCH` for no such process; `EPERM` means it exists. */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
