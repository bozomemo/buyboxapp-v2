/**
 * Notices when the process that started this one has gone, so the process can shut down
 * gracefully instead of living on as an orphan (added 2026-10-03).
 *
 * Found in production. On Windows the app runs as a child of WinSW (doc 14 §5 step 7), and when
 * WinSW itself crashed — every night, from its timed log roll — it died without stopping
 * node.exe. The orphan kept serving port 3000 and running jobs with nobody supervising it, so
 * every restart WinSW attempted failed with EADDRINUSE. The orphan only went away minutes later,
 * when a write to the pipe its dead parent used to read killed it mid-job — exactly the abrupt
 * stop the graceful shutdown path exists to avoid. Nothing signals a child when its Windows
 * parent dies; polling is the only portable way to find out.
 *
 * `process.kill(pid, 0)` sends no signal: it only checks that the pid exists, on Windows and
 * POSIX alike. `EPERM` means it exists but belongs to someone else — alive. A pid the OS reused
 * within one interval would read as alive; Windows does reuse pids, but not within seconds in
 * practice, and the cost of that miss is the old behaviour, not a new failure.
 */
export type ParentWatchOptions = {
  /** The parent's pid, captured at start — `process.ppid` by default. */
  parentPid?: number;
  /** How often to look. */
  intervalMs?: number;
  /** Called once, the first time the parent is found gone. */
  onOrphaned: (parentPid: number) => void;
  /** Overridable for tests. */
  isAlive?: (pid: number) => boolean;
};

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Starts watching and returns a function that stops it. Does nothing for a parent pid of 0 or 1:
 * that is no parent (Windows' idle process) or an init that outlives everything (a POSIX service
 * or a container), and neither can orphan this process in the sense above.
 */
export function watchParentProcess(options: ParentWatchOptions): () => void {
  const parentPid = options.parentPid ?? process.ppid;
  if (parentPid <= 1) return () => {};
  const isAlive = options.isAlive ?? isProcessAlive;
  const timer = setInterval(() => {
    if (isAlive(parentPid)) return;
    clearInterval(timer);
    options.onOrphaned(parentPid);
  }, options.intervalMs ?? 5000);
  // Never the reason the process stays up.
  timer.unref?.();
  return () => clearInterval(timer);
}
