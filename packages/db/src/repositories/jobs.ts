/**
 * Repositories for `job_queue` and `job_runs` (doc 05 §7).
 *
 * `claimNextJob` is doc 12 Phase 5.1's "DB-backed queue" claim-by-update deliverable,
 * built on the enqueue/list/mark primitives below: `FOR UPDATE SKIP LOCKED` on Postgres
 * and MySQL (both support it), a single-writer transaction on SQLite (doc 10 §1.2).
 */
import { and, asc, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export interface JobQueueRow {
  readonly id: string;
  readonly jobName: string;
  readonly payload: string; // JSON
  readonly priority: number;
  readonly state: 'ready' | 'locked' | 'done' | 'failed';
  readonly runAfter: number;
  readonly lockedBy: string | null;
  readonly lockedUntil: number | null;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export async function enqueueJob(appDb: AppDatabase, row: JobQueueRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.jobQueue).values(row),
    postgres: (db) => db.insert(postgresSchema.jobQueue).values(row),
    mysql: (db) => db.insert(mysqlSchema.jobQueue).values(row),
  });
}

/** Ready or locked (i.e. not yet terminal) rows for one job name — lets the scheduler avoid double-enqueueing a periodic job while a previous instance is still pending or running. */
export async function countActiveJobs(appDb: AppDatabase, jobName: string): Promise<number> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.jobQueue)
          .where(
            and(
              eq(sqliteSchema.jobQueue.jobName, jobName),
              inArray(sqliteSchema.jobQueue.state, ['ready', 'locked']),
            ),
          )
      ).length,
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.jobQueue)
          .where(
            and(
              eq(postgresSchema.jobQueue.jobName, jobName),
              inArray(postgresSchema.jobQueue.state, ['ready', 'locked']),
            ),
          )
      ).length,
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.jobQueue)
          .where(
            and(
              eq(mysqlSchema.jobQueue.jobName, jobName),
              inArray(mysqlSchema.jobQueue.state, ['ready', 'locked']),
            ),
          )
      ).length,
  });
}

/**
 * Ready or locked rows for one job name **and one target marketplace** — the per-target
 * equivalent of `countActiveJobs` above.
 *
 * `countActiveJobs` keys on the job name alone, which is right for the scheduler's own cadence
 * loop (those jobs take no payload) but wrong for `apps/worker`'s per-marketplace tickers: a
 * running Trendyol `ImportListings` would suppress the Hepsiburada one, starving whichever
 * marketplace happened to be slower. Scoping to the target keeps the two independent while
 * still preventing a target from being queued behind itself.
 *
 * **The target is read out of the payload, not compared as a string.** This used to be exact
 * payload equality, on the reasoning that every tick builds the same literal shape and so
 * produces byte-identical JSON. That holds within one build and silently stops holding across
 * one: on 2026-08-26 `cycleNumber` was removed from these payloads, a queued row written by the
 * previous build survived the upgrade, and its old payload matched nothing the new build
 * produced — so the guard admitted a second concurrent `ScrapeCompetitors` against the same
 * marketplace, which is precisely the aggressive pattern api-references §1.6 warns about. Any
 * future field added to or removed from a payload would do the same thing, silently.
 *
 * Rows whose payload is absent or unparseable are counted as **matching**, so a row we cannot
 * read suppresses rather than admits. That is the safe direction here: a wrongly-suppressed tick
 * costs one cycle of latency and is logged by the caller, while a wrongly-admitted one puts two
 * scrapers on the same marketplace at once.
 */
export async function countActiveJobsForTarget(
  appDb: AppDatabase,
  jobName: string,
  marketplaceCode: string,
): Promise<number> {
  return countActiveJobsForPayloadField(appDb, jobName, 'marketplaceCode', marketplaceCode);
}

/**
 * The general form of `countActiveJobsForTarget`: active rows for one job name whose payload
 * names `field` as `value`, or does not name it at all.
 *
 * The second half of that rule is what makes it usable as a single-flight guard for a *scoped*
 * request against an *unscoped* run. A `SweepBrandCatalogue` queued with no `watchedBrandId`
 * sweeps every brand on its marketplace, so it already covers the one brand an operator is
 * asking for, and admitting a second run for that brand would only put two sweeps on the same
 * pages. The narrower direction stays independent: brand A running does not suppress brand B.
 *
 * Rows whose payload is absent or unparseable count as matching — see the doc comment above for
 * why suppressing is the safe direction.
 */
