/**
 * Repositories for `alert_rules`, `alerts` and `alert_sellers` (doc 05 §5, doc 12 Phase 10C).
 *
 * The interesting part is `reconcileAlerts`, which turns a stateless evaluation ("these rules
 * match right now") into the state an operator actually reads ("this has been open since
 * Tuesday, and two more sellers joined it this morning").
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export interface AlertRuleRow {
  readonly id: string;
  readonly name: string;
  readonly scopeType: string;
  readonly scopeValue: string | null;
  readonly subjectType: string;
  readonly subjectValue: string | null;
  readonly predicate: string;
  readonly thresholdType: string;
  readonly thresholdValue: bigint | null;
  readonly thresholdPct: number | null;
  readonly quietPeriodMs: number;
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface AlertRow {
  readonly id: string;
  readonly ruleId: string;
  readonly alertKey: string;
  readonly listingId: string;
  readonly sellerRef: string | null;
  readonly state: 'open' | 'resolved';
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly resolvedAt: number | null;
  readonly thresholdApplied: bigint | null;
  readonly snapshot: string | null;
}

export interface AlertSellerRow {
  readonly id: string;
  readonly alertId: string;
  readonly sellerRef: string | null;
  readonly sellerName: string;
  readonly observedPrice: bigint | null;
  readonly priceSource: string;
  readonly rank: number;
  readonly promotionText: string | null;
  readonly joinedAt: number;
  readonly leftAt: number | null;
}

const table = {
  sqlite: sqliteSchema,
  postgres: postgresSchema,
  mysql: mysqlSchema,
} as const;

export async function listAlertRules(appDb: AppDatabase, onlyEnabled = false): Promise<AlertRuleRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(table.sqlite.alertRules)
        .where(onlyEnabled ? eq(table.sqlite.alertRules.enabled, true) : undefined),
    postgres: (db) =>
      db
        .select()
        .from(table.postgres.alertRules)
        .where(onlyEnabled ? eq(table.postgres.alertRules.enabled, true) : undefined),
    mysql: (db) =>
      db
        .select()
        .from(table.mysql.alertRules)
        .where(onlyEnabled ? eq(table.mysql.alertRules.enabled, true) : undefined),
  }) as Promise<AlertRuleRow[]>;
}

export async function upsertAlertRule(appDb: AppDatabase, row: AlertRuleRow): Promise<void> {
  const set = {
    name: row.name,
    scopeType: row.scopeType,
    scopeValue: row.scopeValue,
    subjectType: row.subjectType,
    subjectValue: row.subjectValue,
    predicate: row.predicate,
    thresholdType: row.thresholdType,
    thresholdValue: row.thresholdValue,
    thresholdPct: row.thresholdPct,
    quietPeriodMs: row.quietPeriodMs,
    enabled: row.enabled,
    updatedAt: row.updatedAt,
  };
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(table.sqlite.alertRules)
        .values(row)
        .onConflictDoUpdate({ target: table.sqlite.alertRules.id, set }),
    postgres: (db) =>
      db
        .insert(table.postgres.alertRules)
        .values(row)
        .onConflictDoUpdate({ target: table.postgres.alertRules.id, set }),
    mysql: (db) => db.insert(table.mysql.alertRules).values(row).onDuplicateKeyUpdate({ set }),
  });
}

export async function deleteAlertRule(appDb: AppDatabase, ruleId: string): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.delete(table.sqlite.alertRules).where(eq(table.sqlite.alertRules.id, ruleId)),
    postgres: (db) =>
      db.delete(table.postgres.alertRules).where(eq(table.postgres.alertRules.id, ruleId)),
    mysql: (db) => db.delete(table.mysql.alertRules).where(eq(table.mysql.alertRules.id, ruleId)),
  });
}

/** The currently-open alert for a dedup key, if any. At most one exists by construction. */
async function openAlertByKey(appDb: AppDatabase, alertKey: string): Promise<AlertRow | undefined> {
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(table.sqlite.alerts)
        .where(and(eq(table.sqlite.alerts.alertKey, alertKey), eq(table.sqlite.alerts.state, 'open')))
        .limit(1),
    postgres: (db) =>
      db
        .select()
        .from(table.postgres.alerts)
        .where(and(eq(table.postgres.alerts.alertKey, alertKey), eq(table.postgres.alerts.state, 'open')))
        .limit(1),
    mysql: (db) =>
      db
        .select()
        .from(table.mysql.alerts)
        .where(and(eq(table.mysql.alerts.alertKey, alertKey), eq(table.mysql.alerts.state, 'open')))
        .limit(1),
  });
  return rows[0] as AlertRow | undefined;
}

