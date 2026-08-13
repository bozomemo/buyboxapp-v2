/**
 * Standalone worker process entry point (`npm start` in `apps/worker`, or a `node dist/main.js`
 * container). Not used by `apps/web`'s single-process mode — that calls `startWorker()`
 * directly from `instrumentation.ts` in-process instead.
 */
import { startWorker } from './index.js';

async function main(): Promise<void> {
  const handle = await startWorker();
  console.log(
    `buybox worker started (dialect=${handle.appDb.dialect}, marketplaces=${[...handle.adapters.keys()].join(',') || 'none'})`,
  );

  const shutdown = async (): Promise<void> => {
    await handle.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();