export async function countActiveJobsForPayloadField(
  appDb: AppDatabase,
  jobName: string,
  field: string,
  value: string,
): Promise<number> {
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({ payload: sqliteSchema.jobQueue.payload })
        .from(sqliteSchema.jobQueue)
        .where(
          and(
            eq(sqliteSchema.jobQueue.jobName, jobName),
            inArray(sqliteSchema.jobQueue.state, ['ready', 'locked']),
          ),
        ),
    postgres: (db) =>
      db
        .select({ payload: postgresSchema.jobQueue.payload })
        .from(postgresSchema.jobQueue)
        .where(
          and(
            eq(postgresSchema.jobQueue.jobName, jobName),
            inArray(postgresSchema.jobQueue.state, ['ready', 'locked']),
          ),
        ),
    mysql: (db) =>
      db
        .select({ payload: mysqlSchema.jobQueue.payload })
        .from(mysqlSchema.jobQueue)
        .where(
          and(
            eq(mysqlSchema.jobQueue.jobName, jobName),
            inArray(mysqlSchema.jobQueue.state, ['ready', 'locked']),
          ),
        ),
  });

  // Filtered here rather than in SQL: the payload is a JSON *document* and the three engines
  // disagree on how to reach into one. The candidate set is bounded by the guard this feeds —
  // active rows for a single job name — so it is a handful of rows, not a scan.
  let count = 0;
  for (const row of rows as { payload: string | null }[]) {
    if (row.payload === null) {
      count += 1;
      continue;
    }
    try {
      const parsed = JSON.parse(row.payload) as Record<string, unknown>;
      if (parsed[field] === undefined || parsed[field] === value) {
        count += 1;
      }
    } catch {
      count += 1; // unreadable ⇒ suppress, per the note above
    }
  }
  return count;
}

/**
 * All non-terminal (`ready` or `locked`) rows, for the Jobs screen. `listClaimedJobs` only
 * sees `locked`, which leaves a manual "run now" invisible for the up-to-one scheduler tick
 * between the enqueue and the claim — precisely the window in which the operator has clicked
 * and is waiting for the UI to acknowledge it.
 */
export async function listActiveJobs(appDb: AppDatabase): Promise<JobQueueRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db.select().from(sqliteSchema.jobQueue).where(inArray(sqliteSchema.jobQueue.state, ['ready', 'locked'])),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.jobQueue)
        .where(inArray(postgresSchema.jobQueue.state, ['ready', 'locked'])),
    mysql: (db) =>
      db.select().from(mysqlSchema.jobQueue).where(inArray(mysqlSchema.jobQueue.state, ['ready', 'locked'])),
  }) as Promise<JobQueueRow[]>;
}

export async function getJob(appDb: AppDatabase, id: string): Promise<JobQueueRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (await db.select().from(sqliteSchema.jobQueue).where(eq(sqliteSchema.jobQueue.id, id)))[0],
    postgres: async (db) =>
      (await db.select().from(postgresSchema.jobQueue).where(eq(postgresSchema.jobQueue.id, id)))[0],
    mysql: async (db) =>
      (await db.select().from(mysqlSchema.jobQueue).where(eq(mysqlSchema.jobQueue.id, id)))[0],
  }) as Promise<JobQueueRow | undefined>;
}

/** Ready jobs due to run, oldest-priority first — the pool Phase 5's claim logic picks from. */
export async function listReadyJobs(
  appDb: AppDatabase,
  jobNames: readonly string[],
  nowMs: number,
): Promise<JobQueueRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.jobQueue)
        .where(
          and(
            inArray(sqliteSchema.jobQueue.jobName, [...jobNames]),
            eq(sqliteSchema.jobQueue.state, 'ready'),
            lte(sqliteSchema.jobQueue.runAfter, nowMs),
          ),
        )
        .orderBy(asc(sqliteSchema.jobQueue.priority), asc(sqliteSchema.jobQueue.runAfter)),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.jobQueue)
        .where(
          and(
            inArray(postgresSchema.jobQueue.jobName, [...jobNames]),
            eq(postgresSchema.jobQueue.state, 'ready'),
            lte(postgresSchema.jobQueue.runAfter, nowMs),
          ),
        )
        .orderBy(asc(postgresSchema.jobQueue.priority), asc(postgresSchema.jobQueue.runAfter)),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.jobQueue)
        .where(
          and(
            inArray(mysqlSchema.jobQueue.jobName, [...jobNames]),
            eq(mysqlSchema.jobQueue.state, 'ready'),
            lte(mysqlSchema.jobQueue.runAfter, nowMs),
          ),
        )
        .orderBy(asc(mysqlSchema.jobQueue.priority), asc(mysqlSchema.jobQueue.runAfter)),
  }) as Promise<JobQueueRow[]>;
}

export async function markJobDone(appDb: AppDatabase, id: string, nowMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.jobQueue)
        .set({ state: 'done', updatedAt: nowMs })
        .where(eq(sqliteSchema.jobQueue.id, id)),
    postgres: (db) =>
      db
        .update(postgresSchema.jobQueue)
        .set({ state: 'done', updatedAt: nowMs })
        .where(eq(postgresSchema.jobQueue.id, id)),
    mysql: (db) =>
      db
        .update(mysqlSchema.jobQueue)
        .set({ state: 'done', updatedAt: nowMs })
        .where(eq(mysqlSchema.jobQueue.id, id)),
  });
}

