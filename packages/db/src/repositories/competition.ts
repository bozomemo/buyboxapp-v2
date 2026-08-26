/**
 * Repositories for `buybox_observations`, `scrape_runs`, `competitor_observations`
 * (doc 05 §5) — the two-tier competitor history described in doc 10 §5.
 */
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
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

/**
 * The store name of whoever currently holds the buybox, for display on the Listings grid
 * (doc 06 §4.1 "Mağaza Adı" — customer feedback 2026-08-25). **Reporting only**: it reads
 * `competitor_observations`, the scrape-sourced archive, never `buybox_observations` (the
 * API-sourced control signal pricing decisions read). A missing or stale scrape yields
 * `undefined` rather than a wrong name, and that must never reach a pricing decision — it is
 * display data next to the Sıra/Buybox Fiyatı columns, nothing else reads it.
 *
 * The most recent row is picked by `observedAt desc`, not by joining through `scrape_runs`
 * (contrast `observationsAsOf`): observations are only written in whole batches sharing one
 * `observedAt` when the seller set changes, so the newest row already belongs to the newest
 * batch and a second query buys nothing here.
 */
export async function latestBuyboxSellerName(
  appDb: AppDatabase,
  listingId: string,
): Promise<string | undefined> {
  const result = await withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select({ sellerName: sqliteSchema.competitorObservations.sellerName })
          .from(sqliteSchema.competitorObservations)
          .where(
            and(
              eq(sqliteSchema.competitorObservations.listingId, listingId),
              eq(sqliteSchema.competitorObservations.rank, 1),
            ),
          )
          .orderBy(desc(sqliteSchema.competitorObservations.observedAt))
          .limit(1)
      )[0],
    postgres: async (db) =>
      (
        await db
          .select({ sellerName: postgresSchema.competitorObservations.sellerName })
          .from(postgresSchema.competitorObservations)
          .where(
            and(
              eq(postgresSchema.competitorObservations.listingId, listingId),
              eq(postgresSchema.competitorObservations.rank, 1),
            ),
          )
          .orderBy(desc(postgresSchema.competitorObservations.observedAt))
          .limit(1)
      )[0],
    mysql: async (db) =>
      (
        await db
          .select({ sellerName: mysqlSchema.competitorObservations.sellerName })
          .from(mysqlSchema.competitorObservations)
          .where(
            and(
              eq(mysqlSchema.competitorObservations.listingId, listingId),
              eq(mysqlSchema.competitorObservations.rank, 1),
            ),
          )
          .orderBy(desc(mysqlSchema.competitorObservations.observedAt))
          .limit(1)
      )[0],
  });
  return result?.sellerName;
}

/**
 * Per-marketplace `max(observed_at)` — the dashboard's "last successful buybox observation"
 * proxy (doc 06 §2). Joins through `listings` because `buybox_observations` itself carries
 * no marketplace code.
 */
export async function lastBuyboxObservationByMarketplace(
  appDb: AppDatabase,
): Promise<Record<string, number>> {
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({
          marketplaceCode: sqliteSchema.listings.marketplaceCode,
          observedAt: sql<number>`max(${sqliteSchema.buyboxObservations.observedAt})`,
        })
        .from(sqliteSchema.buyboxObservations)
        .innerJoin(
          sqliteSchema.listings,
          eq(sqliteSchema.listings.id, sqliteSchema.buyboxObservations.listingId),
        )
        .groupBy(sqliteSchema.listings.marketplaceCode),
    postgres: (db) =>
      db
        .select({
          marketplaceCode: postgresSchema.listings.marketplaceCode,
          observedAt: sql<number>`max(${postgresSchema.buyboxObservations.observedAt})`,
        })
        .from(postgresSchema.buyboxObservations)
        .innerJoin(
          postgresSchema.listings,
          eq(postgresSchema.listings.id, postgresSchema.buyboxObservations.listingId),
        )
        .groupBy(postgresSchema.listings.marketplaceCode),
    mysql: (db) =>
      db
        .select({
          marketplaceCode: mysqlSchema.listings.marketplaceCode,
          observedAt: sql<number>`max(${mysqlSchema.buyboxObservations.observedAt})`,
        })
        .from(mysqlSchema.buyboxObservations)
        .innerJoin(
          mysqlSchema.listings,
          eq(mysqlSchema.listings.id, mysqlSchema.buyboxObservations.listingId),
        )
        .groupBy(mysqlSchema.listings.marketplaceCode),
  });
  return Object.fromEntries(rows.map((r) => [r.marketplaceCode, Number(r.observedAt)]));
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

