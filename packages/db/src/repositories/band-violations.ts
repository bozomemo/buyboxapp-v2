/**
 * Price-band violations (doc 17 §5, doc 05 §`band_violations`, build plan 11.6).
 *
 * This repository stores state and applies a plan; it makes no judgement. What a look changes is
 * decided by `planBandReconcile` in `packages/core`, from the open rows read here — the same
 * split as `brand_findings`, whose rows hold no judgement either.
 *
 * **At most one open row per (card, kind)** is the repository's invariant, kept by reading the
 * open rows and writing the plan made from them. Not wrapped in a transaction: a card is read by
 * one lane at a time (the two sweeps share `last_scraped_at`), so two writers on one card need an
 * operator's rescan landing on the very card a sweep is reading. If that ever leaves two open rows
 * of one kind, the planner judges every row and the next look closes the extra — it never stays
 * open for ever.
 */
import type { BandReconcilePlan, BandResolution, BandViolationKind, OpenBandViolation } from '@buybox/core';
import { and, asc, count, desc, eq, getTableColumns, gte, inArray } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export type BandViolationState = 'open' | 'resolved';

export interface BandViolationRow {
  readonly id: string;
  readonly brandProductId: string;
  readonly trackedProductId: string;
  readonly kind: BandViolationKind;
  readonly sellerRef: string | null;
  readonly sellerName: string;
  readonly state: BandViolationState;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly resolvedAt: number | null;
  readonly resolution: BandResolution | null;
  readonly thresholdApplied: bigint;
  readonly unitMultiplier: number;
  readonly observedPrice: bigint;
  readonly priceSource: 'finalPrice' | 'price';
  /** JSON: the opening look's offers. */
  readonly snapshot: string;
}

export interface OpenCardViolation extends OpenBandViolation {
  readonly brandProductId: string;
}

/** The card's open violations, oldest first. */
export async function openViolationsForCard(
  appDb: AppDatabase,
  trackedProductId: string,
): Promise<OpenCardViolation[]> {
  return (await withDialect(appDb, {
    sqlite: (db) => {
      const v = sqliteSchema.bandViolations;
      return db
        .select({ id: v.id, kind: v.kind, sellerRef: v.sellerRef, sellerName: v.sellerName, brandProductId: v.brandProductId })
        .from(v)
        .where(and(eq(v.trackedProductId, trackedProductId), eq(v.state, 'open')))
        .orderBy(asc(v.firstSeenAt));
    },
    postgres: (db) => {
      const v = postgresSchema.bandViolations;
      return db
        .select({ id: v.id, kind: v.kind, sellerRef: v.sellerRef, sellerName: v.sellerName, brandProductId: v.brandProductId })
        .from(v)
        .where(and(eq(v.trackedProductId, trackedProductId), eq(v.state, 'open')))
        .orderBy(asc(v.firstSeenAt));
    },
    mysql: (db) => {
      const v = mysqlSchema.bandViolations;
      return db
        .select({ id: v.id, kind: v.kind, sellerRef: v.sellerRef, sellerName: v.sellerName, brandProductId: v.brandProductId })
        .from(v)
        .where(and(eq(v.trackedProductId, trackedProductId), eq(v.state, 'open')))
        .orderBy(asc(v.firstSeenAt));
    },
  })) as OpenCardViolation[];
}

export interface ApplyBandPlanInput {
  readonly trackedProductId: string;
  readonly brandProductId: string;
  readonly unitMultiplier: number;
  /** JSON of the look's offers, stored on every row this plan opens. */
  readonly snapshot: string;
  readonly nowMs: number;
  readonly plan: BandReconcilePlan;
}

