/**
 * Whether this process's embedded worker (doc 10 §1.1) is actually running, and against which
 * database.
 *
 * It exists because of a real failure on 2026-08-24: the worker started, held its scheduler
 * lock and ticked every two seconds for hours — against a *different* SQLite file from the one
 * the web half was writing jobs into. Both halves were healthy by every measure the product
 * had. The Jobs screen showed two jobs queued forever, `failed: 0`, and the log said
 * "embedded worker started". Nothing anywhere could answer "is the worker running, and is it
 * looking at my database?", so the answer had to be dug out of the SQLite file by hand.
 *
 * The split itself is now prevented (`appDataDir` in packages/db, and the wizard refuses a
 * relative SQLite path). This module is the second half of the fix: making the state visible,
 * so the next unforeseen way for the worker to go quiet is one screen away rather than two
 * hours away.
 *
 * `globalThis` for the same reason `db.ts` uses it — Next dev-mode module reloads.
 */
import { createLogger } from '@buybox/shared';
import type { WorkerHandle } from '@buybox/worker';

const logger = createLogger({ name: 'web.worker' });

declare global {
  var __buyboxWorkerHandle: WorkerHandle | undefined;
  /** In-flight restart, so two clicks cannot tear the worker down twice — see `restartWorker`. */
  var __buyboxWorkerRestart: Promise<RestartResult> | undefined;
}

export interface WorkerStatus {
  readonly running: boolean;
  /** Absolute SQLite path (or URL) the worker opened, when it is running. */
  readonly databaseTarget?: string;
  readonly startedAt?: string;
  readonly lastTickAt?: string;
  readonly msSinceLastTick?: number;
  /** Why the last tick stopped where it did: `ran`, `no-lock`, `paused`, `unlicensed`. */
  readonly lastTickOutcome?: string;
  /**
   * The marketplace codes the running worker actually holds an adapter for.
   *
   * Reported for the same reason `databaseTarget` is. A marketplace is enabled in the database
   * and its credentials live in the secret store, and the two can disagree: an enabled row whose
   * credentials are absent or unreadable leaves `buildAdapters` with nothing to register, and
   * every job for that marketplace then fails with `No marketplace adapter registered for
   * "trendyol"` while Settings > Marketplaces still shows it ticked, with a merchant ref, next
   * to a green "Sistem Çalışıyor". Nothing on any screen compared the two, so the contradiction
   * could only be found in the job errors. Seen on a live install 2026-09-02.
   */
  readonly marketplaces?: string[];
}

/**
 * The cadence the running worker is actually firing each job at, keyed by job name — empty when
 * no worker runs in this process. See `WorkerHandle.cadenceMsByJobName` for why this is reported
 * rather than read from `app_settings`, which holds the *saved* value, not the live one.
 */
export function getWorkerCadences(): ReadonlyMap<string, number> {
  return globalThis.__buyboxWorkerHandle?.cadenceMsByJobName ?? new Map();
}

export function registerWorker(handle: WorkerHandle): void {
  globalThis.__buyboxWorkerHandle = handle;
}

/** The worker this process currently owns, if any — see `registerShutdown` for why callers
 *  must read it at use time rather than capture it. */
export function getWorkerHandle(): WorkerHandle | undefined {
  return globalThis.__buyboxWorkerHandle;
}

export function clearWorker(): void {
  globalThis.__buyboxWorkerHandle = undefined;
}

export function getWorkerStatus(): WorkerStatus {
  const handle = globalThis.__buyboxWorkerHandle;
  if (!handle) return { running: false };
  const report = handle.scheduler.lastTickReport;
  return {
    running: true,
    databaseTarget: handle.databaseTarget,
    startedAt: new Date(handle.startedAtMs).toISOString(),
    lastTickAt: report ? new Date(report.atMs).toISOString() : undefined,
    msSinceLastTick: report ? Date.now() - report.atMs : undefined,
    lastTickOutcome: report?.outcome,
    // A getter on the handle, so this is the live registry `reloadIfConfigChanged` maintains
    // rather than a boot-time snapshot.
    marketplaces: [...handle.adapters.keys()],
  };
}

export interface RestartResult {
  readonly ok: boolean;
  /** Turkish, operator-facing — this is rendered straight onto the Jobs screen. */
  readonly message: string;
  readonly startedAt?: string;
}

/**
 * Restarts the embedded worker without restarting the process.
 *
 * This is the "Worker'ı Yeniden Başlat" button behind `POST /api/jobs/worker/restart`. It exists
 * because every value the worker resolves at boot — job cadences (doc 07 §8.1), the scraper rate
 * limit (doc 08 §12) — is deliberately fixed for the process's lifetime, and the only documented
 * way to apply a change was to restart the Windows service. On a customer machine that means a
 * PowerShell prompt and an elevation, which is not a thing an operator will do to change how
 * often a job runs.
 *
 * Restarting the *worker* rather than the service is what makes this cheap and safe: the Next.js
 * server, its port and the browser session are untouched, so the click returns a real answer
 * instead of dropping the connection the way stopping `BuyBoxApp` would (the web half and the
 * worker share one process — doc 14 §3, `SINGLE_PROCESS=1`). It also satisfies doc 07 §8.1
 * literally: cadence takes effect "on the worker's next restart", and this *is* one.
 *
 * `shutdown()` first, and awaited: it stops claiming, lets in-flight handlers finish, releases
 * the scheduler lock and closes the Playwright browser the competitor sources own. Starting a
 * second worker before that finished would leave two schedulers contending for the lock and two
 * browsers alive. The old worker's `appDb` is deliberately *not* closed — `startWorker()` reads
 * `DATABASE_URL` and opens its own connection, while `getAppDb()` hands the web half a
 * separately-owned one that must survive this.
 *
 * Concurrent clicks share one restart via `__buyboxWorkerRestart` rather than queueing a second
 * teardown behind the first.
 */
export async function restartWorker(): Promise<RestartResult> {
  const inFlight = globalThis.__buyboxWorkerRestart;
  if (inFlight) return inFlight;

  const run = (async (): Promise<RestartResult> => {
    const previous = globalThis.__buyboxWorkerHandle;
    if (previous) {
      // A shutdown that throws must not leave the old handle registered as if it were healthy,
      // nor block the start below: the drain has a 30s bound of its own (`Scheduler.shutdown`),
      // and a source that fails to close is a leaked browser, not a reason to stay down.
      try {
        await previous.shutdown();
      } catch (error) {
        logger.error('worker.shutdownFailedDuringRestart', { error });
      }
      clearWorker();
    }

    try {
      const { startWorker } = await import('@buybox/worker');
      const handle = await startWorker();
      registerWorker(handle);
      logger.info('worker.embeddedRestarted', { database: handle.databaseTarget });
      return {
        ok: true,
        message: 'Worker yeniden başlatıldı. Kaydedilen sıklıklar artık geçerli.',
        startedAt: new Date(handle.startedAtMs).toISOString(),
      };
    } catch (error) {
      // The worker is now stopped and stays stopped — exactly what `getWorkerStatus()` will
      // report, and the Jobs screen's scheduler banner already renders that state prominently.
      // Failing loudly here beats pretending a restart succeeded over a dead scheduler.
      const detail = error instanceof Error ? error.message : String(error);
      logger.error('worker.embeddedRestartFailed', { error });
      return { ok: false, message: `Worker yeniden başlatılamadı: ${detail}` };
    }
  })();

  globalThis.__buyboxWorkerRestart = run;
  try {
    return await run;
  } finally {
    globalThis.__buyboxWorkerRestart = undefined;
  }
}