/** Bounded retry (doc 07 §8): returns a failed-but-not-exhausted job to `ready` for another attempt. */
export async function retryJob(
  appDb: AppDatabase,
  id: string,
  runAfterMs: number,
  error: string,
  nowMs: number,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.jobQueue)
        .set({
          state: 'ready',
          lockedBy: null,
          lockedUntil: null,
          runAfter: runAfterMs,
          lastError: error,
          updatedAt: nowMs,
        })
        .where(eq(sqliteSchema.jobQueue.id, id)),
    postgres: (db) =>
      db
        .update(postgresSchema.jobQueue)
        .set({
          state: 'ready',
          lockedBy: null,
          lockedUntil: null,
          runAfter: runAfterMs,
          lastError: error,
          updatedAt: nowMs,
        })
        .where(eq(postgresSchema.jobQueue.id, id)),
    mysql: (db) =>
      db
        .update(mysqlSchema.jobQueue)
        .set({
          state: 'ready',
          lockedBy: null,
          lockedUntil: null,
          runAfter: runAfterMs,
          lastError: error,
          updatedAt: nowMs,
        })
        .where(eq(mysqlSchema.jobQueue.id, id)),
  });
}

export async function markJobFailed(
  appDb: AppDatabase,
  id: string,
  error: string,
  nowMs: number,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.jobQueue)
        .set({ state: 'failed', lastError: error, updatedAt: nowMs })
        .where(eq(sqliteSchema.jobQueue.id, id)),
    postgres: (db) =>
      db
        .update(postgresSchema.jobQueue)
        .set({ state: 'failed', lastError: error, updatedAt: nowMs })
        .where(eq(postgresSchema.jobQueue.id, id)),
    mysql: (db) =>
      db
        .update(mysqlSchema.jobQueue)
        .set({ state: 'failed', lastError: error, updatedAt: nowMs })
        .where(eq(mysqlSchema.jobQueue.id, id)),
  });
}

/** Retention: done/failed jobs, 7 days (doc 05 §10). */
export async function pruneFinishedJobs(appDb: AppDatabase, cutoffMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .delete(sqliteSchema.jobQueue)
        .where(
          and(
            inArray(sqliteSchema.jobQueue.state, ['done', 'failed']),
            lte(sqliteSchema.jobQueue.updatedAt, cutoffMs),
          ),
        ),
    postgres: (db) =>
      db
        .delete(postgresSchema.jobQueue)
        .where(
          and(
            inArray(postgresSchema.jobQueue.state, ['done', 'failed']),
            lte(postgresSchema.jobQueue.updatedAt, cutoffMs),
          ),
        ),
    mysql: (db) =>
      db
        .delete(mysqlSchema.jobQueue)
        .where(
          and(
            inArray(mysqlSchema.jobQueue.state, ['done', 'failed']),
            lte(mysqlSchema.jobQueue.updatedAt, cutoffMs),
          ),
        ),
  });
}

export interface ClaimJobOptions {
  readonly jobNames: readonly string[];
  readonly workerId: string;
  readonly nowMs: number;
  readonly visibilityTimeoutMs: number;
}

/**
 * Atomically claims the highest-priority, oldest-`runAfter` ready job whose name is in
 * `jobNames`, transitioning it to `locked` and stamping `lockedBy`/`lockedUntil`. Returns
 * `undefined` when nothing is claimable. Never claims the same row twice under concurrent
 * callers (doc 10 §1.2) — verified by `claim.test.ts`'s concurrent-claim test on all three
 * engines.
 */
