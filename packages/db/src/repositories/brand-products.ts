/**
 * Repositories for `brand_products` and `brand_product_cards` (doc 17 §2, doc 05 "Brand
 * products").
 *
 * Two rules live here rather than in an index, and both are applied inside the write
 * transaction:
 *
 * - **A card belongs to at most one brand product.** Backed by the unique index on
 *   `tracked_product_id` as well; the repository checks first so the caller gets a reason that
 *   names the other product rather than a constraint violation.
 * - **At most one primary card per (brand product, marketplace).** Linking a new primary, or
 *   promoting a card, demotes the previous primary to an ordinary card in the same transaction —
 *   it stays linked (doc 17 §2.4, §3.3). An index cannot express this: it needs a partial unique
 *   index, and MySQL has none. On PostgreSQL and MySQL the product row is locked `FOR UPDATE`
 *   first, so two concurrent writes to one product's links run one after the other; SQLite's
 *   transactions are already serial.
 *
 * Prices are validated by the caller with `checkBrandProductPrices` (`packages/core`); the
 * multiplier is checked here as well, because a zero or fractional multiplier stored once would
 * corrupt every comparison made against the card afterwards.
 */
import { isValidUnitMultiplier } from '@buybox/core';
import { and, asc, count, eq, inArray, like, ne, notExists, or, sql, type SQL } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export type BrandProductSource = 'excel' | 'manual' | 'migration';
export type CardLinkSource = 'excel' | 'manual' | 'barcodeSuggestion' | 'migration';

/** The fields an operator states about a product — what a screen edit or an import row writes. */
export interface BrandProductFields {
  readonly name: string;
  /** PSF, per unit, kuruş. */
  readonly referencePrice: bigint;
  /** Per unit, kuruş. `null` = no lower-bound alarm. */
  readonly minPrice: bigint | null;
  /** Per unit, kuruş. `null` = PSF is the upper bound. */
  readonly maxPrice: bigint | null;
  readonly barcode: string | null;
  readonly referencePriceSource: string | null;
}

export interface BrandProductRow extends BrandProductFields {
  readonly id: string;
  readonly source: BrandProductSource;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface BrandProductCardRow {
  readonly id: string;
  readonly brandProductId: string;
  readonly trackedProductId: string;
  readonly marketplaceCode: string;
  readonly unitMultiplier: number;
  readonly isPrimary: boolean;
  readonly linkSource: CardLinkSource;
  readonly linkedAt: number;
}

function assertMultiplier(value: number): void {
  if (!isValidUnitMultiplier(value)) {
    throw new RangeError(`unit multiplier must be a whole number ≥ 1, got ${value}`);
  }
}

// ------------------------------------------------------------------------------ products

export async function insertBrandProduct(appDb: AppDatabase, row: BrandProductRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.brandProducts).values(row),
    postgres: (db) => db.insert(postgresSchema.brandProducts).values(row),
    mysql: (db) => db.insert(mysqlSchema.brandProducts).values(row),
  });
}

/**
 * Replaces every operator-stated field at once. A product edit — on the screen or as an import
 * row — is the product's complete statement for these fields (doc 17 §3.4): an absent `min` is
 * a cleared `min`, never a kept old one.
 */
export async function updateBrandProduct(
  appDb: AppDatabase,
  id: string,
  fields: BrandProductFields,
  atMs: number,
): Promise<void> {
  const set = { ...fields, updatedAt: atMs };
  await runDialect(appDb, {
    sqlite: (db) =>
      db.update(sqliteSchema.brandProducts).set(set).where(eq(sqliteSchema.brandProducts.id, id)),
    postgres: (db) =>
      db.update(postgresSchema.brandProducts).set(set).where(eq(postgresSchema.brandProducts.id, id)),
    mysql: (db) => db.update(mysqlSchema.brandProducts).set(set).where(eq(mysqlSchema.brandProducts.id, id)),
  });
}

export async function getBrandProduct(appDb: AppDatabase, id: string): Promise<BrandProductRow | undefined> {
  const rows = await withDialect(appDb, {
    sqlite: (db) => db.select().from(sqliteSchema.brandProducts).where(eq(sqliteSchema.brandProducts.id, id)),
    postgres: (db) =>
      db.select().from(postgresSchema.brandProducts).where(eq(postgresSchema.brandProducts.id, id)),
    mysql: (db) => db.select().from(mysqlSchema.brandProducts).where(eq(mysqlSchema.brandProducts.id, id)),
  });
  return rows[0] as BrandProductRow | undefined;
}

/** Deletes the product; its card links go with it (cascade). The cards themselves stay tracked. */
export async function deleteBrandProduct(appDb: AppDatabase, id: string): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.brandProducts).where(eq(sqliteSchema.brandProducts.id, id)),
    postgres: (db) => db.delete(postgresSchema.brandProducts).where(eq(postgresSchema.brandProducts.id, id)),
    mysql: (db) => db.delete(mysqlSchema.brandProducts).where(eq(mysqlSchema.brandProducts.id, id)),
  });
}

// --------------------------------------------------------------------------------- cards