/**
 * Time series of buybox observations for one listing (doc 06 §5 "price chart over time",
 * doc 06 §6 "price timeline"), oldest first so it plots left-to-right directly.
 */
export async function buyboxObservationHistory(
  appDb: AppDatabase,
  listingId: string,
  sinceMs: number,
  limit = 500,
): Promise<BuyboxObservationRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.buyboxObservations)
        .where(
          and(
            eq(sqliteSchema.buyboxObservations.listingId, listingId),
            gte(sqliteSchema.buyboxObservations.observedAt, sinceMs),
          ),
        )
        .orderBy(asc(sqliteSchema.buyboxObservations.observedAt))
        .limit(limit),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.buyboxObservations)
        .where(
          and(
            eq(postgresSchema.buyboxObservations.listingId, listingId),
            gte(postgresSchema.buyboxObservations.observedAt, sinceMs),
          ),
        )
        .orderBy(asc(postgresSchema.buyboxObservations.observedAt))
        .limit(limit),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.buyboxObservations)
        .where(
          and(
            eq(mysqlSchema.buyboxObservations.listingId, listingId),
            gte(mysqlSchema.buyboxObservations.observedAt, sinceMs),
          ),
        )
        .orderBy(asc(mysqlSchema.buyboxObservations.observedAt))
        .limit(limit),
  }) as Promise<BuyboxObservationRow[]>;
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
  // Comparison is against the last **successful** run, not the last run of any kind. A failed
  // run carries no meaningful payload hash, so comparing against it would make the next good
  // scrape look "changed" and rewrite an identical seller set — inflating the archive that
  // doc 05 §10 retains indefinitely. A failed run is never itself "changed": it produced no
  // observations, by definition.
  const previous = await latestSuccessfulScrapeRun(appDb, run.listingId);
  const changed = run.status === 'ok' && previous?.payloadHash !== run.payloadHash;
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

/** The newest `status = 'ok'` run for a listing — the baseline for change detection. */
export async function latestSuccessfulScrapeRun(
  appDb: AppDatabase,
  listingId: string,
): Promise<ScrapeRunRow | undefined> {
  const result = await withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.scrapeRuns)
          .where(
            and(eq(sqliteSchema.scrapeRuns.listingId, listingId), eq(sqliteSchema.scrapeRuns.status, 'ok')),
          )
          .orderBy(desc(sqliteSchema.scrapeRuns.observedAt))
          .limit(1)
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.scrapeRuns)
          .where(
            and(
              eq(postgresSchema.scrapeRuns.listingId, listingId),
              eq(postgresSchema.scrapeRuns.status, 'ok'),
            ),
          )
          .orderBy(desc(postgresSchema.scrapeRuns.observedAt))
          .limit(1)
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.scrapeRuns)
          .where(
            and(eq(mysqlSchema.scrapeRuns.listingId, listingId), eq(mysqlSchema.scrapeRuns.status, 'ok')),
          )
          .orderBy(desc(mysqlSchema.scrapeRuns.observedAt))
          .limit(1)
      )[0],
  });
  return result as ScrapeRunRow | undefined; // see the note in latestBuyboxObservation
}

