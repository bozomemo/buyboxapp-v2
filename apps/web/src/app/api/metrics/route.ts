/**
 * Prometheus exposition for remote observability (doc 16 §3).
 *
 * Scraped over loopback by the Grafana Alloy agent, which forwards the samples to Grafana Cloud
 * so the operator can see what the service is doing without a remote desktop session. It is the
 * metrics half of the same story `/api/health` tells for liveness and the `/events` screen tells
 * locally — none of the three replaces the others.
 *
 * The design mirrors `/api/health` where it matters and diverges where it must:
 *
 * - **Exempt from the licence gate** (`apps/web/src/proxy.ts`), for a sharper reason than health
 *   is. A lapsed licence is precisely a moment somebody needs to see the machine, and a 402 here
 *   would blank every dashboard at exactly that moment — monitoring that switches itself off
 *   when the news is bad is worse than none.
 * - **Answers 200 even when the database is unreachable.** It reports the failure as
 *   `buybox_database_up 0` rather than by failing, for the same reason: a 500 produces a gap in
 *   the graph that looks identical to the agent being down, and those need different responses.
 * - **Read-only, and never in the pricing path.** Nothing here writes, and nothing in the
 *   repricing decision may ever read it back. An observation that changes what it observes is a
 *   bug, and this endpoint is scraped on a timer by a third party.
 *
 * All arithmetic lives in `@/lib/server/metrics`, which is pure and separately tested; this file
 * is the I/O shell that gathers a snapshot and hands it over.
 */
import { checkSchemaVersion, circuitBreakerRepo, metricsRepo } from '@buybox/db';
import { getAppDb, isBootstrapped } from '@/lib/server/db';
import { getWorkerStatus } from '@/lib/server/worker-status';
import { renderMetrics, type MetricsSnapshot } from '@/lib/server/metrics';

export const dynamic = 'force-dynamic';

/**
 * How far back the windowed metrics look.
 *
 * One hour, chosen against the scrape interval rather than against the dashboards: Alloy scrapes
 * every 60s, so a one-hour window means each run is counted in ~60 consecutive scrapes and a
 * short-lived failure cannot fall between two scrapes and be missed entirely. Widening this is
 * cheap in query cost but makes every rate look smoother than reality, which is the wrong
 * trade-off for a signal whose job is to show a problem starting.
 */
const WINDOW_MS = 60 * 60 * 1000;

/**
 * The budget usage key, computed **exactly** as the repricing path computes it
 * (`packages/jobs/src/pipeline/reprice.ts`): `YYYY-MM-DD` in UTC.
 *
 * Duplicated deliberately rather than approximated. Using local time here would, for a Turkish
 * operator at UTC+3, read the wrong row for the first three hours of every day — the budget
 * would appear to reset at 03:00 and the metric would show a full allowance while the pricing
 * path was already spending against the new day's row. If the pricing path's key ever changes,
 * this must change with it.
 */
function budgetUsageDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Reads everything the exposition needs, or returns `undefined` when the database cannot be
 * reached at all.
 *
 * The reads are issued together rather than in sequence: they are independent, and a metrics
 * endpoint that holds a connection for nine sequential round trips is one that shows up in the
 * very latency it is meant to measure.
 */
async function readDatabase(nowMs: number): Promise<MetricsSnapshot['database']> {
  if (!isBootstrapped()) return undefined;
  try {
    const appDb = getAppDb();
    const sinceMs = nowMs - WINDOW_MS;
    const [
      schema,
      jobRuns,
      runningByName,
      queueByState,
      oldestReadyRunAfterMs,
      eventsByLevel,
      lastProblemEventAtMs,
      circuitBreakers,
      budgets,
    ] = await Promise.all([
      checkSchemaVersion(appDb),
      metricsRepo.listJobRunsSince(appDb, sinceMs),
      metricsRepo.countRunningJobRunsByName(appDb),
      metricsRepo.countQueueByState(appDb),
      metricsRepo.oldestReadyQueueRunAfter(appDb, nowMs),
      metricsRepo.countEventsByLevelSince(appDb, sinceMs),
      metricsRepo.lastProblemEventAt(appDb, sinceMs),
      // Read through the existing breaker repository rather than a second reader over the
      // same table — see the note in `packages/db/src/repositories/metrics.ts`.
      circuitBreakerRepo.listCircuitBreakerStates(appDb),
      metricsRepo.listBudgetUsageForDate(appDb, budgetUsageDateKey(nowMs)),
    ]);

    return {
      dialect: appDb.dialect,
      schemaUpToDate: schema.drift === 'up-to-date',
      jobRuns,
      runningByName,
      queueByState,
      oldestReadyRunAfterMs,
      eventsByLevel,
      lastProblemEventAtMs,
      circuitBreakers,
      budgets,
    };
  } catch {
    // Swallowed on purpose, and this is the one place in the codebase where that is right: the
    // failure is *reported* by the response itself as `buybox_database_up 0`, so it is neither
    // hidden nor lost. Logging it would write a line on every scrape — once a minute, forever —
    // and drown the log this endpoint exists to complement.
    return undefined;
  }
}

export async function GET(): Promise<Response> {
  const nowMs = Date.now();
  const worker = getWorkerStatus();

  const snapshot: MetricsSnapshot = {
    windowMs: WINDOW_MS,
    appVersion: process.env.APP_VERSION ?? null,
    // `process.uptime()` is seconds of wall clock since this process started. Derived rather
    // than stored at module load, because a module can be re-evaluated (bundling, HMR in dev)
    // while the process keeps running, which would silently reset an apparent uptime that
    // dashboards read as "the service restarted".
    processStartedAtMs: nowMs - process.uptime() * 1000,
    worker: { running: worker.running, msSinceLastTick: worker.msSinceLastTick },
    database: await readDatabase(nowMs),
  };

  return new Response(renderMetrics(snapshot, nowMs), {
    status: 200,
    headers: {
      // The 0.0.4 text format, which is what Prometheus, Alloy and Grafana Agent all negotiate
      // to by default. Naming the version explicitly rather than sending bare `text/plain`
      // keeps a scraper from having to sniff.
      'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
