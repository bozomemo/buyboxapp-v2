/**
 * Node-only half of `instrumentation.ts`'s crash-handler wiring, split out for the same reason
 * `instrumentation-shutdown.ts` is: `instrumentation.ts` is bundled for the Edge runtime too, and
 * Turbopack statically flags any Node API it finds there — `process.on` included — even inside a
 * branch guarded at runtime. Reaching this file only through a dynamic `import()` from the
 * nodejs branch keeps those APIs out of the Edge bundle's static analysis.
 *
 * Registered for the *web* process, not just the embedded worker, and before `startWorker()` is
 * attempted: an install whose setup is unfinished has no worker at all, and a crash there is
 * exactly the one the operator most needs to see in the log file.
 */
import { registerProcessErrorHandlers } from '@buybox/shared';

export function registerCrashHandlers(): void {
  registerProcessErrorHandlers({
    onFatal: async ({ kind, message, detail }) => {
      // Imported lazily and inside the handler: before the setup wizard has run there is no
      // database to write to, and `getAppDb()` throws. The log line is already written by then —
      // this is the second copy, not the only one, so failing here costs nothing.
      const { isBootstrapped, getAppDb } = await import('./lib/server/db');
      if (!isBootstrapped()) return;
      const { eventsRepo, newId } = await import('@buybox/db');
      await eventsRepo.logEvent(getAppDb(), {
        id: newId(),
        at: Date.now(),
        level: 'error',
        marketplaceCode: null,
        listingId: null,
        jobRunId: null,
        code: kind === 'uncaughtException' ? 'ProcessUncaughtException' : 'ProcessUnhandledRejection',
        message,
        context: JSON.stringify({ detail }),
      });
    },
  });
}