/**
 * Last **successful** scrape time per listing, for every listing that has ever had one.
 *
 * This is `ScrapeCompetitors`'s rotation key (doc 07 §4.1 gap G-2). The ceiling
 * `SCRAPE_MAX_LISTINGS_PER_RUN` only behaves as "the rest are picked up next cycle" if the
 * candidates are ordered oldest-first; without an order the same first rows are selected on
 * every run and everything past the ceiling is never scraped at all, with the run still
 * reporting `completed`.
 *
 * One grouped aggregate rather than a per-listing `latestSuccessfulScrapeRun` call: the caller
 * needs the whole set to sort it, and N round-trips to answer one ranking question is the shape
 * doc 06 §6.1 already rejected for the seller reports.
 *
 * A listing absent from the returned map has never been scraped successfully and therefore
 * sorts **first** — never having looked is staler than any timestamp.
 */
export async function lastSuccessfulScrapeAtByListing(
  appDb: AppDatabase,
  marketplaceCode: string,
): Promise<Map<string, number>> {
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({
          listingId: sqliteSchema.scrapeRuns.listingId,
          lastAt: sql<number>`max(${sqliteSchema.scrapeRuns.observedAt})`,
        })
        .from(sqliteSchema.scrapeRuns)
        .innerJoin(sqliteSchema.listings, eq(sqliteSchema.listings.id, sqliteSchema.scrapeRuns.listingId))
        .where(
          and(
            eq(sqliteSchema.scrapeRuns.status, 'ok'),
            eq(sqliteSchema.listings.marketplaceCode, marketplaceCode),
          ),
        )
        .groupBy(sqliteSchema.scrapeRuns.listingId),
    postgres: (db) =>
      db
        .select({
          listingId: postgresSchema.scrapeRuns.listingId,
          lastAt: sql<number>`max(${postgresSchema.scrapeRuns.observedAt})`,
        })
        .from(postgresSchema.scrapeRuns)
        .innerJoin(
          postgresSchema.listings,
          eq(postgresSchema.listings.id, postgresSchema.scrapeRuns.listingId),
        )
        .where(
          and(
            eq(postgresSchema.scrapeRuns.status, 'ok'),
            eq(postgresSchema.listings.marketplaceCode, marketplaceCode),
          ),
        )
        .groupBy(postgresSchema.scrapeRuns.listingId),
    mysql: (db) =>
      db
        .select({
          listingId: mysqlSchema.scrapeRuns.listingId,
          lastAt: sql<number>`max(${mysqlSchema.scrapeRuns.observedAt})`,
        })
        .from(mysqlSchema.scrapeRuns)
        .innerJoin(mysqlSchema.listings, eq(mysqlSchema.listings.id, mysqlSchema.scrapeRuns.listingId))
        .where(
          and(
            eq(mysqlSchema.scrapeRuns.status, 'ok'),
            eq(mysqlSchema.listings.marketplaceCode, marketplaceCode),
          ),
        )
        .groupBy(mysqlSchema.scrapeRuns.listingId),
  });

  const byListing = new Map<string, number>();
  for (const row of rows as { listingId: string; lastAt: number | string | null }[]) {
    if (row.lastAt === null) continue;
    // MySQL returns MAX() over a bigint column as a string; the other two return a number.
    byListing.set(row.listingId, Number(row.lastAt));
  }
  return byListing;
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
      // Bug fix: a naive `observedAt <= atMs` filter returns every "changed" batch ever
      // written up to T, not just the seller set in effect at T — each changed scrape
      // appends a fresh batch of rows sharing one `observedAt`, so without pinning to the
      // single most recent such batch, stale sellers from earlier batches leak into the
      // result (caught live via the listing detail Competition panel, doc 12 6.7).
      const latest = (
        await db
          .select({ observedAt: sql<number>`max(${sqliteSchema.competitorObservations.observedAt})` })
          .from(sqliteSchema.competitorObservations)
          .where(
            and(
              eq(sqliteSchema.competitorObservations.listingId, listingId),
              lte(sqliteSchema.competitorObservations.observedAt, atMs),
            ),
          )
      )[0];
      if (latest?.observedAt === undefined || latest.observedAt === null) return [];
      return db
        .select()
        .from(sqliteSchema.competitorObservations)
        .where(
          and(
            eq(sqliteSchema.competitorObservations.listingId, listingId),
            eq(sqliteSchema.competitorObservations.observedAt, latest.observedAt),
          ),
        )
        .orderBy(asc(sqliteSchema.competitorObservations.rank));
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
      const latest = (
        await db
          .select({ observedAt: sql<number>`max(${postgresSchema.competitorObservations.observedAt})` })
          .from(postgresSchema.competitorObservations)
          .where(
            and(
              eq(postgresSchema.competitorObservations.listingId, listingId),
              lte(postgresSchema.competitorObservations.observedAt, atMs),
            ),
          )
      )[0];
      if (latest?.observedAt === undefined || latest.observedAt === null) return [];
      return db
        .select()
        .from(postgresSchema.competitorObservations)
        .where(
          and(
            eq(postgresSchema.competitorObservations.listingId, listingId),
            eq(postgresSchema.competitorObservations.observedAt, latest.observedAt),
          ),
        )
        .orderBy(asc(postgresSchema.competitorObservations.rank));
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
      const latest = (
        await db
          .select({ observedAt: sql<number>`max(${mysqlSchema.competitorObservations.observedAt})` })
          .from(mysqlSchema.competitorObservations)
          .where(
            and(
              eq(mysqlSchema.competitorObservations.listingId, listingId),
              lte(mysqlSchema.competitorObservations.observedAt, atMs),
            ),
          )
      )[0];
      if (latest?.observedAt === undefined || latest.observedAt === null) return [];
      return db
        .select()
        .from(mysqlSchema.competitorObservations)
        .where(
          and(
            eq(mysqlSchema.competitorObservations.listingId, listingId),
            eq(mysqlSchema.competitorObservations.observedAt, latest.observedAt),
          ),
        )
        .orderBy(asc(mysqlSchema.competitorObservations.rank));
    },
  });
}

