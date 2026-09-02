/**
 * Process-level crash handlers (added 2026-09-03).
 *
 * Until this existed, a fault that escaped a job — an `uncaughtException` from a callback, or a
 * promise nobody awaited — reached Node's own default handler. That prints a stack trace to
 * stderr, which the service does capture into `DATA_DIR\logs\`, but it arrives as a bare
 * multi-line trace: not a JSON line like everything else around it, carrying no `name`, no
 * `correlationId`, and never reaching `app_events`, where the operator actually looks. On the
 * Jobs screen the same event was simply a worker that had stopped existing.
 *
 * Both faults are now written through the structured logger, and — when a sink is supplied —
 * into `app_events` as well, so the last thing the process did before dying is visible in the
 * same place as everything else.
 *
 * The two are treated differently on purpose:
 *
 * - **`uncaughtException` exits.** Registering a listener suppresses Node's default "print and
 *   die", so the process would otherwise carry on with an unknown heap — a repricing host that
 *   keeps submitting prices after an unexplained fault is worse than one that restarts. WinSW's
 *   `onfailure` brings it back within ten seconds (doc 14 §5 step 7).
 * - **`unhandledRejection` does not.** Node ≥15 would crash the process; that is a bad trade
 *   here, because the scheduler already isolates per-job failure and a stray rejection from one
 *   marketplace adapter would otherwise drop every in-flight submission with it. It is logged
 *   at `error`, and the run continues.
 */
import { createLogger, sanitiseLogValue, type Logger } from './logger.js';

export type FatalKind = 'uncaughtException' | 'unhandledRejection';

export type ProcessErrorHandlerOptions = {
  /** Where the structured line goes. Defaults to a logger named `process`. */
  logger?: Logger;
  /**
   * Optional persistence — in practice a write to `app_events`, which lives in `packages/db` and
   * cannot be imported here. Bounded by `sinkTimeoutMs`: a database that is itself the reason
   * for the crash must not stop the process from dying.
   */
  onFatal?: (event: { kind: FatalKind; message: string; detail: unknown }) => Promise<void>;
  /** How long `onFatal` is given before the process exits anyway. */
  sinkTimeoutMs?: number;
  /**
   * How long to let stdout/stderr drain before `process.exit`. Writes to the pipe WinSW reads
   * are asynchronous on Windows; exiting immediately can truncate the very line that explains
   * the crash.
   */
  flushMs?: number;
  /** Overridable for tests. */
  exit?: (code: number) => void;
};

let registered = false;

/**
 * Idempotent: the web process can re-enter `register()` (Next may evaluate instrumentation more
 * than once, and the Jobs screen's restart button replaces the worker in place), and a second
 * set of listeners would log every crash twice and race two `process.exit` calls.
 */
export function registerProcessErrorHandlers(options: ProcessErrorHandlerOptions = {}): boolean {
  if (registered) return false;
  registered = true;

  const logger = options.logger ?? createLogger({ name: 'process' });
  const sinkTimeoutMs = options.sinkTimeoutMs ?? 2000;
  const flushMs = options.flushMs ?? 250;
  const exit = options.exit ?? ((code: number) => process.exit(code));

  const report = async (kind: FatalKind, detail: unknown, fatal: boolean): Promise<void> => {
    const message =
      detail instanceof Error ? detail.message : typeof detail === 'string' ? detail : String(detail);

    logger.error(kind === 'uncaughtException' ? 'process.uncaughtException' : 'process.unhandledRejection', {
      fatal,
      error: detail,
    });

    if (options.onFatal) {
      try {
        await Promise.race([
          options.onFatal({ kind, message, detail: sanitiseLogValue(detail) }),
          new Promise((resolve) => {
            const timer = setTimeout(resolve, sinkTimeoutMs);
            timer.unref?.();
          }),
        ]);
      } catch (sinkError) {
        // The sink failing is itself worth a line, but it must never mask the original fault.
        logger.error('process.fatalSinkFailed', { kind, error: sinkError });
      }
    }
  };

  process.on('uncaughtException', (error) => {
    void report('uncaughtException', error, true).finally(() => {
      const timer = setTimeout(() => exit(1), flushMs);
      timer.unref?.();
    });
  });

  process.on('unhandledRejection', (reason) => {
    void report('unhandledRejection', reason, false);
  });

  return true;
}

/** Test seam — the module-level guard would otherwise leak between test cases. */
export function resetProcessErrorHandlersForTest(): void {
  registered = false;
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
}
