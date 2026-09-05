/**
 * Open/resolved state for audit findings (2026-09-03).
 *
 * `deriveAuditFindings` recomputes every finding from the archive whenever it is asked, which is
 * exactly right for a screen and useless for a notification: a cadence job with no memory either
 * tells the operator the same twelve things every hour or tells them nothing. This repository is
 * that memory, and nothing more — it stores no judgement, only which findings were already seen
 * and which have already been sent.
 *
 * Modelled on `alerts` next door, deliberately and down to the details: a state rather than a
 * log, one open row per key at a time, a returning finding as a second span rather than an
 * edited first one, and the finding's own numbers held on the row because the observations
 * behind them are pruned at 90 days.
 */
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

/** One finding as the caller derived it. `key` is `AuditFinding.id`, stable across runs. */
export interface DerivedFinding {
  readonly key: string;
  readonly kind: string;
  readonly basis: string;
  readonly magnitude: number;
  /** The finding itself, JSON-serialised by the caller — see `brandFindings.payload`. */
  readonly payload: string;
}

export interface BrandFindingRow {
  readonly id: string;
  readonly watchedBrandId: string;
  readonly findingKey: string;
  readonly kind: string;
  readonly basis: string;
  readonly state: 'open' | 'resolved';
  readonly magnitude: number;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly resolvedAt: number | null;
  readonly notifiedAt: number | null;
  readonly payload: string;
}

export interface ReconcileResult {
  /** Findings that were not open before this run — the ones worth telling someone about. */
  readonly opened: readonly BrandFindingRow[];
  /** Findings that were open and are no longer produced by the archive. */
  readonly resolved: number;
  /** Findings that were already open and still are. */
  readonly unchanged: number;
}

/** Every finding currently open for a brand, most extreme first. */
export async function openFindings(appDb: AppDatabase, watchedBrandId: string): Promise<BrandFindingRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.brandFindings)
        .where(
          and(
            eq(sqliteSchema.brandFindings.watchedBrandId, watchedBrandId),
            eq(sqliteSchema.brandFindings.state, 'open'),
          ),
        )
        .orderBy(desc(sqliteSchema.brandFindings.magnitude)),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.brandFindings)
        .where(
          and(
            eq(postgresSchema.brandFindings.watchedBrandId, watchedBrandId),
            eq(postgresSchema.brandFindings.state, 'open'),
          ),
        )
        .orderBy(desc(postgresSchema.brandFindings.magnitude)),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.brandFindings)
        .where(
          and(
            eq(mysqlSchema.brandFindings.watchedBrandId, watchedBrandId),
            eq(mysqlSchema.brandFindings.state, 'open'),
          ),
        )
        .orderBy(desc(mysqlSchema.brandFindings.magnitude)),
  }) as Promise<BrandFindingRow[]>;
}

/**
 * Brings the stored state in line with what the archive now says, and reports what changed.
 *
 * Three cases, and the third is the one worth being careful about:
 *
 * - **New** — no open row for this key. A row is inserted and returned in `opened`. This is the
 *   only list a notifier should ever read.
 * - **Still true** — an open row exists. `last_seen_at` moves; **`notified_at` is left alone**,
 *   which is what stops an hourly job from re-announcing the same condition every hour.
 * - **Gone** — an open row whose key the archive no longer produces. Resolved, with a timestamp.
 *   Note that a finding can disappear because the condition ended *or* because an operator moved
 *   a threshold, and this cannot tell the two apart — which is why resolving is silent. Only
 *   openings are notified; a "resolved" notification would fire on every threshold edit.
 *
 * `payload` and `magnitude` are refreshed on an unchanged finding, so an open row always carries
 * the newest numbers rather than the ones it opened with. The *span* is the thing being tracked;
 * the figures inside it are a snapshot of now.
 */
