/**
 * Repositories for `buybox_observations`, `scrape_runs`, `competitor_observations`
 * (doc 05 §5) — the two-tier competitor history described in doc 10 §5.
 */
import { and, desc, eq, lte } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export interface BuyboxObservationRow {
  readonly id: string;
  readonly listingId: string;
  readonly observedAt: number;
  readonly rank: number | null;
  readonly buyboxPrice: bigint | null;
  readonly secondPrice: bigint | null;
  readonly thirdPrice: bigint | null;
  readonly hasMultipleSeller: boolean;
  readonly source: 'api' | 'scrape';
}

/** Written on every poll (doc 05 §5) — the control signal, never skipped. */
export async function insertBuyboxObservation(appDb: AppDatabase, row: BuyboxObservationRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.buyboxObservations).values(row),
    postgres: (db) => db.insert(postgresSchema.buyboxObservations).values(row),
    mysql: (db) => db.insert(mysqlSchema.buyboxObservations).values(row),
  });
}

export async function latestBuyboxObservation(
  appDb: AppDatabase,
  listingId: string,
): Promise<BuyboxObservationRow | undefined> {
  const result = await withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.buyboxObservations)
          .where(eq(sqliteSchema.buyboxObservations.listingId, listingId))
          .orderBy(desc(sqliteSchema.buyboxObservations.observedAt))
          .limit(1)
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.buyboxObservations)
          .where(eq(postgresSchema.buyboxObservations.listingId, listingId))
          .orderBy(desc(postgresSchema.buyboxObservations.observedAt))
          .limit(1)
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.buyboxObservations)
          .where(eq(mysqlSchema.buyboxObservations.listingId, listingId))
          .orderBy(desc(mysqlSchema.buyboxObservations.observedAt))
          .limit(1)
      )[0],
  });
  // The `source` (and elsewhere `state`/`phase`/etc.) columns are plain `text` at the
  // Drizzle level (doc 05 §1: "Enums | text + check constraint" — no native enum type is
  // portable), so a SELECT's inferred type is a bare `string`; the literal union here is
  // the application-level contract a CHECK constraint enforces at the database level.
  return result as BuyboxObservationRow | undefined;
}

/** Retention: 90 days (doc 05 §10). */
export async function pruneBuyboxObservations(appDb: AppDatabase, cutoffMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .delete(sqliteSchema.buyboxObservations)
        .where(lte(sqliteSchema.buyboxObservations.observedAt, cutoffMs)),
    postgres: (db) =>
      db
        .delete(postgresSchema.buyboxObservations)
        .where(lte(postgresSchema.buyboxObservations.observedAt, cutoffMs)),
    mysql: (db) =>
      db
        .delete(mysqlSchema.buyboxObservations)
        .where(lte(mysqlSchema.buyboxObservations.observedAt, cutoffMs)),
  });
}

export interface ScrapeRunRow {
  readonly id: string;
  readonly listingId: string;
  readonly observedAt: number;
  readonly source: string;
  readonly sellerCount: number;
  readonly payloadHash: string;
  readonly status: 'ok' | 'parseFailed' | 'fetchFailed';
  readonly changed: boolean;
}

export interface CompetitorObservationRow {
  readonly id: string;
  readonly listingId: string;
  readonly scrapeRunId: string;
  readonly observedAt: number;
  readonly rank: number;
  readonly sellerName: string;
  readonly sellerRef: string | null;
  readonly price: bigint | null;
  readonly finalPrice: bigint | null;
  readonly rating: number | null;
  readonly dispatchTime: number | null;
  readonly offeredStock: number | null;
  readonly hasPromotion: boolean;
  readonly promotionText: string | null;
}

/**
 * doc 05 §5: `scrape_runs` is written on every scrape, whether or not anything changed;
 * `competitor_observations` only when the observed seller set differs from the previous
 * scrape (compared by `payloadHash`). This one call implements that rule so no caller can
 * accidentally write observations without the proof-of-look row, or vice versa.
 */