/** A product's cards, primaries first, then oldest link first. */
export async function listBrandProductCards(
  appDb: AppDatabase,
  brandProductId: string,
): Promise<BrandProductCardRow[]> {
  return withDialect(appDb, {
    sqlite: (db) => {
      const c = sqliteSchema.brandProductCards;
      return db
        .select()
        .from(c)
        .where(eq(c.brandProductId, brandProductId))
        .orderBy(asc(c.linkedAt), asc(c.id));
    },
    postgres: (db) => {
      const c = postgresSchema.brandProductCards;
      return db
        .select()
        .from(c)
        .where(eq(c.brandProductId, brandProductId))
        .orderBy(asc(c.linkedAt), asc(c.id));
    },
    mysql: (db) => {
      const c = mysqlSchema.brandProductCards;
      return db
        .select()
        .from(c)
        .where(eq(c.brandProductId, brandProductId))
        .orderBy(asc(c.linkedAt), asc(c.id));
    },
  }).then((rows) =>
    (rows as BrandProductCardRow[]).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
  );
}

export async function getBrandProductCard(
  appDb: AppDatabase,
  cardId: string,
): Promise<BrandProductCardRow | undefined> {
  const rows = await withDialect(appDb, {
    sqlite: (db) =>
      db.select().from(sqliteSchema.brandProductCards).where(eq(sqliteSchema.brandProductCards.id, cardId)),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.brandProductCards)
        .where(eq(postgresSchema.brandProductCards.id, cardId)),
    mysql: (db) =>
      db.select().from(mysqlSchema.brandProductCards).where(eq(mysqlSchema.brandProductCards.id, cardId)),
  });
  return rows[0] as BrandProductCardRow | undefined;
}

/**
 * A tracked product's link, with the product prices it is compared against — what every reader
 * of PSF needs (doc 17 §2.5). Cards with no link are absent from the map.
 */
export interface CardLink {
  readonly cardId: string;
  readonly brandProductId: string;
  readonly brandProductName: string;
  readonly unitMultiplier: number;
  readonly isPrimary: boolean;
  readonly referencePrice: bigint;
  readonly minPrice: bigint | null;
  readonly maxPrice: bigint | null;
}

const LOOKUP_CHUNK = 200;

export async function cardLinksForTrackedProducts(
  appDb: AppDatabase,
  trackedProductIds: readonly string[],
): Promise<Map<string, CardLink>> {
  const result = new Map<string, CardLink>();
  for (let start = 0; start < trackedProductIds.length; start += LOOKUP_CHUNK) {
    const chunk = trackedProductIds.slice(start, start + LOOKUP_CHUNK);
    if (chunk.length === 0) continue;
    const rows = (await withDialect(appDb, {
      sqlite: (db) => {
        const c = sqliteSchema.brandProductCards;
        const p = sqliteSchema.brandProducts;
        return db
          .select({
            trackedProductId: c.trackedProductId,
            cardId: c.id,
            brandProductId: p.id,
            brandProductName: p.name,
            unitMultiplier: c.unitMultiplier,
            isPrimary: c.isPrimary,
            referencePrice: p.referencePrice,
            minPrice: p.minPrice,
            maxPrice: p.maxPrice,
          })
          .from(c)
          .innerJoin(p, eq(p.id, c.brandProductId))
          .where(inArray(c.trackedProductId, chunk));
      },
      postgres: (db) => {
        const c = postgresSchema.brandProductCards;
        const p = postgresSchema.brandProducts;
        return db
          .select({
            trackedProductId: c.trackedProductId,
            cardId: c.id,
            brandProductId: p.id,
            brandProductName: p.name,
            unitMultiplier: c.unitMultiplier,
            isPrimary: c.isPrimary,
            referencePrice: p.referencePrice,
            minPrice: p.minPrice,
            maxPrice: p.maxPrice,
          })
          .from(c)
          .innerJoin(p, eq(p.id, c.brandProductId))
          .where(inArray(c.trackedProductId, chunk));
      },
      mysql: (db) => {
        const c = mysqlSchema.brandProductCards;
        const p = mysqlSchema.brandProducts;
        return db
          .select({
            trackedProductId: c.trackedProductId,
            cardId: c.id,
            brandProductId: p.id,
            brandProductName: p.name,
            unitMultiplier: c.unitMultiplier,
            isPrimary: c.isPrimary,
            referencePrice: p.referencePrice,
            minPrice: p.minPrice,
            maxPrice: p.maxPrice,
          })
          .from(c)
          .innerJoin(p, eq(p.id, c.brandProductId))
          .where(inArray(c.trackedProductId, chunk));
      },
    })) as (CardLink & { trackedProductId: string })[];
    for (const { trackedProductId, ...link } of rows) result.set(trackedProductId, link);
  }
  return result;
}

export interface LinkCardInput {
  readonly id: string;
  readonly brandProductId: string;
  readonly trackedProductId: string;
  readonly unitMultiplier: number;
  /** Becomes the product's primary on the card's marketplace; a previous primary is demoted. */
  readonly isPrimary: boolean;
  readonly linkSource: CardLinkSource;
  readonly linkedAt: number;
}

export type LinkCardResult =
  | { readonly ok: true; readonly card: BrandProductCardRow; readonly demotedCardId: string | null }
  | { readonly ok: false; readonly reason: 'productNotFound' | 'cardNotFound' }
  /** The card is already linked — to this product or another; `brandProductId` says which. */
  | { readonly ok: false; readonly reason: 'cardAlreadyLinked'; readonly brandProductId: string };

/** What the transaction read, and what it therefore decided. Pure, so all three dialects share it. */
interface LinkState {
  readonly productExists: boolean;
  /** The card's marketplace, or `undefined` when no such tracked product exists. */
  readonly marketplaceCode: string | undefined;
  readonly existingLinkProductId: string | undefined;
  readonly currentPrimaryId: string | undefined;
}

