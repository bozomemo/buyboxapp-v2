/**
 * The notification outbox (doc 17 §6.2, doc 07 §7.6, build plan 11.7).
 *
 * A row per (subject, channel). Written when a band violation opens, drained every minute by
 * `DeliverNotifications`. A failed send is retried, never lost, and never reaches back into the
 * violation that produced it: the violation is stored whether or not anybody is told.
 */
import { and, asc, count, eq, inArray, lte, sql } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export type NotificationChannelCode = 'webhook' | 'email' | 'sms';
export type NotificationSubjectType = 'bandViolation';
export type DeliveryState = 'pending' | 'sent' | 'failed' | 'suppressed';

export const NOTIFICATION_CHANNELS: readonly NotificationChannelCode[] = ['webhook', 'email', 'sms'];

export interface NotificationDeliveryRow {
  readonly id: string;
  readonly subjectType: NotificationSubjectType;
  readonly subjectId: string;
  readonly channel: NotificationChannelCode;
  readonly state: DeliveryState;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly createdAt: number;
  readonly sentAt: number | null;
}

export async function enqueueDeliveries(
  appDb: AppDatabase,
  rows: readonly NotificationDeliveryRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const values = [...rows];
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.notificationDeliveries).values(values),
    postgres: (db) => db.insert(postgresSchema.notificationDeliveries).values(values),
    mysql: (db) => db.insert(mysqlSchema.notificationDeliveries).values(values),
  });
}

/** A channel's pending rows, oldest first. */
export async function pendingDeliveries(
  appDb: AppDatabase,
  channel: NotificationChannelCode,
  limit: number,
): Promise<NotificationDeliveryRow[]> {
  return (await withDialect(appDb, {
    sqlite: (db) => {
      const d = sqliteSchema.notificationDeliveries;
      return db
        .select()
        .from(d)
        .where(and(eq(d.state, 'pending'), eq(d.channel, channel)))
        .orderBy(asc(d.createdAt))
        .limit(limit);
    },
    postgres: (db) => {
      const d = postgresSchema.notificationDeliveries;
      return db
        .select()
        .from(d)
        .where(and(eq(d.state, 'pending'), eq(d.channel, channel)))
        .orderBy(asc(d.createdAt))
        .limit(limit);
    },
    mysql: (db) => {
      const d = mysqlSchema.notificationDeliveries;
      return db
        .select()
        .from(d)
        .where(and(eq(d.state, 'pending'), eq(d.channel, channel)))
        .orderBy(asc(d.createdAt))
        .limit(limit);
    },
  })) as NotificationDeliveryRow[];
}

export async function markSent(appDb: AppDatabase, ids: readonly string[], nowMs: number): Promise<void> {
  if (ids.length === 0) return;
  const list = [...ids];
  const set = { state: 'sent', sentAt: nowMs, lastError: null };
  await runDialect(appDb, {
    sqlite: (db) =>
      db.update(sqliteSchema.notificationDeliveries).set(set).where(inArray(sqliteSchema.notificationDeliveries.id, list)),
    postgres: (db) =>
      db
        .update(postgresSchema.notificationDeliveries)
        .set(set)
        .where(inArray(postgresSchema.notificationDeliveries.id, list)),
    mysql: (db) =>
      db.update(mysqlSchema.notificationDeliveries).set(set).where(inArray(mysqlSchema.notificationDeliveries.id, list)),
  });
}

/**
 * One failed send of these rows: `attempts` + 1 and the error kept; a row that has now reached
 * `maxAttempts` becomes `failed` and is shown as such rather than retried for ever.
 */
export async function recordAttemptFailure(
  appDb: AppDatabase,
  ids: readonly string[],
  error: string,
  maxAttempts: number,
): Promise<void> {
  if (ids.length === 0) return;
  const list = [...ids];
  const message = error.slice(0, 1000);
  await runDialect(appDb, {
    sqlite: (db) => {
      const d = sqliteSchema.notificationDeliveries;
      return db
        .update(d)
        .set({ attempts: sql`${d.attempts} + 1`, lastError: message })
        .where(inArray(d.id, list));
    },
    postgres: (db) => {
      const d = postgresSchema.notificationDeliveries;
      return db
        .update(d)
        .set({ attempts: sql`${d.attempts} + 1`, lastError: message })
        .where(inArray(d.id, list));
    },
    mysql: (db) => {
      const d = mysqlSchema.notificationDeliveries;
      return db
        .update(d)
        .set({ attempts: sql`${d.attempts} + 1`, lastError: message })
        .where(inArray(d.id, list));
    },
  });
  await runDialect(appDb, {
    sqlite: (db) => {
      const d = sqliteSchema.notificationDeliveries;
      return db
        .update(d)
        .set({ state: 'failed' })
        .where(and(inArray(d.id, list), eq(d.state, 'pending'), sql`${d.attempts} >= ${maxAttempts}`));
    },
    postgres: (db) => {
      const d = postgresSchema.notificationDeliveries;
      return db
        .update(d)
        .set({ state: 'failed' })
        .where(and(inArray(d.id, list), eq(d.state, 'pending'), sql`${d.attempts} >= ${maxAttempts}`));
    },
    mysql: (db) => {
      const d = mysqlSchema.notificationDeliveries;
      return db
        .update(d)
        .set({ state: 'failed' })
        .where(and(inArray(d.id, list), eq(d.state, 'pending'), sql`${d.attempts} >= ${maxAttempts}`));
    },
  });
}