export async function recordScrapeRun(
  appDb: AppDatabase,
  run: ScrapeRunRow,
  observations: readonly CompetitorObservationRow[],
): Promise<void> {
  const previous = await latestScrapeRun(appDb, run.listingId);
  const changed = previous?.payloadHash !== run.payloadHash;
  const runToInsert = { ...run, changed };
  const observationsToInsert = [...observations];

  await runDialect(appDb, {
    sqlite: async (db) => {
      db.transaction((tx) => {
        tx.insert(sqliteSchema.scrapeRuns).values(runToInsert).run();
        if (changed && observationsToInsert.length > 0) {
          tx.insert(sqliteSchema.competitorObservations).values(observationsToInsert).run();
        }
      });
    },
    postgres: async (db) => {
      await db.transaction(async (tx) => {
        await tx.insert(postgresSchema.scrapeRuns).values(runToInsert);
        if (changed && observationsToInsert.length > 0) {
          await tx.insert(postgresSchema.competitorObservations).values(observationsToInsert);
        }
      });
    },
    mysql: async (db) => {
      await db.transaction(async (tx) => {
        await tx.insert(mysqlSchema.scrapeRuns).values(runToInsert);
        if (changed && observationsToInsert.length > 0) {
          await tx.insert(mysqlSchema.competitorObservations).values(observationsToInsert);
        }
      });
    },
  });
}

export async function latestScrapeRun(
  appDb: AppDatabase,
  listingId: string,
): Promise<ScrapeRunRow | undefined> {
  const result = await withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.scrapeRuns)
          .where(eq(sqliteSchema.scrapeRuns.listingId, listingId))
          .orderBy(desc(sqliteSchema.scrapeRuns.observedAt))
          .limit(1)
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.scrapeRuns)
          .where(eq(postgresSchema.scrapeRuns.listingId, listingId))
          .orderBy(desc(postgresSchema.scrapeRuns.observedAt))
          .limit(1)
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.scrapeRuns)
          .where(eq(mysqlSchema.scrapeRuns.listingId, listingId))
          .orderBy(desc(mysqlSchema.scrapeRuns.observedAt))
          .limit(1)
      )[0],
  });
  return result as ScrapeRunRow | undefined; // see the note in latestBuyboxObservation
}

/**
 * Reconstructs "what did the offers look like at or before T" (doc 05 §5): the nearest
 * `scrape_runs` row at-or-before T proves we looked; the `competitor_observations` rows
 * from the scrape at-or-before T are the seller set that was in effect then (observations
 * are only written when the set changes, so the most recent write at-or-before T is still
 * current at T).
 */
export async function observationsAsOf(
  appDb: AppDatabase,
  listingId: string,
  atMs: number,
): Promise<CompetitorObservationRow[]> {
  return withDialect(appDb, {
    sqlite: async (db) => {
      const run = (
        await db
          .select()
          .from(sqliteSchema.scrapeRuns)
          .where(
            and(
              eq(sqliteSchema.scrapeRuns.listingId, listingId),
              lte(sqliteSchema.scrapeRuns.observedAt, atMs),
            ),
          )
          .orderBy(desc(sqliteSchema.scrapeRuns.observedAt))
          .limit(1)
      )[0];
      if (!run) return [];
      return db
        .select()
        .from(sqliteSchema.competitorObservations)
        .where(
          and(
            eq(sqliteSchema.competitorObservations.listingId, listingId),
            lte(sqliteSchema.competitorObservations.observedAt, atMs),
          ),
        )
        .orderBy(desc(sqliteSchema.competitorObservations.observedAt));
    },
    postgres: async (db) => {
      const run = (
        await db
          .select()
          .from(postgresSchema.scrapeRuns)
          .where(
            and(
              eq(postgresSchema.scrapeRuns.listingId, listingId),
              lte(postgresSchema.scrapeRuns.observedAt, atMs),
            ),
          )
          .orderBy(desc(postgresSchema.scrapeRuns.observedAt))
          .limit(1)
      )[0];
      if (!run) return [];
      return db
        .select()
        .from(postgresSchema.competitorObservations)
        .where(
          and(
            eq(postgresSchema.competitorObservations.listingId, listingId),
            lte(postgresSchema.competitorObservations.observedAt, atMs),
          ),
        )
        .orderBy(desc(postgresSchema.competitorObservations.observedAt));
    },
    mysql: async (db) => {
      const run = (
        await db
          .select()
          .from(mysqlSchema.scrapeRuns)
          .where(
            and(
              eq(mysqlSchema.scrapeRuns.listingId, listingId),
              lte(mysqlSchema.scrapeRuns.observedAt, atMs),
            ),
          )
          .orderBy(desc(mysqlSchema.scrapeRuns.observedAt))
          .limit(1)
      )[0];
      if (!run) return [];
      return db
        .select()
        .from(mysqlSchema.competitorObservations)
        .where(
          and(
            eq(mysqlSchema.competitorObservations.listingId, listingId),
            lte(mysqlSchema.competitorObservations.observedAt, atMs),
          ),
        )
        .orderBy(desc(mysqlSchema.competitorObservations.observedAt));
    },
  });
}

// scrape_runs and competitor_observations are retained indefinitely (doc 05 §10) — no prune function.