function decideLink(state: LinkState, input: LinkCardInput): LinkCardResult {
  if (!state.productExists) return { ok: false, reason: 'productNotFound' };
  if (state.marketplaceCode === undefined) return { ok: false, reason: 'cardNotFound' };
  if (state.existingLinkProductId !== undefined) {
    return { ok: false, reason: 'cardAlreadyLinked', brandProductId: state.existingLinkProductId };
  }
  return {
    ok: true,
    card: {
      id: input.id,
      brandProductId: input.brandProductId,
      trackedProductId: input.trackedProductId,
      marketplaceCode: state.marketplaceCode,
      unitMultiplier: input.unitMultiplier,
      isPrimary: input.isPrimary,
      linkSource: input.linkSource,
      linkedAt: input.linkedAt,
    },
    demotedCardId: input.isPrimary ? (state.currentPrimaryId ?? null) : null,
  };
}

/**
 * Links a tracked product (a card) to a brand product.
 *
 * Refuses a card that is already linked anywhere — including to this same product: changing a
 * link's multiplier or primary flag is a separate, explicit action, not a re-link. The card's
 * `marketplace_code` is copied from the tracked product inside the transaction.
 */
export async function linkCard(appDb: AppDatabase, input: LinkCardInput): Promise<LinkCardResult> {
  assertMultiplier(input.unitMultiplier);

  if (appDb.dialect === 'sqlite') {
    const c = sqliteSchema.brandProductCards;
    // better-sqlite3 transactions must run synchronously to completion — no `await` inside.
    return appDb.db.transaction((tx) => {
      const product = tx
        .select({ id: sqliteSchema.brandProducts.id })
        .from(sqliteSchema.brandProducts)
        .where(eq(sqliteSchema.brandProducts.id, input.brandProductId))
        .get();
      const tracked = tx
        .select({ marketplaceCode: sqliteSchema.trackedProducts.marketplaceCode })
        .from(sqliteSchema.trackedProducts)
        .where(eq(sqliteSchema.trackedProducts.id, input.trackedProductId))
        .get();
      const existing = tx
        .select({ brandProductId: c.brandProductId })
        .from(c)
        .where(eq(c.trackedProductId, input.trackedProductId))
        .get();
      const primary = tracked
        ? tx
            .select({ id: c.id })
            .from(c)
            .where(
              and(
                eq(c.brandProductId, input.brandProductId),
                eq(c.marketplaceCode, tracked.marketplaceCode),
                eq(c.isPrimary, true),
              ),
            )
            .get()
        : undefined;
      const result = decideLink(
        {
          productExists: product !== undefined,
          marketplaceCode: tracked?.marketplaceCode,
          existingLinkProductId: existing?.brandProductId,
          currentPrimaryId: primary?.id,
        },
        input,
      );
      if (!result.ok) return result;
      if (result.demotedCardId !== null) {
        tx.update(c).set({ isPrimary: false }).where(eq(c.id, result.demotedCardId)).run();
      }
      tx.insert(c).values(result.card).run();
      return result;
    });
  }

  if (appDb.dialect === 'postgres') {
    const c = postgresSchema.brandProductCards;
    return appDb.db.transaction(async (tx) => {
      const product = await tx
        .select({ id: postgresSchema.brandProducts.id })
        .from(postgresSchema.brandProducts)
        .where(eq(postgresSchema.brandProducts.id, input.brandProductId))
        .for('update');
      const [tracked] = await tx
        .select({ marketplaceCode: postgresSchema.trackedProducts.marketplaceCode })
        .from(postgresSchema.trackedProducts)
        .where(eq(postgresSchema.trackedProducts.id, input.trackedProductId));
      const [existing] = await tx
        .select({ brandProductId: c.brandProductId })
        .from(c)
        .where(eq(c.trackedProductId, input.trackedProductId));
      const [primary] = tracked
        ? await tx
            .select({ id: c.id })
            .from(c)
            .where(
              and(
                eq(c.brandProductId, input.brandProductId),
                eq(c.marketplaceCode, tracked.marketplaceCode),
                eq(c.isPrimary, true),
              ),
            )
        : [];
      const result = decideLink(
        {
          productExists: product.length > 0,
          marketplaceCode: tracked?.marketplaceCode,
          existingLinkProductId: existing?.brandProductId,
          currentPrimaryId: primary?.id,
        },
        input,
      );
      if (!result.ok) return result;
      if (result.demotedCardId !== null) {
        await tx.update(c).set({ isPrimary: false }).where(eq(c.id, result.demotedCardId));
      }
      await tx.insert(c).values(result.card);
      return result;
    });
  }

  const c = mysqlSchema.brandProductCards;
  return appDb.db.transaction(async (tx) => {
    const product = await tx
      .select({ id: mysqlSchema.brandProducts.id })
      .from(mysqlSchema.brandProducts)
      .where(eq(mysqlSchema.brandProducts.id, input.brandProductId))
      .for('update');
    const [tracked] = await tx
      .select({ marketplaceCode: mysqlSchema.trackedProducts.marketplaceCode })
      .from(mysqlSchema.trackedProducts)
      .where(eq(mysqlSchema.trackedProducts.id, input.trackedProductId));
    const [existing] = await tx
      .select({ brandProductId: c.brandProductId })
      .from(c)
      .where(eq(c.trackedProductId, input.trackedProductId));
    const [primary] = tracked
      ? await tx
          .select({ id: c.id })
          .from(c)
          .where(
            and(
              eq(c.brandProductId, input.brandProductId),
              eq(c.marketplaceCode, tracked.marketplaceCode),
              eq(c.isPrimary, true),
            ),
          )
      : [];
    const result = decideLink(
      {
        productExists: product.length > 0,
        marketplaceCode: tracked?.marketplaceCode,
        existingLinkProductId: existing?.brandProductId,
        currentPrimaryId: primary?.id,
      },
      input,
    );
    if (!result.ok) return result;
    if (result.demotedCardId !== null) {
      await tx.update(c).set({ isPrimary: false }).where(eq(c.id, result.demotedCardId));
    }
    await tx.insert(c).values(result.card);
    return result;
  });
}