/**
 * Pending rows of a channel that has no configuration: the reason is written to `last_error`
 * and `attempts` is left alone, so the row is sent as soon as the channel is configured and the
 * screen can say "kimseye bildirilmedi: e-posta yapılandırılmamış" meanwhile.
 */
export async function noteWaiting(appDb: AppDatabase, ids: readonly string[], reason: string): Promise<void> {
  if (ids.length === 0) return;
  const list = [...ids];
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.notificationDeliveries)
        .set({ lastError: reason })
        .where(inArray(sqliteSchema.notificationDeliveries.id, list)),
    postgres: (db) =>
      db
        .update(postgresSchema.notificationDeliveries)
        .set({ lastError: reason })
        .where(inArray(postgresSchema.notificationDeliveries.id, list)),
    mysql: (db) =>
      db
        .update(mysqlSchema.notificationDeliveries)
        .set({ lastError: reason })
        .where(inArray(mysqlSchema.notificationDeliveries.id, list)),
  });
}

/** Every delivery of these subjects, for the screens. Subjects with none are absent. */
export async function deliveriesForSubjects(
  appDb: AppDatabase,
  subjectType: NotificationSubjectType,
  subjectIds: readonly string[],
): Promise<Map<string, NotificationDeliveryRow[]>> {
  const result = new Map<string, NotificationDeliveryRow[]>();
  for (let start = 0; start < subjectIds.length; start += 200) {
    const chunk = subjectIds.slice(start, start + 200);
    if (chunk.length === 0) continue;
    const rows = (await withDialect(appDb, {
      sqlite: (db) => {
        const d = sqliteSchema.notificationDeliveries;
        return db
          .select()
          .from(d)
          .where(and(eq(d.subjectType, subjectType), inArray(d.subjectId, chunk)));
      },
      postgres: (db) => {
        const d = postgresSchema.notificationDeliveries;
        return db
          .select()
          .from(d)
          .where(and(eq(d.subjectType, subjectType), inArray(d.subjectId, chunk)));
      },
      mysql: (db) => {
        const d = mysqlSchema.notificationDeliveries;
        return db
          .select()
          .from(d)
          .where(and(eq(d.subjectType, subjectType), inArray(d.subjectId, chunk)));
      },
    })) as NotificationDeliveryRow[];
    for (const row of rows) result.set(row.subjectId, [...(result.get(row.subjectId) ?? []), row]);
  }
  return result;
}

/** Per channel, how many rows are in each state — the settings screen's summary. */
export async function countByChannelAndState(
  appDb: AppDatabase,
): Promise<{ channel: NotificationChannelCode; state: DeliveryState; n: number }[]> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) => {
      const d = sqliteSchema.notificationDeliveries;
      return db.select({ channel: d.channel, state: d.state, n: count() }).from(d).groupBy(d.channel, d.state);
    },
    postgres: (db) => {
      const d = postgresSchema.notificationDeliveries;
      return db.select({ channel: d.channel, state: d.state, n: count() }).from(d).groupBy(d.channel, d.state);
    },
    mysql: (db) => {
      const d = mysqlSchema.notificationDeliveries;
      return db.select({ channel: d.channel, state: d.state, n: count() }).from(d).groupBy(d.channel, d.state);
    },
  })) as { channel: NotificationChannelCode; state: DeliveryState; n: number | string }[];
  return rows.map((r) => ({ ...r, n: Number(r.n) }));
}

/**
 * Retention for `notification_deliveries` (doc 05 §10, build plan 11.8): every row created
 * before the cutoff, **whatever its state**. A row still `pending` that old belongs to a channel
 * nobody configured in a month; configuring it now should not send a month-old digest, which is
 * exactly the bound doc 17 §6.2 promises ("the 30-day window bounds how far back that reaches").
 */
export async function pruneNotificationDeliveries(appDb: AppDatabase, cutoffMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.notificationDeliveries).where(lte(sqliteSchema.notificationDeliveries.createdAt, cutoffMs)),
    postgres: (db) =>
      db.delete(postgresSchema.notificationDeliveries).where(lte(postgresSchema.notificationDeliveries.createdAt, cutoffMs)),
    mysql: (db) => db.delete(mysqlSchema.notificationDeliveries).where(lte(mysqlSchema.notificationDeliveries.createdAt, cutoffMs)),
  });
}
