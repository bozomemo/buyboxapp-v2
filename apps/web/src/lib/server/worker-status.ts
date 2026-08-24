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
import type { WorkerHandle } from '@buybox/worker';

declare global {
  var __buyboxWorkerHandle: WorkerHandle | undefined;
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
}

export function registerWorker(handle: WorkerHandle): void {
  globalThis.__buyboxWorkerHandle = handle;
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
  };
}