export async function claimNextJob(
  appDb: AppDatabase,
  options: ClaimJobOptions,
): Promise<JobQueueRow | undefined> {
  const { jobNames, workerId, nowMs, visibilityTimeoutMs } = options;
  const lockedUntil = nowMs + visibilityTimeoutMs;
  const names = [...jobNames];

  if (appDb.dialect === 'sqlite') {
    const db = appDb.db;
    // better-sqlite3 transactions must run synchronously to completion — no `await` inside.
    return db.transaction((tx) => {
      const candidate = tx
        .select()
        .from(sqliteSchema.jobQueue)
        .where(
          and(
            inArray(sqliteSchema.jobQueue.jobName, names),
            eq(sqliteSchema.jobQueue.state, 'ready'),
            lte(sqliteSchema.jobQueue.runAfter, nowMs),
          ),
        )
        .orderBy(asc(sqliteSchema.jobQueue.priority), asc(sqliteSchema.jobQueue.runAfter))
        .limit(1)
        .get();
      if (!candidate) return undefined;
      const attempts = candidate.attempts + 1;
      tx.update(sqliteSchema.jobQueue)
        .set({ state: 'locked', lockedBy: workerId, lockedUntil, attempts, updatedAt: nowMs })
        .where(eq(sqliteSchema.jobQueue.id, candidate.id))
        .run();
      return { ...candidate, state: 'locked', lockedBy: workerId, lockedUntil, attempts, updatedAt: nowMs };
    });
  }

  if (appDb.dialect === 'postgres') {
    const db = appDb.db;
    return db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(postgresSchema.jobQueue)
        .where(
          and(
            inArray(postgresSchema.jobQueue.jobName, names),
            eq(postgresSchema.jobQueue.state, 'ready'),
            lte(postgresSchema.jobQueue.runAfter, nowMs),
          ),
        )
        .orderBy(asc(postgresSchema.jobQueue.priority), asc(postgresSchema.jobQueue.runAfter))
        .limit(1)
        .for('update', { skipLocked: true });
      const candidate = rows[0];
      if (!candidate) return undefined;
      const attempts = candidate.attempts + 1;
      await tx
        .update(postgresSchema.jobQueue)
        .set({ state: 'locked', lockedBy: workerId, lockedUntil, attempts, updatedAt: nowMs })
        .where(eq(postgresSchema.jobQueue.id, candidate.id));
      return {
        ...candidate,
        state: 'locked',
        lockedBy: workerId,
        lockedUntil,
        attempts,
        updatedAt: nowMs,
      } as JobQueueRow;
    });
  }

  const db = appDb.db;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(mysqlSchema.jobQueue)
      .where(
        and(
          inArray(mysqlSchema.jobQueue.jobName, names),
          eq(mysqlSchema.jobQueue.state, 'ready'),
          lte(mysqlSchema.jobQueue.runAfter, nowMs),
        ),
      )
      .orderBy(asc(mysqlSchema.jobQueue.priority), asc(mysqlSchema.jobQueue.runAfter))
      .limit(1)
      .for('update', { skipLocked: true });
    const candidate = rows[0];
    if (!candidate) return undefined;
    const attempts = candidate.attempts + 1;
    await tx
      .update(mysqlSchema.jobQueue)
      .set({ state: 'locked', lockedBy: workerId, lockedUntil, attempts, updatedAt: nowMs })
      .where(eq(mysqlSchema.jobQueue.id, candidate.id));
    return {
      ...candidate,
      state: 'locked',
      lockedBy: workerId,
      lockedUntil,
      attempts,
      updatedAt: nowMs,
    } as JobQueueRow;
  });
}

/**
 * Visibility timeout (doc 07 §8, doc 10 §1.2): a claimed job whose lock expired — the
 * worker that claimed it crashed or hung — is returned to `ready` so another worker can
 * pick it up. Bounded retries: a job already at `maxAttempts` is moved to `failed` instead.
 */
/**
 * doc 06 §7's run history must never show a permanently-stuck `running` row: once the heartbeat
 * fix above is in place, a lock can only genuinely expire when the worker that held it stopped
 * renewing it — i.e. it crashed or was killed mid-handler, before it ever reached `finish()`
 * (`runner.ts`). That leaves the corresponding `job_runs` row stuck at `running` forever with no
 * other code path that will ever close it. Reconciling it here, keyed by the exact
 * `job_queue.id` (`jobRuns.jobQueueId`), is what lets this be precise even when the same job
 * name is legitimately running concurrently for a different marketplace.
 */
const INTERRUPTED_ERROR = 'worker stopped responding (visibility timeout expired) — run interrupted';

