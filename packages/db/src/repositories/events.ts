/** Repository for `app_events` (doc 05 §7) — replaces the legacy `log_table`. */
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export interface AppEventRow {
  readonly id: string;
  readonly at: number;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly marketplaceCode: string | null;
  readonly listingId: string | null;
  readonly jobRunId: string | null;
  readonly code: string;
  readonly message: string;
  readonly context: string | null; // JSON
}

export async function logEvent(appDb: AppDatabase, row: AppEventRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.appEvents).values(row),
    postgres: (db) => db.insert(postgresSchema.appEvents).values(row),
    mysql: (db) => db.insert(mysqlSchema.appEvents).values(row),
  });
}

export async function listRecentEvents(
  appDb: AppDatabase,
  limit: number,
  minLevel?: AppEventRow['level'],
): Promise<AppEventRow[]> {
  const levels = minLevel ? levelsAtOrAbove(minLevel) : undefined;
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.appEvents)
        .where(levels ? inArray(sqliteSchema.appEvents.level, levels) : undefined)
        .orderBy(desc(sqliteSchema.appEvents.at))
        .limit(limit),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.appEvents)
        .where(levels ? inArray(postgresSchema.appEvents.level, levels) : undefined)
        .orderBy(desc(postgresSchema.appEvents.at))
        .limit(limit),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.appEvents)
        .where(levels ? inArray(mysqlSchema.appEvents.level, levels) : undefined)
        .orderBy(desc(mysqlSchema.appEvents.at))
        .limit(limit),
  }) as Promise<AppEventRow[]>;
}

export interface EventFilters {
  readonly minLevel?: AppEventRow['level'];
  readonly marketplaceCode?: string;
  readonly listingId?: string;
  readonly jobRunId?: string;
  readonly code?: string;
  readonly sinceMs?: number;
  readonly untilMs?: number;
}

/** doc 06 §8: "Filter by level, marketplace, listing, job run, date range, code." Structural filters — never a substring scan (doc 09 §20). */
export async function listEventsFiltered(
  appDb: AppDatabase,
  filters: EventFilters,
  limit = 500,
): Promise<AppEventRow[]> {
  const levels = filters.minLevel ? levelsAtOrAbove(filters.minLevel) : undefined;
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.appEvents)
        .where(
          and(
            levels ? inArray(sqliteSchema.appEvents.level, levels) : undefined,
            filters.marketplaceCode
              ? eq(sqliteSchema.appEvents.marketplaceCode, filters.marketplaceCode)
              : undefined,
            filters.listingId ? eq(sqliteSchema.appEvents.listingId, filters.listingId) : undefined,
            filters.jobRunId ? eq(sqliteSchema.appEvents.jobRunId, filters.jobRunId) : undefined,
            filters.code ? eq(sqliteSchema.appEvents.code, filters.code) : undefined,
            filters.sinceMs !== undefined ? gte(sqliteSchema.appEvents.at, filters.sinceMs) : undefined,
            filters.untilMs !== undefined ? lte(sqliteSchema.appEvents.at, filters.untilMs) : undefined,
          ),
        )
        .orderBy(desc(sqliteSchema.appEvents.at))
        .limit(limit),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.appEvents)
        .where(
          and(
            levels ? inArray(postgresSchema.appEvents.level, levels) : undefined,
            filters.marketplaceCode
              ? eq(postgresSchema.appEvents.marketplaceCode, filters.marketplaceCode)
              : undefined,
            filters.listingId ? eq(postgresSchema.appEvents.listingId, filters.listingId) : undefined,
            filters.jobRunId ? eq(postgresSchema.appEvents.jobRunId, filters.jobRunId) : undefined,
            filters.code ? eq(postgresSchema.appEvents.code, filters.code) : undefined,
            filters.sinceMs !== undefined ? gte(postgresSchema.appEvents.at, filters.sinceMs) : undefined,
            filters.untilMs !== undefined ? lte(postgresSchema.appEvents.at, filters.untilMs) : undefined,
          ),
        )
        .orderBy(desc(postgresSchema.appEvents.at))
        .limit(limit),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.appEvents)
        .where(
          and(
            levels ? inArray(mysqlSchema.appEvents.level, levels) : undefined,
            filters.marketplaceCode
              ? eq(mysqlSchema.appEvents.marketplaceCode, filters.marketplaceCode)
              : undefined,
            filters.listingId ? eq(mysqlSchema.appEvents.listingId, filters.listingId) : undefined,
            filters.jobRunId ? eq(mysqlSchema.appEvents.jobRunId, filters.jobRunId) : undefined,
            filters.code ? eq(mysqlSchema.appEvents.code, filters.code) : undefined,
            filters.sinceMs !== undefined ? gte(mysqlSchema.appEvents.at, filters.sinceMs) : undefined,
            filters.untilMs !== undefined ? lte(mysqlSchema.appEvents.at, filters.untilMs) : undefined,
          ),
        )
        .orderBy(desc(mysqlSchema.appEvents.at))
        .limit(limit),
  }) as Promise<AppEventRow[]>;
}

function levelsAtOrAbove(min: AppEventRow['level']): AppEventRow['level'][] {
  const order: AppEventRow['level'][] = ['debug', 'info', 'warn', 'error'];
  return order.slice(order.indexOf(min));
}

/** Retention (doc 05 §10): 90 days for info/debug, 1 year for warn/error. */
export async function pruneEvents(
  appDb: AppDatabase,
  infoDebugCutoffMs: number,
  warnErrorCutoffMs: number,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: async (db) => {
      db.delete(sqliteSchema.appEvents)
        .where(
          and(
            inArray(sqliteSchema.appEvents.level, ['debug', 'info']),
            lte(sqliteSchema.appEvents.at, infoDebugCutoffMs),
          ),
        )
        .run();
      db.delete(sqliteSchema.appEvents)
        .where(
          and(
            inArray(sqliteSchema.appEvents.level, ['warn', 'error']),
            lte(sqliteSchema.appEvents.at, warnErrorCutoffMs),
          ),
        )
        .run();
    },
    postgres: async (db) => {
      await db
        .delete(postgresSchema.appEvents)
        .where(
          and(
            inArray(postgresSchema.appEvents.level, ['debug', 'info']),
            lte(postgresSchema.appEvents.at, infoDebugCutoffMs),
          ),
        );
      await db
        .delete(postgresSchema.appEvents)
        .where(
          and(
            inArray(postgresSchema.appEvents.level, ['warn', 'error']),
            lte(postgresSchema.appEvents.at, warnErrorCutoffMs),
          ),
        );
    },
    mysql: async (db) => {
      await db
        .delete(mysqlSchema.appEvents)
        .where(
          and(
            inArray(mysqlSchema.appEvents.level, ['debug', 'info']),
            lte(mysqlSchema.appEvents.at, infoDebugCutoffMs),
          ),
        );
      await db
        .delete(mysqlSchema.appEvents)
        .where(
          and(
            inArray(mysqlSchema.appEvents.level, ['warn', 'error']),
            lte(mysqlSchema.appEvents.at, warnErrorCutoffMs),
          ),
        );
    },
  });
}