export type SetPrimaryResult =
  | { readonly ok: true; readonly demotedCardId: string | null }
  | { readonly ok: false; readonly reason: 'cardNotFound' };

/**
 * Makes a card its product's primary on its marketplace (doc 17 §2.4: "changing the primary is
 * allowed"). The previous primary stays linked as an ordinary card. Promoting the card that is
 * already primary changes nothing.
 */
export async function setPrimaryCard(appDb: AppDatabase, cardId: string): Promise<SetPrimaryResult> {
  if (appDb.dialect === 'sqlite') {
    const c = sqliteSchema.brandProductCards;
    return appDb.db.transaction((tx) => {
      const card = tx.select().from(c).where(eq(c.id, cardId)).get();
      if (!card) return { ok: false, reason: 'cardNotFound' } as const;
      const previous = tx
        .select({ id: c.id })
        .from(c)
        .where(
          and(
            eq(c.brandProductId, card.brandProductId),
            eq(c.marketplaceCode, card.marketplaceCode),
            eq(c.isPrimary, true),
            ne(c.id, cardId),
          ),
        )
        .get();
      if (previous) tx.update(c).set({ isPrimary: false }).where(eq(c.id, previous.id)).run();
      tx.update(c).set({ isPrimary: true }).where(eq(c.id, cardId)).run();
      return { ok: true, demotedCardId: previous?.id ?? null } as const;
    });
  }

  if (appDb.dialect === 'postgres') {
    const c = postgresSchema.brandProductCards;
    return appDb.db.transaction(async (tx) => {
      const [card] = await tx.select().from(c).where(eq(c.id, cardId));
      if (!card) return { ok: false, reason: 'cardNotFound' } as const;
      await tx
        .select({ id: postgresSchema.brandProducts.id })
        .from(postgresSchema.brandProducts)
        .where(eq(postgresSchema.brandProducts.id, card.brandProductId))
        .for('update');
      const [previous] = await tx
        .select({ id: c.id })
        .from(c)
        .where(
          and(
            eq(c.brandProductId, card.brandProductId),
            eq(c.marketplaceCode, card.marketplaceCode),
            eq(c.isPrimary, true),
            ne(c.id, cardId),
          ),
        );
      if (previous) await tx.update(c).set({ isPrimary: false }).where(eq(c.id, previous.id));
      await tx.update(c).set({ isPrimary: true }).where(eq(c.id, cardId));
      return { ok: true, demotedCardId: previous?.id ?? null } as const;
    });
  }

  const c = mysqlSchema.brandProductCards;
  return appDb.db.transaction(async (tx) => {
    const [card] = await tx.select().from(c).where(eq(c.id, cardId));
    if (!card) return { ok: false, reason: 'cardNotFound' } as const;
    await tx
      .select({ id: mysqlSchema.brandProducts.id })
      .from(mysqlSchema.brandProducts)
      .where(eq(mysqlSchema.brandProducts.id, card.brandProductId))
      .for('update');
    const [previous] = await tx
      .select({ id: c.id })
      .from(c)
      .where(
        and(
          eq(c.brandProductId, card.brandProductId),
          eq(c.marketplaceCode, card.marketplaceCode),
          eq(c.isPrimary, true),
          ne(c.id, cardId),
        ),
      );
    if (previous) await tx.update(c).set({ isPrimary: false }).where(eq(c.id, previous.id));
    await tx.update(c).set({ isPrimary: true }).where(eq(c.id, cardId));
    return { ok: true, demotedCardId: previous?.id ?? null } as const;
  });
}

export async function setCardMultiplier(
  appDb: AppDatabase,
  cardId: string,
  unitMultiplier: number,
): Promise<void> {
  assertMultiplier(unitMultiplier);
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.brandProductCards)
        .set({ unitMultiplier })
        .where(eq(sqliteSchema.brandProductCards.id, cardId)),
    postgres: (db) =>
      db
        .update(postgresSchema.brandProductCards)
        .set({ unitMultiplier })
        .where(eq(postgresSchema.brandProductCards.id, cardId)),
    mysql: (db) =>
      db
        .update(mysqlSchema.brandProductCards)
        .set({ unitMultiplier })
        .where(eq(mysqlSchema.brandProductCards.id, cardId)),
  });
}

/**
 * Removes a card's link; the tracked product itself stays. Resolving the card's open band
 * violations with reason `unlinked` (doc 17 §5.3) joins this once `band_violations` exists
 * (Phase 11.6).
 */
export async function unlinkCard(appDb: AppDatabase, cardId: string): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db.delete(sqliteSchema.brandProductCards).where(eq(sqliteSchema.brandProductCards.id, cardId)),
    postgres: (db) =>
      db.delete(postgresSchema.brandProductCards).where(eq(postgresSchema.brandProductCards.id, cardId)),
    mysql: (db) =>
      db.delete(mysqlSchema.brandProductCards).where(eq(mysqlSchema.brandProductCards.id, cardId)),
  });
}

