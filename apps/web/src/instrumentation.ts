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
 * `NEXT_RUNTIME === 'nodejs'` guard and dynamic imports. The actual Node-only shutdown wiring
 * lives in `instrumentation-shutdown.ts`, reached only via `import()` below.
 */
export async function register(): Promise<void> {
  if (process.env.SINGLE_PROCESS === '1' && process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWorker } = await import('@buybox/worker');
    try {
      const handle = await startWorker();
      console.log('[buybox] embedded worker started (SINGLE_PROCESS=1)');
      const { registerShutdown } = await import('./instrumentation-shutdown');
      registerShutdown(handle);
    } catch (error) {
      // Setup not finished yet (no DATABASE_URL, or schema not migrated) — this is expected on
      // a fresh install before the wizard runs. The web UI still boots so /setup is reachable.
      console.warn(
        '[buybox] embedded worker did not start (this is normal before setup is complete):',
        error instanceof Error ? error.message : error,
      );
    }
  }
}
