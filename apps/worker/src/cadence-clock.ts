/**
 * When a ticker's job is next due (added 2026-10-03).
 *
 * The tickers in `index.ts` used to be a bare `setInterval(fire, cadenceMs)` plus one boot-time
 * check of "last run *finished* + cadence". Both halves failed together in production, where the
 * service restarted every night (WinSW crashing on its midnight log roll, doc 14 §5 step 7):
 *
 * - a restart threw the interval away, so a daily job's only chance to run was the boot check;
 * - the boot check was measured from the end of the previous run, so a run that took 80 s made
 *   the next night's boot, a few seconds earlier in the clock than the last start, read as "not
 *   due yet" — by about a minute — and nothing looked again for another 24 hours.
 *
 * The result was `SweepBrandCatalogue` running every other day (26, 28, 30 Sep, 3 Oct), and
 * products a sweep would have found going untracked for days.
 *
 * This keeps the due time instead of the interval, anchors it on the previous run's **start**
 * (so a run's own duration never pushes the next one later), and is meant to be asked often —
 * `checkEveryMs` — so a restart costs at most one check, never one cadence.
 */
export type CadenceClock = {
  /** Whether a fire is due at `nowMs`. */
  isDue(nowMs: number): boolean;
  /** Records a fire at `nowMs`; the next is due one cadence later. */
  markFired(nowMs: number): void;
};

/**
 * @param lastStartedAtMs The latest recorded run's start (`job_runs.started_at`), or `undefined`
 *   when the job has never run — due at once, so a fresh install does not wait a cadence.
 */
export function createCadenceClock(cadenceMs: number, lastStartedAtMs: number | undefined): CadenceClock {
  let dueAtMs = lastStartedAtMs === undefined ? 0 : lastStartedAtMs + cadenceMs;
  return {
    isDue: (nowMs) => nowMs >= dueAtMs,
    markFired: (nowMs) => {
      dueAtMs = nowMs + cadenceMs;
    },
  };
}

/**
 * How often a ticker asks its clock. Never longer than a minute, so a daily job is at most a
 * minute late after a restart; never longer than the cadence itself, so a sub-minute cadence
 * keeps its rate.
 */
export function checkEveryMs(cadenceMs: number): number {
  return Math.min(cadenceMs, 60_000);
}