// --------------------------------------------------------------- the Stok screen's queries

export interface BrandProductListRow extends BrandProductRow {
  /** How many cards are linked to it — the column that says whether a product is set up at all. */
  readonly cardCount: number;
  /** Marketplace codes its cards sit on, sorted, so the grid can show them without a second read. */
  readonly marketplaceCodes: readonly string[];
}

export interface BrandProductQuery {
  /** Structural search over the product's name and barcode — a filter, never a name *match*. */
  readonly text?: string;
  /** Products with no card at all: the shortlist of rows an import or a link left unfinished. */
  readonly unlinkedOnly?: boolean;
  readonly limit: number;
  readonly offset: number;
}

type BrandProductsTable =
  typeof sqliteSchema.brandProducts | typeof postgresSchema.brandProducts | typeof mysqlSchema.brandProducts;

function brandProductWhere(p: BrandProductsTable, pattern: string | undefined, unlinked: SQL | undefined) {
  const parts: (SQL | undefined)[] = [];
  if (pattern !== undefined) parts.push(or(like(p.name, pattern), like(p.barcode, pattern)));
  if (unlinked !== undefined) parts.push(unlinked);
  return parts.length === 0 ? undefined : and(...parts);
}

/**
 * The Stok (marka) grid's page: products, with the card counts the screen shows beside them.
 *
 * Server-paged like every other grid in this app (R-UI-5). The card counts are one query over
 * the page's ids rather than one per row — the same shape the tracked-products grid uses for its
 * period stats, and for the same reason: a brand manager's catalogue is thousands of rows, and a
 * per-row query is how a grid becomes unusable at exactly the size it starts mattering.
 */
export async function queryBrandProducts(
  appDb: AppDatabase,
  query: BrandProductQuery,
): Promise<{ rows: BrandProductListRow[]; total: number }> {
  const pattern = query.text?.trim() ? `%${query.text.trim()}%` : undefined;

  const page = await withDialect(appDb, {
    sqlite: async (db) => {
      const p = sqliteSchema.brandProducts;
      const c = sqliteSchema.brandProductCards;
      const where = brandProductWhere(
        p,
        pattern,
        query.unlinkedOnly
          ? notExists(
              db
                .select({ one: sql`1` })
                .from(c)
                .where(eq(c.brandProductId, p.id)),
            )
          : undefined,
      );
      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(p)
          .where(where)
          .orderBy(asc(p.name), asc(p.id))
          .limit(query.limit)
          .offset(query.offset),
        db.select({ n: count() }).from(p).where(where),
      ]);
      return { rows: rows as BrandProductRow[], total: Number(totalRow[0]?.n ?? 0) };
    },
    postgres: async (db) => {
      const p = postgresSchema.brandProducts;
      const c = postgresSchema.brandProductCards;
      const where = brandProductWhere(
        p,
        pattern,
        query.unlinkedOnly
          ? notExists(
              db
                .select({ one: sql`1` })
                .from(c)
                .where(eq(c.brandProductId, p.id)),
            )
          : undefined,
      );
      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(p)
          .where(where)
          .orderBy(asc(p.name), asc(p.id))
          .limit(query.limit)
          .offset(query.offset),
        db.select({ n: count() }).from(p).where(where),
      ]);
      return { rows: rows as BrandProductRow[], total: Number(totalRow[0]?.n ?? 0) };
    },
    mysql: async (db) => {
      const p = mysqlSchema.brandProducts;
      const c = mysqlSchema.brandProductCards;
      const where = brandProductWhere(
        p,
        pattern,
        query.unlinkedOnly
          ? notExists(
              db
                .select({ one: sql`1` })
                .from(c)
                .where(eq(c.brandProductId, p.id)),
            )
          : undefined,
      );
      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(p)
          .where(where)
          .orderBy(asc(p.name), asc(p.id))
          .limit(query.limit)
          .offset(query.offset),
        db.select({ n: count() }).from(p).where(where),
      ]);
      return { rows: rows as BrandProductRow[], total: Number(totalRow[0]?.n ?? 0) };
    },
  });

  const cards = await cardsOfProducts(
    appDb,
    page.rows.map((row) => row.id),
  );
  return {
    total: page.total,
    rows: page.rows.map((row) => {
      const own = cards.get(row.id) ?? [];
      return {
        ...row,
        cardCount: own.length,
        marketplaceCodes: [...new Set(own.map((card) => card.marketplaceCode))].sort(),
      };
    }),
  };
}

/** Every card of each named product, keyed by product id. Chunked like every other id lookup. */
export async function cardsOfProducts(
  appDb: AppDatabase,
  brandProductIds: readonly string[],
): Promise<Map<string, BrandProductCardRow[]>> {
  const byProduct = new Map<string, BrandProductCardRow[]>();
  for (let start = 0; start < brandProductIds.length; start += LOOKUP_CHUNK) {
    const chunk = brandProductIds.slice(start, start + LOOKUP_CHUNK);
    if (chunk.length === 0) continue;
    const rows = (await withDialect(appDb, {
      sqlite: (db) => {
        const c = sqliteSchema.brandProductCards;
        return db.select().from(c).where(inArray(c.brandProductId, chunk));
      },
      postgres: (db) => {
        const c = postgresSchema.brandProductCards;
        return db.select().from(c).where(inArray(c.brandProductId, chunk));
      },
      mysql: (db) => {
        const c = mysqlSchema.brandProductCards;
        return db.select().from(c).where(inArray(c.brandProductId, chunk));
      },
    })) as BrandProductCardRow[];
    for (const row of rows) {
      const list = byProduct.get(row.brandProductId) ?? [];
      list.push(row);
      byProduct.set(row.brandProductId, list);
    }
  }
  return byProduct;
}

