/**
 * Node-only half of `instrumentation.ts`'s orphan watch, split out for the same reason
 * `instrumentation-shutdown.ts` is (Edge bundle static analysis).
 *
 * When the service wrapper that started this process dies without stopping it, the process shuts
 * down the same way it does on SIGTERM — drain the worker, then exit — so the port is free for
 * the wrapper's restart within seconds and no job is cut off mid-run. See `watchParentProcess`
 * for the production incident this answers (WinSW crashing on its midnight log roll, doc 14 §5
 * step 7).
 *
 * Registered before `startWorker()` and outside the `SINGLE_PROCESS` guard: an install whose
 * setup is unfinished has no worker, but an orphan of it still holds the port.
 */
import { createLogger, watchParentProcess } from '@buybox/shared';
import { shutdownProcess } from './instrumentation-shutdown';

const logger = createLogger({ name: 'web.orphan' });

let registered = false;

export function registerOrphanWatch(): void {
  // Next may evaluate instrumentation more than once; one watcher is enough.
  if (registered) return;
  registered = true;
  watchParentProcess({
    onOrphaned: (parentPid) => {
      // `warn`, so it lands in the err log the operator opens first — and before the shutdown
      // starts, since the pipe this line goes to may be the very thing that is gone.
      logger.warn('process.parentExited', { parentPid, action: 'shutting down gracefully' });
      shutdownProcess('parentExited');
    },
  });
}
