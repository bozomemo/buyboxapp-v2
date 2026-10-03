/**
 * Standalone worker process entry point (`npm start` in `apps/worker`, or a `node dist/main.js`
 * container). Not used by `apps/web`'s single-process mode — that calls `startWorker()`
 * directly from `instrumentation.ts` in-process instead.
 */
import { eventsRepo, newId } from '@buybox/db';
import { createLogger, registerProcessErrorHandlers, watchParentProcess } from '@buybox/shared';
import { startWorker } from './index.js';

const logger = createLogger({ name: 'worker.main' });

async function main(): Promise<void> {
  const handle = await startWorker();

  // Registered after the handle exists so a crash can be written to `app_events` as well as to
  // the log file. Anything that fails *before* this line still reaches stderr through Node's own
  // default handler, which the service captures.
  registerProcessErrorHandlers({
    logger,
    onFatal: async ({ kind, message, detail }) => {
      await eventsRepo.logEvent(handle.appDb, {
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

  logger.info('worker.started', {
    dialect: handle.appDb.dialect,
    marketplaces: [...handle.adapters.keys()],
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await handle.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  // A supervisor that dies without stopping us leaves an orphan nobody restarts or stops; drain
  // and exit instead, the same as on SIGTERM (see `watchParentProcess`).
  watchParentProcess({
    onOrphaned: (parentPid) => {
      logger.warn('process.parentExited', { parentPid, action: 'shutting down gracefully' });
      void shutdown();
    },
  });
}

void main();