/** A card with the tracked product behind it — what the product detail screen lists. */
export interface BrandProductCardDetail extends BrandProductCardRow {
  readonly label: string;
  readonly productRef: string;
  readonly productUrl: string;
  readonly isActive: boolean;
  readonly barcode: string | null;
  readonly lastScrapedAt: number | null;
  readonly hasSellers: boolean | null;
}

interface CardDetailColumns {
  card: BrandProductCardRow;
  label: string;
  productRef: string;
  productUrl: string;
  isActive: boolean;
  barcode: string | null;
  lastScrapedAt: number | null;
  hasSellers: boolean | null;
}

export async function listBrandProductCardDetails(
  appDb: AppDatabase,
  brandProductId: string,
): Promise<BrandProductCardDetail[]> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) => {
      const c = sqliteSchema.brandProductCards;
      const t = sqliteSchema.trackedProducts;
      return db
        .select({
          card: c,
          label: t.label,
          productRef: t.productRef,
          productUrl: t.productUrl,
          isActive: t.isActive,
          barcode: t.barcode,
          lastScrapedAt: t.lastScrapedAt,
          hasSellers: t.hasSellers,
        })
        .from(c)
        .innerJoin(t, eq(t.id, c.trackedProductId))
        .where(eq(c.brandProductId, brandProductId));
    },
    postgres: (db) => {
      const c = postgresSchema.brandProductCards;
      const t = postgresSchema.trackedProducts;
      return db
        .select({
          card: c,
          label: t.label,
          productRef: t.productRef,
          productUrl: t.productUrl,
          isActive: t.isActive,
          barcode: t.barcode,
          lastScrapedAt: t.lastScrapedAt,
          hasSellers: t.hasSellers,
        })
        .from(c)
        .innerJoin(t, eq(t.id, c.trackedProductId))
        .where(eq(c.brandProductId, brandProductId));
    },
    mysql: (db) => {
      const c = mysqlSchema.brandProductCards;
      const t = mysqlSchema.trackedProducts;
      return db
        .select({
          card: c,
          label: t.label,
          productRef: t.productRef,
          productUrl: t.productUrl,
          isActive: t.isActive,
          barcode: t.barcode,
          lastScrapedAt: t.lastScrapedAt,
          hasSellers: t.hasSellers,
        })
        .from(c)
        .innerJoin(t, eq(t.id, c.trackedProductId))
        .where(eq(c.brandProductId, brandProductId));
    },
  })) as CardDetailColumns[];
  return rows
    .map(({ card, ...tracked }) => ({ ...card, ...tracked }))
    .sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) ||
        a.marketplaceCode.localeCompare(b.marketplaceCode) ||
        a.linkedAt - b.linkedAt,
    );
}

export interface BarcodeSuggestion {
  readonly id: string;
  readonly marketplaceCode: string;
  readonly label: string;
  readonly productRef: string;
  readonly productUrl: string;
}

/**
 * Cards carrying this product's barcode that belong to no product yet — _Bu kart senin ürünün
 * olabilir_ (doc 17 §2.4).
 *
 * A **suggestion**, never an action: accepting one still asks for the multiplier, because a
 * barcode says two pages describe the same article and says nothing about how many units a pack
 * holds. Empty for a product with no barcode, and in practice Hepsiburada-only until a Trendyol
 * source states one (doc 05 "Barcodes").
 */
export async function barcodeSuggestions(
  appDb: AppDatabase,
  brandProductId: string,
  limit = 20,
): Promise<BarcodeSuggestion[]> {
  const product = await getBrandProduct(appDb, brandProductId);
  const barcode = product?.barcode?.trim();
  if (!barcode) return [];
  return withDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.trackedProducts;
      const c = sqliteSchema.brandProductCards;
      return db
        .select({
          id: t.id,
          marketplaceCode: t.marketplaceCode,
          label: t.label,
          productRef: t.productRef,
          productUrl: t.productUrl,
        })
        .from(t)
        .where(
          and(
            eq(t.barcode, barcode),
            notExists(
              db
                .select({ one: sql`1` })
                .from(c)
                .where(eq(c.trackedProductId, t.id)),
            ),
          ),
        )
        .limit(limit);
    },
    postgres: (db) => {
      const t = postgresSchema.trackedProducts;
      const c = postgresSchema.brandProductCards;
      return db
        .select({
          id: t.id,
          marketplaceCode: t.marketplaceCode,
          label: t.label,
          productRef: t.productRef,
          productUrl: t.productUrl,
        })
        .from(t)
        .where(
          and(
            eq(t.barcode, barcode),
            notExists(
              db
                .select({ one: sql`1` })
                .from(c)
                .where(eq(c.trackedProductId, t.id)),
            ),
          ),
        )
        .limit(limit);
    },
    mysql: (db) => {
      const t = mysqlSchema.trackedProducts;
      const c = mysqlSchema.brandProductCards;
      return db
        .select({
          id: t.id,
          marketplaceCode: t.marketplaceCode,
          label: t.label,
          productRef: t.productRef,
          productUrl: t.productUrl,
        })
        .from(t)
        .where(
          and(
            eq(t.barcode, barcode),
            notExists(
              db
                .select({ one: sql`1` })
                .from(c)
                .where(eq(c.trackedProductId, t.id)),
            ),
          ),
        )
        .limit(limit);
    },
  });
}

