/**
 * Single-process mode (doc 10 §1.1): `SINGLE_PROCESS=1 npm start` boots the Next.js server and,
 * in the same process, starts the worker's scheduler. The worker code is identical to the
 * standalone `apps/worker` process — only the host differs. The scheduler's own DB-backed lock
 * (`acquireOrRenewSchedulerLock`, packages/db) guarantees only one scheduler instance is ever
 * active, even if an embedded and a standalone worker both end up running against the same
 * database.
 *
 * This file is bundled for both the Node.js and Edge runtimes (Next's instrumentation.js doc,
 * "Specifying the runtime"), so it must contain no Node-only API itself — only the
 * `NEXT_RUNTIME === 'nodejs'` guard and dynamic imports. The actual Node-only wiring lives in
 * `instrumentation-shutdown.ts` and `instrumentation-process-errors.ts`, reached only via
 * `import()` below.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { createLogger } = await import('@buybox/shared');
  const logger = createLogger({ name: 'web' });

  // Deliberately outside the `SINGLE_PROCESS` guard below and ahead of `startWorker()`: this is
  // the web process's own crash net, and it matters most on an install whose setup has not
  // finished and which therefore never starts a worker at all.
  const { registerCrashHandlers } = await import('./instrumentation-process-errors');
  registerCrashHandlers();

  if (process.env.SINGLE_PROCESS === '1') {
    const { startWorker } = await import('@buybox/worker');
    try {
      const handle = await startWorker();
      // Recorded so `/api/health` and the Jobs screen can say whether the worker is running and
      // which database it opened. A worker that starts and then quietly does nothing used to be
      // indistinguishable from one that never started (see `lib/server/worker-status.ts`).
      const { registerWorker, getWorkerHandle } = await import('./lib/server/worker-status');
      registerWorker(handle);
      logger.info('worker.embeddedStarted', { database: handle.databaseTarget });
      const { registerShutdown } = await import('./instrumentation-shutdown');
      // A getter, not `handle`: the Jobs screen's restart button replaces the worker in place
      // (`restartWorker`), and these listeners must drain whichever one is current at the signal.
      registerShutdown(getWorkerHandle);
    } catch (error) {
      // Setup not finished yet (no DATABASE_URL, or schema not migrated) — this is expected on
      // a fresh install before the wizard runs. The web UI still boots so /setup is reachable.
      logger.warn('worker.embeddedNotStarted', {
        reason: 'normal before setup is complete',
        error,
      });
    }
  }
}