/** The most recently resolved alert for a key — the input to the quiet period. */
async function lastResolvedByKey(appDb: AppDatabase, alertKey: string): Promise<AlertRow | undefined> {
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(table.sqlite.alerts)
        .where(and(eq(table.sqlite.alerts.alertKey, alertKey), eq(table.sqlite.alerts.state, 'resolved')))
        .orderBy(desc(table.sqlite.alerts.resolvedAt))
        .limit(1),
    postgres: (db) =>
      db
        .select()
        .from(table.postgres.alerts)
        .where(
          and(eq(table.postgres.alerts.alertKey, alertKey), eq(table.postgres.alerts.state, 'resolved')),
        )
        .orderBy(desc(table.postgres.alerts.resolvedAt))
        .limit(1),
    mysql: (db) =>
      db
        .select()
        .from(table.mysql.alerts)
        .where(and(eq(table.mysql.alerts.alertKey, alertKey), eq(table.mysql.alerts.state, 'resolved')))
        .orderBy(desc(table.mysql.alerts.resolvedAt))
        .limit(1),
  });
  return rows[0] as AlertRow | undefined;
}

async function activeSellers(appDb: AppDatabase, alertId: string): Promise<AlertSellerRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(table.sqlite.alertSellers)
        .where(and(eq(table.sqlite.alertSellers.alertId, alertId), isNull(table.sqlite.alertSellers.leftAt))),
    postgres: (db) =>
      db
        .select()
        .from(table.postgres.alertSellers)
        .where(
          and(eq(table.postgres.alertSellers.alertId, alertId), isNull(table.postgres.alertSellers.leftAt)),
        ),
    mysql: (db) =>
      db
        .select()
        .from(table.mysql.alertSellers)
        .where(and(eq(table.mysql.alertSellers.alertId, alertId), isNull(table.mysql.alertSellers.leftAt))),
  }) as Promise<AlertSellerRow[]>;
}

/** One rule's verdict on one listing, as produced by `evaluateAlertRules` in `packages/core`. */
export interface AlertOutcome {
  readonly ruleId: string;
  readonly alertKey: string;
  readonly listingId: string;
  /** Set for a rule targeting one seller; null for an "any seller" rule. */
  readonly sellerRef: string | null;
  readonly quietPeriodMs: number;
  readonly matched: boolean;
  readonly thresholdApplied: bigint | null;
  readonly snapshot: string | null;
  readonly sellers: readonly {
    readonly sellerRef: string | null;
    readonly sellerName: string;
    readonly observedPrice: bigint | null;
    readonly priceSource: string;
    readonly rank: number;
    readonly promotionText: string | null;
  }[];
}

export interface ReconcileResult {
  readonly opened: number;
  readonly stillOpen: number;
  readonly resolved: number;
  readonly suppressedByQuietPeriod: number;
  readonly sellersJoined: number;
  readonly sellersLeft: number;
}

/**
 * Folds a set of stateless verdicts into the alert state.
 *
 * Four transitions, and the third is the one that makes the feature usable rather than noisy:
 *
 * 1. **matched, nothing open** → open a new alert, unless the quiet period still covers it.
 * 2. **matched, already open** → refresh `last_seen_at` and the evidence; reconcile the seller
 *    list underneath. A seller joining an existing breach is a change to this alert, not a new
 *    one — otherwise a market-wide collapse produces twenty rows the operator must reassemble.
 * 3. **no longer matched, open** → resolve, and stamp every still-active seller as departed.
 * 4. **no longer matched, nothing open** → nothing to do.
 *
 * `outcomes` must cover every rule that was *in scope*, matched or not. A rule missing from the
 * list is left alone rather than resolved, so a listing that was not scraped this cycle does
 * not silently clear its own alerts.
 */