// ------------------------------------------------------------------ the Excel import (doc 17 §3)

/**
 * The cards named by an import file, as this install already knows them — the lookup
 * `planBrandProductImport` matches rows against (doc 17 §3.3).
 *
 * Keyed `marketplace::ref`, which is how a *file* names a card: the operator pastes a link, and
 * the link reduces to a marketplace and that marketplace's product id. A card the install tracks
 * but has linked to nothing is deliberately absent — there is nothing to match, and the import
 * will simply link it.
 */
export async function existingCardsForRefs(
  appDb: AppDatabase,
  refs: readonly { marketplace: string; contentId: string }[],
): Promise<Map<string, { brandProductId: string; brandProductName: string; isPrimary: boolean }>> {
  const result = new Map<string, { brandProductId: string; brandProductName: string; isPrimary: boolean }>();
  const byMarketplace = new Map<string, string[]>();
  for (const ref of refs) {
    byMarketplace.set(ref.marketplace, [...(byMarketplace.get(ref.marketplace) ?? []), ref.contentId]);
  }

  for (const [marketplace, contentIds] of byMarketplace) {
    for (let start = 0; start < contentIds.length; start += LOOKUP_CHUNK) {
      const chunk = contentIds.slice(start, start + LOOKUP_CHUNK);
      if (chunk.length === 0) continue;
      const rows = (await withDialect(appDb, {
        sqlite: (db) => {
          const t = sqliteSchema.trackedProducts;
          const c = sqliteSchema.brandProductCards;
          const p = sqliteSchema.brandProducts;
          return db
            .select({
              productRef: t.productRef,
              brandProductId: p.id,
              brandProductName: p.name,
              isPrimary: c.isPrimary,
            })
            .from(t)
            .innerJoin(c, eq(c.trackedProductId, t.id))
            .innerJoin(p, eq(p.id, c.brandProductId))
            .where(and(eq(t.marketplaceCode, marketplace), inArray(t.productRef, chunk)));
        },
        postgres: (db) => {
          const t = postgresSchema.trackedProducts;
          const c = postgresSchema.brandProductCards;
          const p = postgresSchema.brandProducts;
          return db
            .select({
              productRef: t.productRef,
              brandProductId: p.id,
              brandProductName: p.name,
              isPrimary: c.isPrimary,
            })
            .from(t)
            .innerJoin(c, eq(c.trackedProductId, t.id))
            .innerJoin(p, eq(p.id, c.brandProductId))
            .where(and(eq(t.marketplaceCode, marketplace), inArray(t.productRef, chunk)));
        },
        mysql: (db) => {
          const t = mysqlSchema.trackedProducts;
          const c = mysqlSchema.brandProductCards;
          const p = mysqlSchema.brandProducts;
          return db
            .select({
              productRef: t.productRef,
              brandProductId: p.id,
              brandProductName: p.name,
              isPrimary: c.isPrimary,
            })
            .from(t)
            .innerJoin(c, eq(c.trackedProductId, t.id))
            .innerJoin(p, eq(p.id, c.brandProductId))
            .where(and(eq(t.marketplaceCode, marketplace), inArray(t.productRef, chunk)));
        },
      })) as { productRef: string; brandProductId: string; brandProductName: string; isPrimary: boolean }[];
      for (const row of rows) {
        result.set(`${marketplace}::${row.productRef}`, {
          brandProductId: row.brandProductId,
          brandProductName: row.brandProductName,
          isPrimary: row.isPrimary,
        });
      }
    }
  }
  return result;
}

/** Every product name, for the import's duplicate-name warning. Names only — one column. */
export async function listBrandProductNames(appDb: AppDatabase): Promise<string[]> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) => db.select({ name: sqliteSchema.brandProducts.name }).from(sqliteSchema.brandProducts),
    postgres: (db) =>
      db.select({ name: postgresSchema.brandProducts.name }).from(postgresSchema.brandProducts),
    mysql: (db) => db.select({ name: mysqlSchema.brandProducts.name }).from(mysqlSchema.brandProducts),
  })) as { name: string }[];
  return rows.map((row) => row.name);
}