/** Writes a reconcile plan. Returns the rows it opened — the only ones worth notifying (§6). */
export async function applyBandPlan(appDb: AppDatabase, input: ApplyBandPlanInput): Promise<BandViolationRow[]> {
  const { plan, nowMs } = input;

  const byResolution = new Map<BandResolution, string[]>();
  for (const { id, resolution } of plan.resolve) {
    byResolution.set(resolution, [...(byResolution.get(resolution) ?? []), id]);
  }
  for (const [resolution, ids] of byResolution) {
    await resolveIds(appDb, ids, resolution, nowMs);
  }

  for (const { id, observedPrice, priceSource } of plan.confirm) {
    const set = { lastSeenAt: nowMs, observedPrice, priceSource };
    await runDialect(appDb, {
      sqlite: (db) => db.update(sqliteSchema.bandViolations).set(set).where(eq(sqliteSchema.bandViolations.id, id)),
      postgres: (db) =>
        db.update(postgresSchema.bandViolations).set(set).where(eq(postgresSchema.bandViolations.id, id)),
      mysql: (db) => db.update(mysqlSchema.bandViolations).set(set).where(eq(mysqlSchema.bandViolations.id, id)),
    });
  }

  const opened: BandViolationRow[] = plan.open.map((o) => ({
    id: newId(),
    brandProductId: input.brandProductId,
    trackedProductId: input.trackedProductId,
    kind: o.kind,
    sellerRef: o.sellerRef,
    sellerName: o.sellerName,
    state: 'open',
    firstSeenAt: nowMs,
    lastSeenAt: nowMs,
    resolvedAt: null,
    resolution: null,
    thresholdApplied: o.thresholdApplied,
    unitMultiplier: input.unitMultiplier,
    observedPrice: o.observedPrice,
    priceSource: o.priceSource,
    snapshot: input.snapshot,
  }));
  if (opened.length > 0) {
    await runDialect(appDb, {
      sqlite: (db) => db.insert(sqliteSchema.bandViolations).values([...opened]),
      postgres: (db) => db.insert(postgresSchema.bandViolations).values([...opened]),
      mysql: (db) => db.insert(mysqlSchema.bandViolations).values([...opened]),
    });
  }
  return opened;
}

async function resolveIds(
  appDb: AppDatabase,
  ids: readonly string[],
  resolution: BandResolution,
  nowMs: number,
): Promise<void> {
  if (ids.length === 0) return;
  const set = { state: 'resolved', resolvedAt: nowMs, resolution };
  const list = [...ids];
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.bandViolations)
        .set(set)
        .where(and(inArray(sqliteSchema.bandViolations.id, list), eq(sqliteSchema.bandViolations.state, 'open'))),
    postgres: (db) =>
      db
        .update(postgresSchema.bandViolations)
        .set(set)
        .where(and(inArray(postgresSchema.bandViolations.id, list), eq(postgresSchema.bandViolations.state, 'open'))),
    mysql: (db) =>
      db
        .update(mysqlSchema.bandViolations)
        .set(set)
        .where(and(inArray(mysqlSchema.bandViolations.id, list), eq(mysqlSchema.bandViolations.state, 'open'))),
  });
}

/** Resolves every open violation of a card at once — the `unlinked` path (doc 17 §5.3). */
export async function resolveOpenForCard(
  appDb: AppDatabase,
  trackedProductId: string,
  resolution: BandResolution,
  nowMs: number,
): Promise<number> {
  const open = await openViolationsForCard(appDb, trackedProductId);
  await resolveIds(
    appDb,
    open.map((row) => row.id),
    resolution,
    nowMs,
  );
  return open.length;
}

// --------------------------------------------------------------- screen reads

/** A violation with what the screen shows beside it. */
export interface BandViolationListRow extends BandViolationRow {
  readonly brandProductName: string;
  readonly cardLabel: string;
  readonly cardUrl: string;
  readonly marketplaceCode: string;
}

export interface BandViolationQuery {
  readonly state: BandViolationState;
  /** Resolved rows only: those resolved at or after this instant. */
  readonly resolvedSinceMs?: number;
  readonly limit?: number;
}

/**
 * Violations for `/brand/alerts`. Open rows are ordered by brand product name, then oldest first,
 * so a product's cards sit together (§5.4: grouped by brand product). Resolved rows are newest
 * resolution first.
 */