export async function requeueExpiredJobs(appDb: AppDatabase, nowMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => {
      const expiredIds = db
        .select({ id: sqliteSchema.jobQueue.id })
        .from(sqliteSchema.jobQueue)
        .where(and(eq(sqliteSchema.jobQueue.state, 'locked'), lte(sqliteSchema.jobQueue.lockedUntil, nowMs)))
        .all()
        .map((r) => r.id);
      db.update(sqliteSchema.jobQueue)
        .set({ state: 'ready', lockedBy: null, lockedUntil: null, updatedAt: nowMs })
        .where(
          and(
            eq(sqliteSchema.jobQueue.state, 'locked'),
            lte(sqliteSchema.jobQueue.lockedUntil, nowMs),
            lt(sqliteSchema.jobQueue.attempts, sqliteSchema.jobQueue.maxAttempts),
          ),
        )
        .run();
      db.update(sqliteSchema.jobQueue)
        .set({
          state: 'failed',
          lastError: 'exceeded maxAttempts after visibility timeout',
          updatedAt: nowMs,
        })
        .where(and(eq(sqliteSchema.jobQueue.state, 'locked'), lte(sqliteSchema.jobQueue.lockedUntil, nowMs)))
        .run();
      if (expiredIds.length > 0) {
        db.update(sqliteSchema.jobRuns)
          .set({ state: 'failed', finishedAt: nowMs, error: INTERRUPTED_ERROR })
          .where(
            and(
              inArray(sqliteSchema.jobRuns.jobQueueId, expiredIds),
              eq(sqliteSchema.jobRuns.state, 'running'),
            ),
          )
          .run();
      }
    },
    postgres: async (db) => {
      const expiredIds = (
        await db
          .select({ id: postgresSchema.jobQueue.id })
          .from(postgresSchema.jobQueue)
          .where(
            and(eq(postgresSchema.jobQueue.state, 'locked'), lte(postgresSchema.jobQueue.lockedUntil, nowMs)),
          )
      ).map((r) => r.id);
      await db
        .update(postgresSchema.jobQueue)
        .set({ state: 'ready', lockedBy: null, lockedUntil: null, updatedAt: nowMs })
        .where(
          and(
            eq(postgresSchema.jobQueue.state, 'locked'),
            lte(postgresSchema.jobQueue.lockedUntil, nowMs),
            lt(postgresSchema.jobQueue.attempts, postgresSchema.jobQueue.maxAttempts),
          ),
        );
      await db
        .update(postgresSchema.jobQueue)
        .set({
          state: 'failed',
          lastError: 'exceeded maxAttempts after visibility timeout',
          updatedAt: nowMs,
        })
        .where(
          and(eq(postgresSchema.jobQueue.state, 'locked'), lte(postgresSchema.jobQueue.lockedUntil, nowMs)),
        );
      if (expiredIds.length > 0) {
        await db
          .update(postgresSchema.jobRuns)
          .set({ state: 'failed', finishedAt: nowMs, error: INTERRUPTED_ERROR })
          .where(
            and(
              inArray(postgresSchema.jobRuns.jobQueueId, expiredIds),
              eq(postgresSchema.jobRuns.state, 'running'),
            ),
          );
      }
    },
    mysql: async (db) => {
      const expiredIds = (
        await db
          .select({ id: mysqlSchema.jobQueue.id })
          .from(mysqlSchema.jobQueue)
          .where(and(eq(mysqlSchema.jobQueue.state, 'locked'), lte(mysqlSchema.jobQueue.lockedUntil, nowMs)))
      ).map((r) => r.id);
      await db
        .update(mysqlSchema.jobQueue)
        .set({ state: 'ready', lockedBy: null, lockedUntil: null, updatedAt: nowMs })
        .where(
          and(
            eq(mysqlSchema.jobQueue.state, 'locked'),
            lte(mysqlSchema.jobQueue.lockedUntil, nowMs),
            lt(mysqlSchema.jobQueue.attempts, mysqlSchema.jobQueue.maxAttempts),
          ),
        );
      await db
        .update(mysqlSchema.jobQueue)
        .set({
          state: 'failed',
          lastError: 'exceeded maxAttempts after visibility timeout',
          updatedAt: nowMs,
        })
        .where(and(eq(mysqlSchema.jobQueue.state, 'locked'), lte(mysqlSchema.jobQueue.lockedUntil, nowMs)));
      if (expiredIds.length > 0) {
        await db
          .update(mysqlSchema.jobRuns)
          .set({ state: 'failed', finishedAt: nowMs, error: INTERRUPTED_ERROR })
          .where(
            and(inArray(mysqlSchema.jobRuns.jobQueueId, expiredIds), eq(mysqlSchema.jobRuns.state, 'running')),
          );
      }
    },
  });
}

/**
 * Extends a still-running claim's `lockedUntil` so a handler that legitimately runs longer
 * than the claim's original visibility timeout is not mistaken for a crashed worker and
 * requeued out from under itself. Without this, `requeueExpiredJobs` returns a row to `ready`
 * purely on wall-clock expiry with no way to know the original claimant is still working it —
 * a second worker then claims and runs the *same* job concurrently. For `ScrapeCompetitors`
 * (doc 07 §7) this is not just wasted work: two overlapping sweeps hit the same public pages
 * at once, which is exactly the "aggressive" traffic pattern api-references §1.6 warns risks a
 * block. Only renews while the row is still `locked` and owned by `workerId` — a row already
 * reclaimed by someone else (or finished) is left alone, so a heartbeat that fires just after
 * the visibility timeout already lapsed cannot resurrect a lock that has moved on.
 */
export async function renewJobLock(
  appDb: AppDatabase,
  id: string,
  workerId: string,
  nowMs: number,
  visibilityTimeoutMs: number,
): Promise<void> {
  const lockedUntil = nowMs + visibilityTimeoutMs;
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.jobQueue)
        .set({ lockedUntil, updatedAt: nowMs })
        .where(
          and(
            eq(sqliteSchema.jobQueue.id, id),
            eq(sqliteSchema.jobQueue.state, 'locked'),
            eq(sqliteSchema.jobQueue.lockedBy, workerId),
          ),
        )
        .run(),
    postgres: (db) =>
      db
        .update(postgresSchema.jobQueue)
        .set({ lockedUntil, updatedAt: nowMs })
        .where(
          and(
            eq(postgresSchema.jobQueue.id, id),
            eq(postgresSchema.jobQueue.state, 'locked'),
            eq(postgresSchema.jobQueue.lockedBy, workerId),
          ),
        ),
    mysql: (db) =>
      db
        .update(mysqlSchema.jobQueue)
        .set({ lockedUntil, updatedAt: nowMs })
        .where(
          and(
            eq(mysqlSchema.jobQueue.id, id),
            eq(mysqlSchema.jobQueue.state, 'locked'),
            eq(mysqlSchema.jobQueue.lockedBy, workerId),
          ),
        ),
  });
}