export async function reconcileAlerts(
  appDb: AppDatabase,
  outcomes: readonly AlertOutcome[],
  nowMs: number,
): Promise<ReconcileResult> {
  let opened = 0;
  let stillOpen = 0;
  let resolved = 0;
  let suppressedByQuietPeriod = 0;
  let sellersJoined = 0;
  let sellersLeft = 0;

  for (const outcome of outcomes) {
    const open = await openAlertByKey(appDb, outcome.alertKey);

    if (!outcome.matched) {
      if (!open) continue;
      await setAlertResolved(appDb, open.id, nowMs);
      await markSellersLeft(appDb, open.id, nowMs);
      resolved += 1;
      continue;
    }

    if (open) {
      await touchAlert(appDb, open.id, nowMs, outcome.thresholdApplied, outcome.snapshot);
      const delta = await reconcileAlertSellers(appDb, open.id, outcome, nowMs);
      sellersJoined += delta.joined;
      sellersLeft += delta.left;
      stillOpen += 1;
      continue;
    }

    // A condition that clears and returns is two spans, so this looks at the previous span's
    // resolution rather than reopening the same row. Without the quiet period a competitor
    // oscillating around the threshold reopens an alert every cycle until the screen is ignored.
    const previous = await lastResolvedByKey(appDb, outcome.alertKey);
    if (
      previous?.resolvedAt !== null &&
      previous?.resolvedAt !== undefined &&
      nowMs - previous.resolvedAt < outcome.quietPeriodMs
    ) {
      suppressedByQuietPeriod += 1;
      continue;
    }

    const alertId = newId();
    await insertAlert(appDb, {
      id: alertId,
      ruleId: outcome.ruleId,
      alertKey: outcome.alertKey,
      listingId: outcome.listingId,
      sellerRef: outcome.sellerRef,
      state: 'open',
      firstSeenAt: nowMs,
      lastSeenAt: nowMs,
      resolvedAt: null,
      thresholdApplied: outcome.thresholdApplied,
      snapshot: outcome.snapshot,
    });
    const delta = await reconcileAlertSellers(appDb, alertId, outcome, nowMs);
    sellersJoined += delta.joined;
    opened += 1;
  }

  return { opened, stillOpen, resolved, suppressedByQuietPeriod, sellersJoined, sellersLeft };
}

async function insertAlert(appDb: AppDatabase, row: AlertRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(table.sqlite.alerts).values(row),
    postgres: (db) => db.insert(table.postgres.alerts).values(row),
    mysql: (db) => db.insert(table.mysql.alerts).values(row),
  });
}

async function touchAlert(
  appDb: AppDatabase,
  alertId: string,
  nowMs: number,
  thresholdApplied: bigint | null,
  snapshot: string | null,
): Promise<void> {
  const set = { lastSeenAt: nowMs, thresholdApplied, snapshot };
  await runDialect(appDb, {
    sqlite: (db) => db.update(table.sqlite.alerts).set(set).where(eq(table.sqlite.alerts.id, alertId)),
    postgres: (db) =>
      db.update(table.postgres.alerts).set(set).where(eq(table.postgres.alerts.id, alertId)),
    mysql: (db) => db.update(table.mysql.alerts).set(set).where(eq(table.mysql.alerts.id, alertId)),
  });
}

async function setAlertResolved(appDb: AppDatabase, alertId: string, nowMs: number): Promise<void> {
  const set = { state: 'resolved', resolvedAt: nowMs, lastSeenAt: nowMs };
  await runDialect(appDb, {
    sqlite: (db) => db.update(table.sqlite.alerts).set(set).where(eq(table.sqlite.alerts.id, alertId)),
    postgres: (db) =>
      db.update(table.postgres.alerts).set(set).where(eq(table.postgres.alerts.id, alertId)),
    mysql: (db) => db.update(table.mysql.alerts).set(set).where(eq(table.mysql.alerts.id, alertId)),
  });
}

async function markSellersLeft(appDb: AppDatabase, alertId: string, nowMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(table.sqlite.alertSellers)
        .set({ leftAt: nowMs })
        .where(and(eq(table.sqlite.alertSellers.alertId, alertId), isNull(table.sqlite.alertSellers.leftAt))),
    postgres: (db) =>
      db
        .update(table.postgres.alertSellers)
        .set({ leftAt: nowMs })
        .where(
          and(eq(table.postgres.alertSellers.alertId, alertId), isNull(table.postgres.alertSellers.leftAt)),
        ),
    mysql: (db) =>
      db
        .update(table.mysql.alertSellers)
        .set({ leftAt: nowMs })
        .where(and(eq(table.mysql.alertSellers.alertId, alertId), isNull(table.mysql.alertSellers.leftAt))),
  });
}

/**
 * Brings the seller list under one open alert in line with who is breaching it now.
 *
 * Identity is the merchant ref where there is one and the display name otherwise — the only
 * place this repository falls back to a name, and only to tell two rows of a single alert
 * apart, never to claim two sightings are the same company.
 */
