/**
 * Node-only half of `instrumentation.ts`'s embedded-worker shutdown wiring, split into its own
 * file per the instrumentation.js doc's "Specifying the runtime" guidance
 * (node_modules/next/dist/docs/.../instrumentation.md): `instrumentation.ts` is bundled for
 * *both* the Node.js and Edge runtimes, and Turbopack statically flags any Node API it finds in
 * that file — even inside a branch guarded by `NEXT_RUNTIME === 'nodejs'` at runtime — as
 * "not supported in the Edge Runtime". Keeping `process.on`/`process.exit` here and reaching
 * this file only via a dynamic `import()` from the nodejs branch keeps them out of the Edge
 * bundle's static analysis entirely.
 *
 * Mirrors `apps/worker/src/main.ts`'s standalone shutdown wiring. Without this, `startWorker()`'s
 * handle was discarded and nothing ever told the embedded scheduler to stop: its `setInterval`
 * tickers and the open DB connection outlived the Next.js process however it was terminated.
 *
 * Registering a signal listener suppresses Node's default "exit immediately" behaviour for that
 * signal, so `process.exit()` below is required, not optional — otherwise Ctrl+C/SIGTERM would
 * hang instead of stopping the process at all. `shuttingDown` guards against a second signal (or
 * Next's own handler for the same one) re-entering mid-cleanup, and the timeout is a bound in
 * case `handle.shutdown()` itself stalls (e.g. a slow DB write) — better to exit late than never.
 *
 * Takes a *getter* rather than a handle, because the worker this process owns can be replaced
 * while it runs: `restartWorker()` (lib/server/worker-status.ts) tears one down and starts
 * another in its place. A captured handle would make these listeners shut down the worker that
 * was current when the process booted — by then already stopped — and leave the live one's
 * tickers and database connection running past the signal, which is precisely the leak this
 * file was written to prevent.
 */
export function registerShutdown(getHandle: () => { shutdown: () => Promise<void> } | undefined): void {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const forceExit = setTimeout(() => {
      console.warn(`[buybox] embedded worker shutdown timed out after ${signal}, exiting anyway`);
      process.exit(0);
    }, 5000);
    forceExit.unref();
    // No worker registered (a restart failed, or one is mid-flight) — nothing to drain, but the
    // process must still exit, since registering a listener suppressed Node's own default.
    const handle = getHandle();
    if (!handle) {
      clearTimeout(forceExit);
      process.exit(0);
      return;
    }
    void handle
      .shutdown()
      .catch((error) => console.error('[buybox] embedded worker shutdown failed:', error))
      .finally(() => {
        clearTimeout(forceExit);
        process.exit(0);
      });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