/** The reserved `job_queue.id` for the single scheduler-instance lock row (see below). */
export const SCHEDULER_LOCK_ID = '__scheduler_lock__';
const SCHEDULER_LOCK_JOB_NAME = '__scheduler_lock__';

/**
 * doc 10 §1.1/§1.2: "a lock row in the database guarantees only one scheduler is active."
 * Doc 05 has no dedicated lock table, so this reuses `job_queue` itself — a lock is simply
 * a row whose `state`/`lockedBy`/`lockedUntil` are read exactly like a claimed job, under a
 * reserved id (`SCHEDULER_LOCK_ID`) no real job ever uses. `state: 'ready'` means free,
 * `'locked'` means held; `lockedUntil` is the heartbeat expiry, renewed by the holder.
 */
export async function acquireOrRenewSchedulerLock(
  appDb: AppDatabase,
  ownerId: string,
  nowMs: number,
  ttlMs: number,
): Promise<boolean> {
  const lockedUntil = nowMs + ttlMs;
  const isEligible = (row: { lockedBy: string | null; lockedUntil: number | null }) =>
    row.lockedBy === ownerId || row.lockedUntil === null || row.lockedUntil < nowMs;

  if (appDb.dialect === 'sqlite') {
    const db = appDb.db;
    return db.transaction((tx) => {
      const row = tx
        .select()
        .from(sqliteSchema.jobQueue)
        .where(eq(sqliteSchema.jobQueue.id, SCHEDULER_LOCK_ID))
        .get();
      if (!row) {
        tx.insert(sqliteSchema.jobQueue)
          .values({
            id: SCHEDULER_LOCK_ID,
            jobName: SCHEDULER_LOCK_JOB_NAME,
            payload: '{}',
            priority: 0,
            state: 'locked',
            runAfter: 0,
            lockedBy: ownerId,
            lockedUntil,
            attempts: 0,
            maxAttempts: 0,
            lastError: null,
            createdAt: nowMs,
            updatedAt: nowMs,
          })
          .run();
        return true;
      }
      if (!isEligible(row)) return false;
      tx.update(sqliteSchema.jobQueue)
        .set({ state: 'locked', lockedBy: ownerId, lockedUntil, updatedAt: nowMs })
        .where(eq(sqliteSchema.jobQueue.id, SCHEDULER_LOCK_ID))
        .run();
      return true;
    });
  }

  if (appDb.dialect === 'postgres') {
    const db = appDb.db;
    return db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(postgresSchema.jobQueue)
        .where(eq(postgresSchema.jobQueue.id, SCHEDULER_LOCK_ID))
        .for('update');
      const row = rows[0];
      if (!row) {
        await tx.insert(postgresSchema.jobQueue).values({
          id: SCHEDULER_LOCK_ID,
          jobName: SCHEDULER_LOCK_JOB_NAME,
          payload: '{}',
          priority: 0,
          state: 'locked',
          runAfter: 0,
          lockedBy: ownerId,
          lockedUntil,
          attempts: 0,
          maxAttempts: 0,
          lastError: null,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
        return true;
      }
      if (!isEligible(row)) return false;
      await tx
        .update(postgresSchema.jobQueue)
        .set({ state: 'locked', lockedBy: ownerId, lockedUntil, updatedAt: nowMs })
        .where(eq(postgresSchema.jobQueue.id, SCHEDULER_LOCK_ID));
      return true;
    });
  }

  const db = appDb.db;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(mysqlSchema.jobQueue)
      .where(eq(mysqlSchema.jobQueue.id, SCHEDULER_LOCK_ID))
      .for('update');
    const row = rows[0];
    if (!row) {
      await tx.insert(mysqlSchema.jobQueue).values({
        id: SCHEDULER_LOCK_ID,
        jobName: SCHEDULER_LOCK_JOB_NAME,
        payload: '{}',
        priority: 0,
        state: 'locked',
        runAfter: 0,
        lockedBy: ownerId,
        lockedUntil,
        attempts: 0,
        maxAttempts: 0,
        lastError: null,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      return true;
    }
    if (!isEligible(row)) return false;
    await tx
      .update(mysqlSchema.jobQueue)
      .set({ state: 'locked', lockedBy: ownerId, lockedUntil, updatedAt: nowMs })
      .where(eq(mysqlSchema.jobQueue.id, SCHEDULER_LOCK_ID));
    return true;
  });
}

