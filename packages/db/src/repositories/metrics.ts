/**
 * Bounded, read-only reads that back the Prometheus exposition at `/api/metrics`
 * (doc 16 §3) — the remote-observability counterpart to the `/events` screen.
 *
 * The shape here is deliberate: **this module reads, it does not aggregate.** Everything that
 * counts, buckets or divides lives in `apps/web/src/lib/server/metrics.ts`, which is a pure
 * function over these rows and is tested without a database. Two reasons:
 *
 * - A metric that is wrong is worse than a metric that is missing, because it is acted on. The
 *   arithmetic is the part that can be wrong, so it is the part that gets table-driven tests
 *   rather than a three-dialect integration test per statistic.
 * - The same aggregation would otherwise have to be written three times, once per dialect, in
 *   SQL that differs exactly where it is easiest to get subtly wrong (integer division, `NULL`
 *   handling in `SUM`, date arithmetic).
 *
 * Two different strategies appear below, and the split is by **cardinality, not by taste**:
 *
 * - `job_runs`, `circuit_breaker_state` and `update_budget_usage` are read as rows. A day of
 *   job runs is tens to low hundreds; the breaker and budget tables hold one row per
 *   marketplace. Reading these whole costs nothing and buys pure, testable aggregation.
 * - `job_queue` and `app_events` are counted **in SQL**. Both are unbounded by design — the
 *   queue holds every scheduled item and `app_events` holds three days of info at the retention
 *   floor (doc 05 §10). Pulling those into memory to call `.length` on them is how a metrics
 *   endpoint becomes the reason the machine is slow.
 *
 * Circuit breaker state is deliberately **not** read here: `circuitBreakerRepo`
 * (`./circuit-breaker.js`) already exposes exactly the row the exposition needs, and a second
 * reader over the same table would be three more dialect branches to keep in step with it for no
 * gain. The route composes the two repositories instead.
 *
 * Every read is bounded by a caller-supplied `sinceMs` or by a table that is small by
 * construction. Nothing here writes, and nothing here may ever be depended on by a pricing
 * decision: scraping is observation, and an observation that changes what it observes is a bug.
 */
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { withDialect } from '../with-dialect.js';

/**
 * One `job_runs` row, reduced to the columns the exposition uses.
 *
 * `finishedAt` is null for a run still in flight, and that is data rather than an absence to be
 * filtered away: "how many runs are running right now" and "how long do runs take" are two
 * different metrics read off the same rows.
 */
export interface MetricsJobRunRow {
  readonly jobName: string;
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly state: string;
  readonly itemsOk: number;
  readonly itemsFailed: number;
  readonly itemsTotal: number;
}

export interface MetricsBudgetRow {
  readonly marketplaceCode: string;
  readonly usageDate: string;
  readonly consumed: number;
  readonly allowance: number;
}

/** A `GROUP BY … COUNT(*)` result, already coerced to a JS number. */
export interface MetricsCountByKey {
  readonly key: string;
  readonly count: number;
}

/**
 * Drivers disagree about the type of `COUNT(*)`: `better-sqlite3` returns a number, `pg` returns
 * a string (a `bigint` count does not fit a JS number in the general case) and `mysql2` returns
 * either depending on the column. Coerced once, here, rather than at each call site — a count
 * that silently arrives as `"7"` renders as `7` in Prometheus text and then sorts as a string in
 * every dashboard built on it.
 */
function toCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Job runs started at or after `sinceMs`.
 *
 * Bounded by start time rather than by finish time on purpose: a run that started inside the
 * window and has not finished is exactly the one worth seeing, and filtering on `finished_at`
 * would hide it. The cost of the wider net is a run that started before the window and is still
 * going, which is missed — accepted, because a job running for longer than the scrape window is
 * already reported by `job_runs_running`, which is not time-bounded at all.
 */
export async function listJobRunsSince(
  appDb: AppDatabase,
  sinceMs: number,
): Promise<MetricsJobRunRow[]> {
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({
          jobName: sqliteSchema.jobRuns.jobName,
          startedAt: sqliteSchema.jobRuns.startedAt,
          finishedAt: sqliteSchema.jobRuns.finishedAt,
          state: sqliteSchema.jobRuns.state,
          itemsOk: sqliteSchema.jobRuns.itemsOk,
          itemsFailed: sqliteSchema.jobRuns.itemsFailed,
          itemsTotal: sqliteSchema.jobRuns.itemsTotal,
        })
        .from(sqliteSchema.jobRuns)
        .where(gte(sqliteSchema.jobRuns.startedAt, sinceMs)),
    postgres: (db) =>
      db
        .select({
          jobName: postgresSchema.jobRuns.jobName,
          startedAt: postgresSchema.jobRuns.startedAt,
          finishedAt: postgresSchema.jobRuns.finishedAt,
          state: postgresSchema.jobRuns.state,
          itemsOk: postgresSchema.jobRuns.itemsOk,
          itemsFailed: postgresSchema.jobRuns.itemsFailed,
          itemsTotal: postgresSchema.jobRuns.itemsTotal,
        })
        .from(postgresSchema.jobRuns)
        .where(gte(postgresSchema.jobRuns.startedAt, sinceMs)),
    mysql: (db) =>
      db
        .select({
          jobName: mysqlSchema.jobRuns.jobName,
          startedAt: mysqlSchema.jobRuns.startedAt,
          finishedAt: mysqlSchema.jobRuns.finishedAt,
          state: mysqlSchema.jobRuns.state,
          itemsOk: mysqlSchema.jobRuns.itemsOk,
          itemsFailed: mysqlSchema.jobRuns.itemsFailed,
          itemsTotal: mysqlSchema.jobRuns.itemsTotal,
        })
        .from(mysqlSchema.jobRuns)
        .where(gte(mysqlSchema.jobRuns.startedAt, sinceMs)),
  });
  return rows as MetricsJobRunRow[];
}