export async function reconcileBrandFindings(
  appDb: AppDatabase,
  watchedBrandId: string,
  derived: readonly DerivedFinding[],
  nowMs: number,
): Promise<ReconcileResult> {
  const existing = await openFindings(appDb, watchedBrandId);
  const existingByKey = new Map(existing.map((row) => [row.findingKey, row]));
  const derivedByKey = new Map(derived.map((d) => [d.key, d]));

  const opened: BrandFindingRow[] = [];
  const stillOpen: { row: BrandFindingRow; derived: DerivedFinding }[] = [];
  for (const d of derived) {
    const row = existingByKey.get(d.key);
    if (row === undefined) {
      opened.push({
        id: newId(),
        watchedBrandId,
        findingKey: d.key,
        kind: d.kind,
        basis: d.basis,
        state: 'open',
        magnitude: d.magnitude,
        firstSeenAt: nowMs,
        lastSeenAt: nowMs,
        resolvedAt: null,
        notifiedAt: null,
        payload: d.payload,
      });
    } else {
      stillOpen.push({ row, derived: d });
    }
  }

  const goneIds = existing.filter((row) => !derivedByKey.has(row.findingKey)).map((row) => row.id);

  if (opened.length > 0) {
    await runDialect(appDb, {
      sqlite: (db) => db.insert(sqliteSchema.brandFindings).values([...opened]),
      postgres: (db) => db.insert(postgresSchema.brandFindings).values([...opened]),
      mysql: (db) => db.insert(mysqlSchema.brandFindings).values([...opened]),
    });
  }

  for (const { row, derived: d } of stillOpen) {
    const set = { lastSeenAt: nowMs, magnitude: d.magnitude, payload: d.payload };
    await runDialect(appDb, {
      sqlite: (db) =>
        db.update(sqliteSchema.brandFindings).set(set).where(eq(sqliteSchema.brandFindings.id, row.id)),
      postgres: (db) =>
        db.update(postgresSchema.brandFindings).set(set).where(eq(postgresSchema.brandFindings.id, row.id)),
      mysql: (db) =>
        db.update(mysqlSchema.brandFindings).set(set).where(eq(mysqlSchema.brandFindings.id, row.id)),
    });
  }

  if (goneIds.length > 0) {
    const set = { state: 'resolved', resolvedAt: nowMs };
    await runDialect(appDb, {
      sqlite: (db) =>
        db.update(sqliteSchema.brandFindings).set(set).where(inArray(sqliteSchema.brandFindings.id, goneIds)),
      postgres: (db) =>
        db
          .update(postgresSchema.brandFindings)
          .set(set)
          .where(inArray(postgresSchema.brandFindings.id, goneIds)),
      mysql: (db) =>
        db.update(mysqlSchema.brandFindings).set(set).where(inArray(mysqlSchema.brandFindings.id, goneIds)),
    });
  }

  return { opened, resolved: goneIds.length, unchanged: stillOpen.length };
}

/**
 * Marks findings as told-about.
 *
 * Written **after** a successful send, never before and never as part of opening the row. A
 * finding whose notification failed keeps `notified_at` null and is picked up by the next run —
 * which is the whole reason this is a separate column rather than an inference from
 * `first_seen_at`.
 */
export async function markFindingsNotified(
  appDb: AppDatabase,
  ids: readonly string[],
  nowMs: number,
): Promise<void> {
  if (ids.length === 0) return;
  const set = { notifiedAt: nowMs };
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.brandFindings)
        .set(set)
        .where(inArray(sqliteSchema.brandFindings.id, [...ids])),
    postgres: (db) =>
      db
        .update(postgresSchema.brandFindings)
        .set(set)
        .where(inArray(postgresSchema.brandFindings.id, [...ids])),
    mysql: (db) =>
      db
        .update(mysqlSchema.brandFindings)
        .set(set)
        .where(inArray(mysqlSchema.brandFindings.id, [...ids])),
  });
}

/**
 * Open findings nobody has been told about, across every brand — the notifier's work list.
 *
 * Ordered oldest-first so a backlog is sent in the order it happened, and bounded so a first run
 * over a large archive cannot turn into one enormous message.
 */
export async function unnotifiedFindings(appDb: AppDatabase, limit: number): Promise<BrandFindingRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.brandFindings)
        .where(
          and(eq(sqliteSchema.brandFindings.state, 'open'), isNull(sqliteSchema.brandFindings.notifiedAt)),
        )
        .orderBy(asc(sqliteSchema.brandFindings.firstSeenAt))
        .limit(limit),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.brandFindings)
        .where(
          and(
            eq(postgresSchema.brandFindings.state, 'open'),
            isNull(postgresSchema.brandFindings.notifiedAt),
          ),
        )
        .limit(limit),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.brandFindings)
        .where(and(eq(mysqlSchema.brandFindings.state, 'open'), isNull(mysqlSchema.brandFindings.notifiedAt)))
        .orderBy(asc(mysqlSchema.brandFindings.firstSeenAt))
        .limit(limit),
  }) as Promise<BrandFindingRow[]>;
}