/** Releases the scheduler lock — a no-op if `ownerId` doesn't currently hold it (doc 07 §8 shutdown). */
export async function releaseSchedulerLock(
  appDb: AppDatabase,
  ownerId: string,
  nowMs: number,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.jobQueue)
        .set({ state: 'ready', lockedBy: null, lockedUntil: null, updatedAt: nowMs })
        .where(
          and(eq(sqliteSchema.jobQueue.id, SCHEDULER_LOCK_ID), eq(sqliteSchema.jobQueue.lockedBy, ownerId)),
        ),
    postgres: (db) =>
      db
        .update(postgresSchema.jobQueue)
        .set({ state: 'ready', lockedBy: null, lockedUntil: null, updatedAt: nowMs })
        .where(
          and(
            eq(postgresSchema.jobQueue.id, SCHEDULER_LOCK_ID),
            eq(postgresSchema.jobQueue.lockedBy, ownerId),
          ),
        ),
    mysql: (db) =>
      db
        .update(mysqlSchema.jobQueue)
        .set({ state: 'ready', lockedBy: null, lockedUntil: null, updatedAt: nowMs })
        .where(
          and(eq(mysqlSchema.jobQueue.id, SCHEDULER_LOCK_ID), eq(mysqlSchema.jobQueue.lockedBy, ownerId)),
        ),
  });
}

export interface JobRunRow {
  readonly id: string;
  readonly jobName: string;
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly state: string;
  readonly itemsTotal: number;
  readonly itemsOk: number;
  readonly itemsFailed: number;
  readonly error: string | null;
  readonly correlationId: string;
  /** The `job_queue.id` this run executes, so an expired claim can close out exactly this row. */
  readonly jobQueueId: string | null;
  /**
   * Live progress (doc 06 §7's run detail panel). Optional on the way *in* — `startJobRun`
   * relies on the column defaults — but always present on rows read back.
   */
  readonly itemsDone?: number;
  readonly currentItem?: string | null;
  readonly progressAt?: number | null;
}

export async function startJobRun(appDb: AppDatabase, row: JobRunRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.jobRuns).values(row),
    postgres: (db) => db.insert(postgresSchema.jobRuns).values(row),
    mysql: (db) => db.insert(mysqlSchema.jobRuns).values(row),
  });
}

export async function finishJobRun(
  appDb: AppDatabase,
  id: string,
  set: {
    state: string;
    finishedAt: number;
    itemsTotal: number;
    itemsOk: number;
    itemsFailed: number;
    error: string | null;
    itemsDone?: number;
    currentItem?: string | null;
    progressAt?: number | null;
  },
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.update(sqliteSchema.jobRuns).set(set).where(eq(sqliteSchema.jobRuns.id, id)),
    postgres: (db) => db.update(postgresSchema.jobRuns).set(set).where(eq(postgresSchema.jobRuns.id, id)),
    mysql: (db) => db.update(mysqlSchema.jobRuns).set(set).where(eq(mysqlSchema.jobRuns.id, id)),
  });
}

/**
 * Heartbeats a running job's progress so the Jobs screen can watch it from the *other*
 * process (doc 06 §7). Deliberately a bare `UPDATE` of three columns and nothing else: it
 * fires repeatedly mid-run, so it must never touch `state`, the item counters that
 * `finishJobRun` settles, or the error — a progress write racing the finish write would
 * otherwise be able to resurrect a completed run as running.
 */
export async function updateJobRunProgress(
  appDb: AppDatabase,
  id: string,
  progress: { itemsDone: number; itemsTotal: number; currentItem: string | null; progressAt: number },
): Promise<void> {
  const set = {
    itemsDone: progress.itemsDone,
    itemsTotal: progress.itemsTotal,
    currentItem: progress.currentItem,
    progressAt: progress.progressAt,
  };
  await runDialect(appDb, {
    sqlite: (db) => db.update(sqliteSchema.jobRuns).set(set).where(eq(sqliteSchema.jobRuns.id, id)),
    postgres: (db) => db.update(postgresSchema.jobRuns).set(set).where(eq(postgresSchema.jobRuns.id, id)),
    mysql: (db) => db.update(mysqlSchema.jobRuns).set(set).where(eq(mysqlSchema.jobRuns.id, id)),
  });
}

/** One run by id — the detail panel's poll target once the UI knows which run it is watching. */
export async function getJobRun(appDb: AppDatabase, id: string): Promise<JobRunRow | undefined> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) => db.select().from(sqliteSchema.jobRuns).where(eq(sqliteSchema.jobRuns.id, id)).limit(1),
    postgres: (db) =>
      db.select().from(postgresSchema.jobRuns).where(eq(postgresSchema.jobRuns.id, id)).limit(1),
    mysql: (db) => db.select().from(mysqlSchema.jobRuns).where(eq(mysqlSchema.jobRuns.id, id)).limit(1),
  })) as JobRunRow[];
  return rows[0];
}

/**
 * Every run currently in `running` state. This is what makes the Run button's disabled state
 * survive a page refresh and cover cadence-triggered runs, not just ones this browser started.
 */
export async function listRunningJobRuns(appDb: AppDatabase): Promise<JobRunRow[]> {
  return withDialect(appDb, {
    sqlite: (db) => db.select().from(sqliteSchema.jobRuns).where(eq(sqliteSchema.jobRuns.state, 'running')),
    postgres: (db) =>
      db.select().from(postgresSchema.jobRuns).where(eq(postgresSchema.jobRuns.state, 'running')),
    mysql: (db) => db.select().from(mysqlSchema.jobRuns).where(eq(mysqlSchema.jobRuns.state, 'running')),
  }) as Promise<JobRunRow[]>;
}