/**
 * Runs currently in the `running` state, regardless of when they started.
 *
 * Deliberately not time-bounded, unlike `listJobRunsSince`: a run stuck for six hours is the
 * single most useful thing this endpoint can show, and a `sinceMs` filter would be precisely the
 * filter that hides it once it had been stuck long enough to matter.
 */
export async function countRunningJobRunsByName(appDb: AppDatabase): Promise<MetricsCountByKey[]> {
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({ key: sqliteSchema.jobRuns.jobName, n: sql<number>`count(*)` })
        .from(sqliteSchema.jobRuns)
        .where(eq(sqliteSchema.jobRuns.state, 'running'))
        .groupBy(sqliteSchema.jobRuns.jobName),
    postgres: (db) =>
      db
        .select({ key: postgresSchema.jobRuns.jobName, n: sql<number>`count(*)` })
        .from(postgresSchema.jobRuns)
        .where(eq(postgresSchema.jobRuns.state, 'running'))
        .groupBy(postgresSchema.jobRuns.jobName),
    mysql: (db) =>
      db
        .select({ key: mysqlSchema.jobRuns.jobName, n: sql<number>`count(*)` })
        .from(mysqlSchema.jobRuns)
        .where(eq(mysqlSchema.jobRuns.state, 'running'))
        .groupBy(mysqlSchema.jobRuns.jobName),
  });
  return (rows as { key: string; n: unknown }[]).map((r) => ({ key: r.key, count: toCount(r.n) }));
}

/**
 * Queue depth per state. Counted in SQL: `job_queue` retains `done` rows until `PruneHistory`
 * removes them, so this table is routinely the largest one this module touches.
 */
export async function countQueueByState(appDb: AppDatabase): Promise<MetricsCountByKey[]> {
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({ key: sqliteSchema.jobQueue.state, n: sql<number>`count(*)` })
        .from(sqliteSchema.jobQueue)
        .groupBy(sqliteSchema.jobQueue.state),
    postgres: (db) =>
      db
        .select({ key: postgresSchema.jobQueue.state, n: sql<number>`count(*)` })
        .from(postgresSchema.jobQueue)
        .groupBy(postgresSchema.jobQueue.state),
    mysql: (db) =>
      db
        .select({ key: mysqlSchema.jobQueue.state, n: sql<number>`count(*)` })
        .from(mysqlSchema.jobQueue)
        .groupBy(mysqlSchema.jobQueue.state),
  });
  return (rows as { key: string; n: unknown }[]).map((r) => ({ key: r.key, count: toCount(r.n) }));
}

/**
 * The oldest `ready` item's `run_after`, or `undefined` when nothing is waiting.
 *
 * Queue *depth* alone cannot tell a busy queue from a stalled one — a hundred items due next
 * week and a hundred items due an hour ago are the same number. The age of the oldest item that
 * was already due is the signal that the scheduler has stopped claiming, which on a machine
 * nobody is logged into is otherwise invisible until a price is stale.
 */
export async function oldestReadyQueueRunAfter(
  appDb: AppDatabase,
  nowMs: number,
): Promise<number | undefined> {
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({ runAfter: sqliteSchema.jobQueue.runAfter })
        .from(sqliteSchema.jobQueue)
        .where(
          and(
            eq(sqliteSchema.jobQueue.state, 'ready'),
            sql`${sqliteSchema.jobQueue.runAfter} <= ${nowMs}`,
          ),
        )
        .orderBy(sqliteSchema.jobQueue.runAfter)
        .limit(1),
    postgres: (db) =>
      db
        .select({ runAfter: postgresSchema.jobQueue.runAfter })
        .from(postgresSchema.jobQueue)
        .where(
          and(
            eq(postgresSchema.jobQueue.state, 'ready'),
            sql`${postgresSchema.jobQueue.runAfter} <= ${nowMs}`,
          ),
        )
        .orderBy(postgresSchema.jobQueue.runAfter)
        .limit(1),
    mysql: (db) =>
      db
        .select({ runAfter: mysqlSchema.jobQueue.runAfter })
        .from(mysqlSchema.jobQueue)
        .where(
          and(
            eq(mysqlSchema.jobQueue.state, 'ready'),
            sql`${mysqlSchema.jobQueue.runAfter} <= ${nowMs}`,
          ),
        )
        .orderBy(mysqlSchema.jobQueue.runAfter)
        .limit(1),
  });
  // Every dialect maps `timestampMs` to a JS number (`{ mode: 'number' }` on all three
  // schemas), so there is no Date to unwrap here.
  const first = (rows as { runAfter: number | null }[])[0];
  return first?.runAfter ?? undefined;
}