export interface CompetitorHistoryFilters {
  readonly sinceMs: number;
  readonly untilMs: number;
  readonly listingId?: string;
  readonly marketplaceCode?: string;
  readonly baseStockCode?: string;
  readonly sellerRef?: string;
}

export interface CompetitorObservationReportRow extends CompetitorObservationRow {
  readonly marketplaceCode: string;
  readonly productName: string;
  readonly baseStockCode: string | null;
  readonly marketplaceListingId: string;
}

/**
 * Filtered, bounded fetch over `competitor_observations` joined with `listings`, for the
 * competitor-history reporting surface (doc 06 §6: price timeline, seller presence, buybox
 * share, seller profile). A date range is required — this is a reporting query over the
 * indefinitely-retained scrape archive, not a paged catalogue browse — and the aggregations
 * (presence, share, profile) are computed in the API route from this bounded, filtered fetch
 * rather than as dialect-specific `GROUP BY` SQL for every report. Capped at `limit` rows
 * (default 20,000, doc 09 §20 spirit — never an unbounded scan); callers should narrow the
 * date range if `rows.length === limit` (truncated), and the API surfaces that to the operator.
 */
export async function competitorObservationsInRange(
  appDb: AppDatabase,
  filters: CompetitorHistoryFilters,
  limit = 20_000,
): Promise<CompetitorObservationReportRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({ obs: sqliteSchema.competitorObservations, listing: sqliteSchema.listings })
        .from(sqliteSchema.competitorObservations)
        .innerJoin(
          sqliteSchema.listings,
          eq(sqliteSchema.listings.id, sqliteSchema.competitorObservations.listingId),
        )
        .where(
          and(
            gte(sqliteSchema.competitorObservations.observedAt, filters.sinceMs),
            lte(sqliteSchema.competitorObservations.observedAt, filters.untilMs),
            filters.listingId
              ? eq(sqliteSchema.competitorObservations.listingId, filters.listingId)
              : undefined,
            filters.marketplaceCode
              ? eq(sqliteSchema.listings.marketplaceCode, filters.marketplaceCode)
              : undefined,
            filters.sellerRef
              ? eq(sqliteSchema.competitorObservations.sellerRef, filters.sellerRef)
              : undefined,
            filters.baseStockCode
              ? eq(sqliteSchema.listings.baseStockCode, filters.baseStockCode)
              : undefined,
          ),
        )
        .orderBy(asc(sqliteSchema.competitorObservations.observedAt))
        .limit(limit)
        .then((rows) =>
          rows.map((r) => ({
            ...r.obs,
            marketplaceCode: r.listing.marketplaceCode,
            productName: r.listing.productName,
            baseStockCode: r.listing.baseStockCode,
            marketplaceListingId: r.listing.marketplaceListingId,
          })),
        ),
    postgres: (db) =>
      db
        .select({ obs: postgresSchema.competitorObservations, listing: postgresSchema.listings })
        .from(postgresSchema.competitorObservations)
        .innerJoin(
          postgresSchema.listings,
          eq(postgresSchema.listings.id, postgresSchema.competitorObservations.listingId),
        )
        .where(
          and(
            gte(postgresSchema.competitorObservations.observedAt, filters.sinceMs),
            lte(postgresSchema.competitorObservations.observedAt, filters.untilMs),
            filters.listingId
              ? eq(postgresSchema.competitorObservations.listingId, filters.listingId)
              : undefined,
            filters.marketplaceCode
              ? eq(postgresSchema.listings.marketplaceCode, filters.marketplaceCode)
              : undefined,
            filters.sellerRef
              ? eq(postgresSchema.competitorObservations.sellerRef, filters.sellerRef)
              : undefined,
            filters.baseStockCode
              ? eq(postgresSchema.listings.baseStockCode, filters.baseStockCode)
              : undefined,
          ),
        )
        .orderBy(asc(postgresSchema.competitorObservations.observedAt))
        .limit(limit)
        .then((rows) =>
          rows.map((r) => ({
            ...r.obs,
            marketplaceCode: r.listing.marketplaceCode,
            productName: r.listing.productName,
            baseStockCode: r.listing.baseStockCode,
            marketplaceListingId: r.listing.marketplaceListingId,
          })),
        ),
    mysql: (db) =>
      db
        .select({ obs: mysqlSchema.competitorObservations, listing: mysqlSchema.listings })
        .from(mysqlSchema.competitorObservations)
        .innerJoin(
          mysqlSchema.listings,
          eq(mysqlSchema.listings.id, mysqlSchema.competitorObservations.listingId),
        )
        .where(
          and(
            gte(mysqlSchema.competitorObservations.observedAt, filters.sinceMs),
            lte(mysqlSchema.competitorObservations.observedAt, filters.untilMs),
            filters.listingId
              ? eq(mysqlSchema.competitorObservations.listingId, filters.listingId)
              : undefined,
            filters.marketplaceCode
              ? eq(mysqlSchema.listings.marketplaceCode, filters.marketplaceCode)
              : undefined,
            filters.sellerRef
              ? eq(mysqlSchema.competitorObservations.sellerRef, filters.sellerRef)
              : undefined,
            filters.baseStockCode
              ? eq(mysqlSchema.listings.baseStockCode, filters.baseStockCode)
              : undefined,
          ),
        )
        .orderBy(asc(mysqlSchema.competitorObservations.observedAt))
        .limit(limit)
        .then((rows) =>
          rows.map((r) => ({
            ...r.obs,
            marketplaceCode: r.listing.marketplaceCode,
            productName: r.listing.productName,
            baseStockCode: r.listing.baseStockCode,
            marketplaceListingId: r.listing.marketplaceListingId,
          })),
        ),
  }) as Promise<CompetitorObservationReportRow[]>;
}