async function reconcileAlertSellers(
  appDb: AppDatabase,
  alertId: string,
  outcome: AlertOutcome,
  nowMs: number,
): Promise<{ joined: number; left: number }> {
  const current = await activeSellers(appDb, alertId);
  const keyOf = (s: { sellerRef: string | null; sellerName: string }) => s.sellerRef ?? `name:${s.sellerName}`;
  const currentKeys = new Set(current.map(keyOf));
  const incomingKeys = new Set(outcome.sellers.map(keyOf));

  const toAdd = outcome.sellers.filter((s) => !currentKeys.has(keyOf(s)));
  const toRemove = current.filter((s) => !incomingKeys.has(keyOf(s)));

  if (toAdd.length > 0) {
    const rows = toAdd.map((s) => ({
      id: newId(),
      alertId,
      sellerRef: s.sellerRef,
      sellerName: s.sellerName,
      observedPrice: s.observedPrice,
      priceSource: s.priceSource,
      rank: s.rank,
      promotionText: s.promotionText,
      joinedAt: nowMs,
      leftAt: null,
    }));
    await runDialect(appDb, {
      sqlite: (db) => db.insert(table.sqlite.alertSellers).values(rows),
      postgres: (db) => db.insert(table.postgres.alertSellers).values(rows),
      mysql: (db) => db.insert(table.mysql.alertSellers).values(rows),
    });
  }

  if (toRemove.length > 0) {
    const ids = toRemove.map((s) => s.id);
    await runDialect(appDb, {
      sqlite: (db) =>
        db
          .update(table.sqlite.alertSellers)
          .set({ leftAt: nowMs })
          .where(inArray(table.sqlite.alertSellers.id, ids)),
      postgres: (db) =>
        db
          .update(table.postgres.alertSellers)
          .set({ leftAt: nowMs })
          .where(inArray(table.postgres.alertSellers.id, ids)),
      mysql: (db) =>
        db
          .update(table.mysql.alertSellers)
          .set({ leftAt: nowMs })
          .where(inArray(table.mysql.alertSellers.id, ids)),
    });
  }

  // Prices move while a breach persists; the evidence should show the latest, not the first.
  for (const seller of outcome.sellers) {
    const existing = current.find((c) => keyOf(c) === keyOf(seller));
    if (!existing) continue;
    if (existing.observedPrice === seller.observedPrice && existing.rank === seller.rank) continue;
    const set = { observedPrice: seller.observedPrice, rank: seller.rank, priceSource: seller.priceSource };
    await runDialect(appDb, {
      sqlite: (db) =>
        db.update(table.sqlite.alertSellers).set(set).where(eq(table.sqlite.alertSellers.id, existing.id)),
      postgres: (db) =>
        db
          .update(table.postgres.alertSellers)
          .set(set)
          .where(eq(table.postgres.alertSellers.id, existing.id)),
      mysql: (db) =>
        db.update(table.mysql.alertSellers).set(set).where(eq(table.mysql.alertSellers.id, existing.id)),
    });
  }

  return { joined: toAdd.length, left: toRemove.length };
}

export interface AlertWithSellers extends AlertRow {
  readonly sellers: AlertSellerRow[];
}

/** Open alerts, newest activity first — the dashboard's and `/alerts`'s only read. */
export async function listAlerts(
  appDb: AppDatabase,
  state: 'open' | 'resolved' | 'all' = 'open',
  limit = 500,
): Promise<AlertWithSellers[]> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(table.sqlite.alerts)
        .where(state === 'all' ? undefined : eq(table.sqlite.alerts.state, state))
        .orderBy(desc(table.sqlite.alerts.lastSeenAt))
        .limit(limit),
    postgres: (db) =>
      db
        .select()
        .from(table.postgres.alerts)
        .where(state === 'all' ? undefined : eq(table.postgres.alerts.state, state))
        .orderBy(desc(table.postgres.alerts.lastSeenAt))
        .limit(limit),
    mysql: (db) =>
      db
        .select()
        .from(table.mysql.alerts)
        .where(state === 'all' ? undefined : eq(table.mysql.alerts.state, state))
        .orderBy(desc(table.mysql.alerts.lastSeenAt))
        .limit(limit),
  })) as AlertRow[];

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const sellers = (await withDialect(appDb, {
    sqlite: (db) =>
      db.select().from(table.sqlite.alertSellers).where(inArray(table.sqlite.alertSellers.alertId, ids)),
    postgres: (db) =>
      db.select().from(table.postgres.alertSellers).where(inArray(table.postgres.alertSellers.alertId, ids)),
    mysql: (db) =>
      db.select().from(table.mysql.alertSellers).where(inArray(table.mysql.alertSellers.alertId, ids)),
  })) as AlertSellerRow[];

  const byAlert = new Map<string, AlertSellerRow[]>();
  for (const s of sellers) {
    if (!byAlert.has(s.alertId)) byAlert.set(s.alertId, []);
    byAlert.get(s.alertId)!.push(s);
  }
  return rows.map((r) => ({ ...r, sellers: byAlert.get(r.id) ?? [] }));
}

export async function countOpenAlerts(appDb: AppDatabase): Promise<number> {
  const value = await withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(table.sqlite.alerts)
          .where(eq(table.sqlite.alerts.state, 'open'))
      )[0]?.n,
    postgres: async (db) =>
      (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(table.postgres.alerts)
          .where(eq(table.postgres.alerts.state, 'open'))
      )[0]?.n,
    mysql: async (db) =>
      (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(table.mysql.alerts)
          .where(eq(table.mysql.alerts.state, 'open'))
      )[0]?.n,
  });
  return Number(value ?? 0);
}