/**
 * `app_events` counts per level since `sinceMs`. Counted in SQL — this table is the one the
 * whole application writes to.
 */
export async function countEventsByLevelSince(
  appDb: AppDatabase,
  sinceMs: number,
): Promise<MetricsCountByKey[]> {
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({ key: sqliteSchema.appEvents.level, n: sql<number>`count(*)` })
        .from(sqliteSchema.appEvents)
        .where(gte(sqliteSchema.appEvents.at, sinceMs))
        .groupBy(sqliteSchema.appEvents.level),
    postgres: (db) =>
      db
        .select({ key: postgresSchema.appEvents.level, n: sql<number>`count(*)` })
        .from(postgresSchema.appEvents)
        .where(gte(postgresSchema.appEvents.at, sinceMs))
        .groupBy(postgresSchema.appEvents.level),
    mysql: (db) =>
      db
        .select({ key: mysqlSchema.appEvents.level, n: sql<number>`count(*)` })
        .from(mysqlSchema.appEvents)
        .where(gte(mysqlSchema.appEvents.at, sinceMs))
        .groupBy(mysqlSchema.appEvents.level),
  });
  return (rows as { key: string; n: unknown }[]).map((r) => ({ key: r.key, count: toCount(r.n) }));
}

/**
 * The most recent `warn`/`error` event's timestamp, or `undefined` when the window is clean.
 *
 * Answers "when did it last go wrong?" without shipping `app_events` itself to a remote store —
 * the operator's decision (doc 16 §2) was that the events table stays local, so the metric
 * carries the *timestamp* and the `/events` screen carries the row.
 */
export async function lastProblemEventAt(
  appDb: AppDatabase,
  sinceMs: number,
): Promise<number | undefined> {
  const levels = ['warn', 'error'];
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({ at: sqliteSchema.appEvents.at })
        .from(sqliteSchema.appEvents)
        .where(and(gte(sqliteSchema.appEvents.at, sinceMs), inArray(sqliteSchema.appEvents.level, levels)))
        .orderBy(sql`${sqliteSchema.appEvents.at} desc`)
        .limit(1),
    postgres: (db) =>
      db
        .select({ at: postgresSchema.appEvents.at })
        .from(postgresSchema.appEvents)
        .where(
          and(gte(postgresSchema.appEvents.at, sinceMs), inArray(postgresSchema.appEvents.level, levels)),
        )
        .orderBy(sql`${postgresSchema.appEvents.at} desc`)
        .limit(1),
    mysql: (db) =>
      db
        .select({ at: mysqlSchema.appEvents.at })
        .from(mysqlSchema.appEvents)
        .where(and(gte(mysqlSchema.appEvents.at, sinceMs), inArray(mysqlSchema.appEvents.level, levels)))
        .orderBy(sql`${mysqlSchema.appEvents.at} desc`)
        .limit(1),
  });
  const first = (rows as { at: number | null }[])[0];
  return first?.at ?? undefined;
}

/**
 * Budget usage for one `YYYY-MM-DD`. The date is passed in rather than computed here because
 * "today" is a timezone question, and this module has no business answering it — doc 08 settles
 * which zone the budget day rolls over in, and the caller applies it.
 */
export async function listBudgetUsageForDate(
  appDb: AppDatabase,
  usageDate: string,
): Promise<MetricsBudgetRow[]> {
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({
          marketplaceCode: sqliteSchema.updateBudgetUsage.marketplaceCode,
          usageDate: sqliteSchema.updateBudgetUsage.usageDate,
          consumed: sqliteSchema.updateBudgetUsage.consumed,
          allowance: sqliteSchema.updateBudgetUsage.allowance,
        })
        .from(sqliteSchema.updateBudgetUsage)
        .where(eq(sqliteSchema.updateBudgetUsage.usageDate, usageDate)),
    postgres: (db) =>
      db
        .select({
          marketplaceCode: postgresSchema.updateBudgetUsage.marketplaceCode,
          usageDate: postgresSchema.updateBudgetUsage.usageDate,
          consumed: postgresSchema.updateBudgetUsage.consumed,
          allowance: postgresSchema.updateBudgetUsage.allowance,
        })
        .from(postgresSchema.updateBudgetUsage)
        .where(eq(postgresSchema.updateBudgetUsage.usageDate, usageDate)),
    mysql: (db) =>
      db
        .select({
          marketplaceCode: mysqlSchema.updateBudgetUsage.marketplaceCode,
          usageDate: mysqlSchema.updateBudgetUsage.usageDate,
          consumed: mysqlSchema.updateBudgetUsage.consumed,
          allowance: mysqlSchema.updateBudgetUsage.allowance,
        })
        .from(mysqlSchema.updateBudgetUsage)
        .where(eq(mysqlSchema.updateBudgetUsage.usageDate, usageDate)),
  });
  return rows as MetricsBudgetRow[];
}