export interface ScrapeRunReportRow extends ScrapeRunRow {
  readonly marketplaceCode: string;
  readonly productName: string;
}

/** Same shape of filtered/bounded fetch as `competitorObservationsInRange`, over `scrape_runs`
 * — the "observation coverage" report (doc 06 §6): where scraping density is thin. */
export async function scrapeRunsInRange(
  appDb: AppDatabase,
  filters: CompetitorHistoryFilters,
  limit = 20_000,
): Promise<ScrapeRunReportRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({ run: sqliteSchema.scrapeRuns, listing: sqliteSchema.listings })
        .from(sqliteSchema.scrapeRuns)
        .innerJoin(sqliteSchema.listings, eq(sqliteSchema.listings.id, sqliteSchema.scrapeRuns.listingId))
        .where(
          and(
            gte(sqliteSchema.scrapeRuns.observedAt, filters.sinceMs),
            lte(sqliteSchema.scrapeRuns.observedAt, filters.untilMs),
            filters.listingId ? eq(sqliteSchema.scrapeRuns.listingId, filters.listingId) : undefined,
            filters.marketplaceCode
              ? eq(sqliteSchema.listings.marketplaceCode, filters.marketplaceCode)
              : undefined,
          ),
        )
        .orderBy(asc(sqliteSchema.scrapeRuns.observedAt))
        .limit(limit)
        .then((rows) =>
          rows.map((r) => ({
            ...r.run,
            marketplaceCode: r.listing.marketplaceCode,
            productName: r.listing.productName,
          })),
        ),
    postgres: (db) =>
      db
        .select({ run: postgresSchema.scrapeRuns, listing: postgresSchema.listings })
        .from(postgresSchema.scrapeRuns)
        .innerJoin(
          postgresSchema.listings,
          eq(postgresSchema.listings.id, postgresSchema.scrapeRuns.listingId),
        )
        .where(
          and(
            gte(postgresSchema.scrapeRuns.observedAt, filters.sinceMs),
            lte(postgresSchema.scrapeRuns.observedAt, filters.untilMs),
            filters.listingId ? eq(postgresSchema.scrapeRuns.listingId, filters.listingId) : undefined,
            filters.marketplaceCode
              ? eq(postgresSchema.listings.marketplaceCode, filters.marketplaceCode)
              : undefined,
          ),
        )
        .orderBy(asc(postgresSchema.scrapeRuns.observedAt))
        .limit(limit)
        .then((rows) =>
          rows.map((r) => ({
            ...r.run,
            marketplaceCode: r.listing.marketplaceCode,
            productName: r.listing.productName,
          })),
        ),
    mysql: (db) =>
      db
        .select({ run: mysqlSchema.scrapeRuns, listing: mysqlSchema.listings })
        .from(mysqlSchema.scrapeRuns)
        .innerJoin(mysqlSchema.listings, eq(mysqlSchema.listings.id, mysqlSchema.scrapeRuns.listingId))
        .where(
          and(
            gte(mysqlSchema.scrapeRuns.observedAt, filters.sinceMs),
            lte(mysqlSchema.scrapeRuns.observedAt, filters.untilMs),
            filters.listingId ? eq(mysqlSchema.scrapeRuns.listingId, filters.listingId) : undefined,
            filters.marketplaceCode
              ? eq(mysqlSchema.listings.marketplaceCode, filters.marketplaceCode)
              : undefined,
          ),
        )
        .orderBy(asc(mysqlSchema.scrapeRuns.observedAt))
        .limit(limit)
        .then((rows) =>
          rows.map((r) => ({
            ...r.run,
            marketplaceCode: r.listing.marketplaceCode,
            productName: r.listing.productName,
          })),
        ),
  }) as Promise<ScrapeRunReportRow[]>;
}

/**
 * Retention for the raw offer rows (doc 05 §10). `scrape_runs` is deliberately **not** pruned
 * alongside them: it is the proof-of-look row, it is one row per scrape rather than one per
 * seller, and dropping it would erase the coverage denominator that makes a buybox-share or
 * seller-presence figure honest — leaving reports that quietly read as "nobody was selling"
 * where the truth is "we stopped holding the detail".
 */
export async function pruneCompetitorObservations(appDb: AppDatabase, cutoffMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .delete(sqliteSchema.competitorObservations)
        .where(lte(sqliteSchema.competitorObservations.observedAt, cutoffMs)),
    postgres: (db) =>
      db
        .delete(postgresSchema.competitorObservations)
        .where(lte(postgresSchema.competitorObservations.observedAt, cutoffMs)),
    mysql: (db) =>
      db
        .delete(mysqlSchema.competitorObservations)
        .where(lte(mysqlSchema.competitorObservations.observedAt, cutoffMs)),
  });
}