/** Tracked products for the refs an import names, so a card that exists is reused, never duplicated. */
export async function trackedProductIdsForRefs(
  appDb: AppDatabase,
  refs: readonly { marketplace: string; contentId: string }[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const byMarketplace = new Map<string, string[]>();
  for (const ref of refs) {
    byMarketplace.set(ref.marketplace, [...(byMarketplace.get(ref.marketplace) ?? []), ref.contentId]);
  }
  for (const [marketplace, contentIds] of byMarketplace) {
    for (let start = 0; start < contentIds.length; start += LOOKUP_CHUNK) {
      const chunk = contentIds.slice(start, start + LOOKUP_CHUNK);
      if (chunk.length === 0) continue;
      const rows = (await withDialect(appDb, {
        sqlite: (db) => {
          const t = sqliteSchema.trackedProducts;
          return db
            .select({ id: t.id, productRef: t.productRef })
            .from(t)
            .where(and(eq(t.marketplaceCode, marketplace), inArray(t.productRef, chunk)));
        },
        postgres: (db) => {
          const t = postgresSchema.trackedProducts;
          return db
            .select({ id: t.id, productRef: t.productRef })
            .from(t)
            .where(and(eq(t.marketplaceCode, marketplace), inArray(t.productRef, chunk)));
        },
        mysql: (db) => {
          const t = mysqlSchema.trackedProducts;
          return db
            .select({ id: t.id, productRef: t.productRef })
            .from(t)
            .where(and(eq(t.marketplaceCode, marketplace), inArray(t.productRef, chunk)));
        },
      })) as { id: string; productRef: string }[];
      for (const row of rows) found.set(`${marketplace}::${row.productRef}`, row.id);
    }
  }
  return found;
}

/** The primary card of each (product, marketplace) an import is about to write a primary into. */
export async function primaryCardsOfProducts(
  appDb: AppDatabase,
  brandProductIds: readonly string[],
): Promise<Map<string, string>> {
  const cards = await cardsOfProducts(appDb, brandProductIds);
  const primaries = new Map<string, string>();
  for (const [brandProductId, own] of cards) {
    for (const card of own) {
      if (card.isPrimary) primaries.set(`${brandProductId}::${card.marketplaceCode}`, card.id);
    }
  }
  return primaries;
}

/**
 * One write the import will make. The list is built outside the transaction and applied inside
 * it, so the transaction holds nothing but inserts and updates — the same shape on all three
 * engines, and short enough that SQLite's synchronous transaction can run it whole.
 */
export type ImportWrite =
  | { readonly op: 'insertProduct'; readonly row: BrandProductRow }
  | {
      readonly op: 'updateProduct';
      readonly id: string;
      readonly fields: BrandProductFields;
      readonly updatedAt: number;
    }
  | { readonly op: 'insertTracked'; readonly row: TrackedProductInsert }
  | { readonly op: 'demoteCard'; readonly cardId: string }
  | { readonly op: 'insertCard'; readonly row: BrandProductCardRow };

/** The subset of a tracked product an import creates — the sweep fills the rest when it looks. */
export interface TrackedProductInsert {
  readonly id: string;
  readonly marketplaceCode: string;
  readonly productRef: string;
  readonly productUrl: string;
  readonly label: string;
  readonly isActive: boolean;
  readonly addedAt: number;
}

/**
 * Applies a whole import **in one transaction** (doc 17 §3.5): either every valid row lands or
 * none does. A half-written import is the failure the confirmation step exists to prevent — the
 * operator has just been shown counts, and those counts have to be what happened.
 */
export async function applyBrandProductImport(
  appDb: AppDatabase,
  writes: readonly ImportWrite[],
): Promise<void> {
  if (writes.length === 0) return;

  if (appDb.dialect === 'sqlite') {
    const db = appDb.db;
    // better-sqlite3 transactions must run synchronously to completion — no `await` inside.
    db.transaction((tx) => {
      for (const write of writes) {
        switch (write.op) {
          case 'insertProduct':
            tx.insert(sqliteSchema.brandProducts).values(write.row).run();
            break;
          case 'updateProduct':
            tx.update(sqliteSchema.brandProducts)
              .set({ ...write.fields, updatedAt: write.updatedAt })
              .where(eq(sqliteSchema.brandProducts.id, write.id))
              .run();
            break;
          case 'insertTracked':
            tx.insert(sqliteSchema.trackedProducts).values(write.row).run();
            break;
          case 'demoteCard':
            tx.update(sqliteSchema.brandProductCards)
              .set({ isPrimary: false })
              .where(eq(sqliteSchema.brandProductCards.id, write.cardId))
              .run();
            break;
          case 'insertCard':
            tx.insert(sqliteSchema.brandProductCards).values(write.row).run();
            break;
        }
      }
    });
    return;
  }

  if (appDb.dialect === 'postgres') {
    const db = appDb.db;
    await db.transaction(async (tx) => {
      for (const write of writes) {
        switch (write.op) {
          case 'insertProduct':
            await tx.insert(postgresSchema.brandProducts).values(write.row);
            break;
          case 'updateProduct':
            await tx
              .update(postgresSchema.brandProducts)
              .set({ ...write.fields, updatedAt: write.updatedAt })
              .where(eq(postgresSchema.brandProducts.id, write.id));
            break;
          case 'insertTracked':
            await tx.insert(postgresSchema.trackedProducts).values(write.row);
            break;
          case 'demoteCard':
            await tx
              .update(postgresSchema.brandProductCards)
              .set({ isPrimary: false })
              .where(eq(postgresSchema.brandProductCards.id, write.cardId));
            break;
          case 'insertCard':
            await tx.insert(postgresSchema.brandProductCards).values(write.row);
            break;
        }
      }
    });
    return;
  }

  const db = appDb.db;
  await db.transaction(async (tx) => {
    for (const write of writes) {
      switch (write.op) {
        case 'insertProduct':
          await tx.insert(mysqlSchema.brandProducts).values(write.row);
          break;
        case 'updateProduct':
          await tx
            .update(mysqlSchema.brandProducts)
            .set({ ...write.fields, updatedAt: write.updatedAt })
            .where(eq(mysqlSchema.brandProducts.id, write.id));
          break;
        case 'insertTracked':
          await tx.insert(mysqlSchema.trackedProducts).values(write.row);
          break;
        case 'demoteCard':
          await tx
            .update(mysqlSchema.brandProductCards)
            .set({ isPrimary: false })
            .where(eq(mysqlSchema.brandProductCards.id, write.cardId));
          break;
        case 'insertCard':
          await tx.insert(mysqlSchema.brandProductCards).values(write.row);
          break;
      }
    }
  });
}