export async function queryBandViolations(
  appDb: AppDatabase,
  query: BandViolationQuery,
): Promise<BandViolationListRow[]> {
  const limit = query.limit ?? 500;
  const since = query.resolvedSinceMs;
  return (await withDialect(appDb, {
    sqlite: (db) => {
      const v = sqliteSchema.bandViolations;
      const p = sqliteSchema.brandProducts;
      const t = sqliteSchema.trackedProducts;
      const where =
        query.state === 'resolved' && since !== undefined
          ? and(eq(v.state, 'resolved'), gte(v.resolvedAt, since))
          : eq(v.state, query.state);
      const base = db
        .select({ ...getTableColumns(v), brandProductName: p.name, cardLabel: t.label, cardUrl: t.productUrl, marketplaceCode: t.marketplaceCode })
        .from(v)
        .innerJoin(p, eq(p.id, v.brandProductId))
        .innerJoin(t, eq(t.id, v.trackedProductId))
        .where(where);
      return query.state === 'open'
        ? base.orderBy(asc(p.name), asc(v.firstSeenAt)).limit(limit)
        : base.orderBy(desc(v.resolvedAt)).limit(limit);
    },
    postgres: (db) => {
      const v = postgresSchema.bandViolations;
      const p = postgresSchema.brandProducts;
      const t = postgresSchema.trackedProducts;
      const where =
        query.state === 'resolved' && since !== undefined
          ? and(eq(v.state, 'resolved'), gte(v.resolvedAt, since))
          : eq(v.state, query.state);
      const base = db
        .select({ ...getTableColumns(v), brandProductName: p.name, cardLabel: t.label, cardUrl: t.productUrl, marketplaceCode: t.marketplaceCode })
        .from(v)
        .innerJoin(p, eq(p.id, v.brandProductId))
        .innerJoin(t, eq(t.id, v.trackedProductId))
        .where(where);
      return query.state === 'open'
        ? base.orderBy(asc(p.name), asc(v.firstSeenAt)).limit(limit)
        : base.orderBy(desc(v.resolvedAt)).limit(limit);
    },
    mysql: (db) => {
      const v = mysqlSchema.bandViolations;
      const p = mysqlSchema.brandProducts;
      const t = mysqlSchema.trackedProducts;
      const where =
        query.state === 'resolved' && since !== undefined
          ? and(eq(v.state, 'resolved'), gte(v.resolvedAt, since))
          : eq(v.state, query.state);
      const base = db
        .select({ ...getTableColumns(v), brandProductName: p.name, cardLabel: t.label, cardUrl: t.productUrl, marketplaceCode: t.marketplaceCode })
        .from(v)
        .innerJoin(p, eq(p.id, v.brandProductId))
        .innerJoin(t, eq(t.id, v.trackedProductId))
        .where(where);
      return query.state === 'open'
        ? base.orderBy(asc(p.name), asc(v.firstSeenAt)).limit(limit)
        : base.orderBy(desc(v.resolvedAt)).limit(limit);
    },
  })) as BandViolationListRow[];
}

/** How many violations are open — the dashboard's figure (§5.4). */
export async function countOpenBandViolations(appDb: AppDatabase): Promise<number> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) =>
      db.select({ n: count() }).from(sqliteSchema.bandViolations).where(eq(sqliteSchema.bandViolations.state, 'open')),
    postgres: (db) =>
      db.select({ n: count() }).from(postgresSchema.bandViolations).where(eq(postgresSchema.bandViolations.state, 'open')),
    mysql: (db) =>
      db.select({ n: count() }).from(mysqlSchema.bandViolations).where(eq(mysqlSchema.bandViolations.state, 'open')),
  })) as { n: number | string }[];
  return Number(rows[0]?.n ?? 0);
}

/** Open violations of these cards, for İlanlar's _açık ihlal_ column. Cards with none are absent. */
export async function openViolationsForCards(
  appDb: AppDatabase,
  trackedProductIds: readonly string[],
): Promise<Map<string, { kind: BandViolationKind; firstSeenAt: number }[]>> {
  const result = new Map<string, { kind: BandViolationKind; firstSeenAt: number }[]>();
  for (let start = 0; start < trackedProductIds.length; start += 200) {
    const chunk = trackedProductIds.slice(start, start + 200);
    if (chunk.length === 0) continue;
    const rows = (await withDialect(appDb, {
      sqlite: (db) => {
        const v = sqliteSchema.bandViolations;
        return db
          .select({ trackedProductId: v.trackedProductId, kind: v.kind, firstSeenAt: v.firstSeenAt })
          .from(v)
          .where(and(eq(v.state, 'open'), inArray(v.trackedProductId, chunk)));
      },
      postgres: (db) => {
        const v = postgresSchema.bandViolations;
        return db
          .select({ trackedProductId: v.trackedProductId, kind: v.kind, firstSeenAt: v.firstSeenAt })
          .from(v)
          .where(and(eq(v.state, 'open'), inArray(v.trackedProductId, chunk)));
      },
      mysql: (db) => {
        const v = mysqlSchema.bandViolations;
        return db
          .select({ trackedProductId: v.trackedProductId, kind: v.kind, firstSeenAt: v.firstSeenAt })
          .from(v)
          .where(and(eq(v.state, 'open'), inArray(v.trackedProductId, chunk)));
      },
    })) as { trackedProductId: string; kind: BandViolationKind; firstSeenAt: number }[];
    for (const { trackedProductId, kind, firstSeenAt } of rows) {
      result.set(trackedProductId, [...(result.get(trackedProductId) ?? []), { kind, firstSeenAt }]);
    }
  }
  return result;
}
