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
export async function requeueExpiredJobs(appDb: AppDatabase, nowMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => {
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
    },
    postgres: async (db) => {
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
    },
    mysql: async (db) => {
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
    },
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
  },
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.update(sqliteSchema.jobRuns).set(set).where(eq(sqliteSchema.jobRuns.id, id)),
    postgres: (db) => db.update(postgresSchema.jobRuns).set(set).where(eq(postgresSchema.jobRuns.id, id)),
    mysql: (db) => db.update(mysqlSchema.jobRuns).set(set).where(eq(mysqlSchema.jobRuns.id, id)),
  });
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