export interface JobRunFilters {
  readonly jobName?: string;
  readonly state?: string;
  readonly sinceMs?: number;
}

/** Run history for the Jobs screen (doc 06 §7): "state, duration, item counts and errors", newest first. */
export async function listJobRuns(
  appDb: AppDatabase,
  filters: JobRunFilters,
  limit = 200,
): Promise<JobRunRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.jobRuns)
        .where(
          and(
            filters.jobName ? eq(sqliteSchema.jobRuns.jobName, filters.jobName) : undefined,
            filters.state ? eq(sqliteSchema.jobRuns.state, filters.state) : undefined,
            filters.sinceMs !== undefined ? gte(sqliteSchema.jobRuns.startedAt, filters.sinceMs) : undefined,
          ),
        )
        .orderBy(desc(sqliteSchema.jobRuns.startedAt))
        .limit(limit),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.jobRuns)
        .where(
          and(
            filters.jobName ? eq(postgresSchema.jobRuns.jobName, filters.jobName) : undefined,
            filters.state ? eq(postgresSchema.jobRuns.state, filters.state) : undefined,
            filters.sinceMs !== undefined
              ? gte(postgresSchema.jobRuns.startedAt, filters.sinceMs)
              : undefined,
          ),
        )
        .orderBy(desc(postgresSchema.jobRuns.startedAt))
        .limit(limit),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.jobRuns)
        .where(
          and(
            filters.jobName ? eq(mysqlSchema.jobRuns.jobName, filters.jobName) : undefined,
            filters.state ? eq(mysqlSchema.jobRuns.state, filters.state) : undefined,
            filters.sinceMs !== undefined ? gte(mysqlSchema.jobRuns.startedAt, filters.sinceMs) : undefined,
          ),
        )
        .orderBy(desc(mysqlSchema.jobRuns.startedAt))
        .limit(limit),
  }) as Promise<JobRunRow[]>;
}

/** The most recent run per job name — "last run" in the Jobs screen's per-job table (doc 06 §7). */
export async function latestJobRunPerJobName(appDb: AppDatabase): Promise<JobRunRow[]> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) => db.select().from(sqliteSchema.jobRuns).orderBy(desc(sqliteSchema.jobRuns.startedAt)),
    postgres: (db) =>
      db.select().from(postgresSchema.jobRuns).orderBy(desc(postgresSchema.jobRuns.startedAt)),
    mysql: (db) => db.select().from(mysqlSchema.jobRuns).orderBy(desc(mysqlSchema.jobRuns.startedAt)),
  })) as JobRunRow[];
  const seen = new Set<string>();
  const latest: JobRunRow[] = [];
  for (const row of rows) {
    if (seen.has(row.jobName)) continue;
    seen.add(row.jobName);
    latest.push(row);
  }
  return latest;
}

/** "Queue depth and currently-claimed jobs" (doc 06 §7) — counts of `job_queue` rows by state. */
export async function queueDepthByState(appDb: AppDatabase): Promise<Record<string, number>> {
  const rows = await withDialect(appDb, {
    sqlite: (db) => db.select({ state: sqliteSchema.jobQueue.state }).from(sqliteSchema.jobQueue),
    postgres: (db) => db.select({ state: postgresSchema.jobQueue.state }).from(postgresSchema.jobQueue),
    mysql: (db) => db.select({ state: mysqlSchema.jobQueue.state }).from(mysqlSchema.jobQueue),
  });
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.state] = (counts[row.state] ?? 0) + 1;
  return counts;
}

/** Currently `locked` (claimed) rows — the Jobs screen's "currently-claimed jobs" list (doc 06 §7). */
export async function listClaimedJobs(appDb: AppDatabase): Promise<JobQueueRow[]> {
  return withDialect(appDb, {
    sqlite: (db) => db.select().from(sqliteSchema.jobQueue).where(eq(sqliteSchema.jobQueue.state, 'locked')),
    postgres: (db) =>
      db.select().from(postgresSchema.jobQueue).where(eq(postgresSchema.jobQueue.state, 'locked')),
    mysql: (db) => db.select().from(mysqlSchema.jobQueue).where(eq(mysqlSchema.jobQueue.state, 'locked')),
  }) as Promise<JobQueueRow[]>;
}

/** Retention: 90 days (doc 05 §10). */
export async function pruneJobRuns(appDb: AppDatabase, cutoffMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.jobRuns).where(lte(sqliteSchema.jobRuns.startedAt, cutoffMs)),
    postgres: (db) =>
      db.delete(postgresSchema.jobRuns).where(lte(postgresSchema.jobRuns.startedAt, cutoffMs)),
    mysql: (db) => db.delete(mysqlSchema.jobRuns).where(lte(mysqlSchema.jobRuns.startedAt, cutoffMs)),
  });
}
