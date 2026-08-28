/**
 * `competitor_seller_identities` — the firm behind a storefront, as resolved on demand
 * (doc 05, doc 06 §12.4 Faz 7, guide §29).
 *
 * One row per seller, replaced by each resolution. See the schema's doc comment for why this is
 * its own table rather than six more nullable columns on `competitor_sellers`: these fields are
 * a dated copy of what one page said, not operator-owned data, and "stop retaining them" has to
 * be a `DELETE`.
 *
 * ⚠️ Nothing stored here is an input to anything priced. The tax number is copied onto
 * `competitor_sellers` (and only when that column is null) so Faz 5's authorised-seller list can
 * match on it; every other field exists to be read by a person writing a notice.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

/** One listing of this seller on the product the identity was resolved through. */
export interface SellerIdentityListing {
  readonly listingRef: string | null;
  readonly itemRef: string | null;
  readonly barcode: string | null;
  readonly offeredStock: number | null;
}

export interface SellerIdentityRow {
  readonly id: string;
  readonly competitorSellerId: string;
  readonly officialName: string | null;
  readonly taxNumber: string | null;
  readonly taxOffice: string | null;
  readonly registeredEmailAddress: string | null;
  readonly address: string | null;
  readonly cityName: string | null;
  readonly countryName: string | null;
  readonly listings: readonly SellerIdentityListing[];
  readonly sourceUrl: string;
  readonly parserVersion: string;
  readonly resolvedAt: number;
}

export interface SellerIdentityInput extends Omit<SellerIdentityRow, 'listings'> {
  readonly listings: readonly SellerIdentityListing[];
}

interface StoredRow {
  readonly id: string;
  readonly competitorSellerId: string;
  readonly officialName: string | null;
  readonly taxNumber: string | null;
  readonly taxOffice: string | null;
  readonly registeredEmailAddress: string | null;
  readonly address: string | null;
  readonly cityName: string | null;
  readonly countryName: string | null;
  readonly listingsJson: string;
  readonly sourceUrl: string;
  readonly parserVersion: string;
  readonly resolvedAt: number;
}

/**
 * A malformed `listings_json` yields an empty list rather than throwing.
 *
 * The listings are evidence attached to an identity, not the identity. A row written by an older
 * parser version whose JSON no longer decodes must still be able to show the operator a tax
 * number and a registered title — losing the whole record over its least important field would
 * be the wrong trade.
 */
function decodeListings(json: string): SellerIdentityListing[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SellerIdentityListing => typeof item === 'object' && item !== null);
  } catch {
    return [];
  }
}

function toRow(stored: StoredRow): SellerIdentityRow {
  const { listingsJson, ...rest } = stored;
  return { ...rest, listings: decodeListings(listingsJson) };
}

function toValues(input: SellerIdentityInput) {
  const { listings, ...rest } = input;
  return { ...rest, listingsJson: JSON.stringify(listings) };
}

/**
 * Stores a resolution, replacing whatever was there.
 *
 * Every column is overwritten, including the ones the new payload left null. A resolution is a
 * complete statement about one moment: merging a fresh answer over a stale one would silently
 * produce a record that never existed on any page — a tax office from March next to an address
 * from August, with one date on the row.
 */
export async function upsertSellerIdentity(appDb: AppDatabase, input: SellerIdentityInput): Promise<void> {
  const values = toValues(input);
  const set = {
    officialName: values.officialName,
    taxNumber: values.taxNumber,
    taxOffice: values.taxOffice,
    registeredEmailAddress: values.registeredEmailAddress,
    address: values.address,
    cityName: values.cityName,
    countryName: values.countryName,
    listingsJson: values.listingsJson,
    sourceUrl: values.sourceUrl,
    parserVersion: values.parserVersion,
    resolvedAt: values.resolvedAt,
  };

  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(sqliteSchema.competitorSellerIdentities)
        .values(values)
        .onConflictDoUpdate({ target: sqliteSchema.competitorSellerIdentities.competitorSellerId, set }),
    postgres: (db) =>
      db
        .insert(postgresSchema.competitorSellerIdentities)
        .values(values)
        .onConflictDoUpdate({ target: postgresSchema.competitorSellerIdentities.competitorSellerId, set }),
    mysql: (db) =>
      db.insert(mysqlSchema.competitorSellerIdentities).values(values).onDuplicateKeyUpdate({ set }),
  });
}

export async function getSellerIdentity(
  appDb: AppDatabase,
  competitorSellerId: string,
): Promise<SellerIdentityRow | undefined> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.competitorSellerIdentities)
        .where(eq(sqliteSchema.competitorSellerIdentities.competitorSellerId, competitorSellerId))
        .limit(1),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.competitorSellerIdentities)
        .where(eq(postgresSchema.competitorSellerIdentities.competitorSellerId, competitorSellerId))
        .limit(1),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.competitorSellerIdentities)
        .where(eq(mysqlSchema.competitorSellerIdentities.competitorSellerId, competitorSellerId))
        .limit(1),
  })) as StoredRow[];
  const first = rows[0];
  return first === undefined ? undefined : toRow(first);
}

/** Bulk lookup for the sellers screen, which renders a "resolved" marker per row. */
export async function sellerIdentitiesByIds(
  appDb: AppDatabase,
  competitorSellerIds: readonly string[],
): Promise<Map<string, SellerIdentityRow>> {
  if (competitorSellerIds.length === 0) return new Map();
  const ids = [...competitorSellerIds];
  const rows = (await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.competitorSellerIdentities)
        .where(inArray(sqliteSchema.competitorSellerIdentities.competitorSellerId, ids)),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.competitorSellerIdentities)
        .where(inArray(postgresSchema.competitorSellerIdentities.competitorSellerId, ids)),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.competitorSellerIdentities)
        .where(inArray(mysqlSchema.competitorSellerIdentities.competitorSellerId, ids)),
  })) as StoredRow[];
  return new Map(rows.map((row) => [row.competitorSellerId, toRow(row)]));
}

/**
 * Forgets a resolution. The seller row, its group and the operator's note all survive.
 *
 * Guide §29 asks that business/contact metadata be retained only while the application needs it;
 * this is the operator's way of saying it no longer does, without losing the storefront's
 * observation history.
 */
export async function deleteSellerIdentity(appDb: AppDatabase, competitorSellerId: string): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .delete(sqliteSchema.competitorSellerIdentities)
        .where(eq(sqliteSchema.competitorSellerIdentities.competitorSellerId, competitorSellerId)),
    postgres: (db) =>
      db
        .delete(postgresSchema.competitorSellerIdentities)
        .where(eq(postgresSchema.competitorSellerIdentities.competitorSellerId, competitorSellerId)),
    mysql: (db) =>
      db
        .delete(mysqlSchema.competitorSellerIdentities)
        .where(eq(mysqlSchema.competitorSellerIdentities.competitorSellerId, competitorSellerId)),
  });
}

/**
 * Copies a resolved tax number onto `competitor_sellers.tax_number` — **only** where that column
 * is still null. Returns whether it wrote.
 *
 * That column is operator-owned (Faz 5): it is what an authorised-seller list entered by tax
 * number matches against, and an operator may have typed it in from a contract rather than from
 * any page. A resolution is allowed to fill a gap and never to correct a person. If the two
 * disagree, the screen says so and the human decides — silently replacing one with the other
 * would change which sellers count as authorised, with nothing on screen to explain why.
 *
 * The `is null` guard is in the `WHERE`, not only in the read above it, so two resolutions
 * arriving together cannot both decide the column was empty.
 */
export async function setSellerTaxNumberIfAbsent(
  appDb: AppDatabase,
  competitorSellerId: string,
  taxNumber: string,
): Promise<boolean> {
  if (taxNumber.trim() === '') return false;

  const existing = (await withDialect(appDb, {
    sqlite: (db) =>
      db
        .select({ taxNumber: sqliteSchema.competitorSellers.taxNumber })
        .from(sqliteSchema.competitorSellers)
        .where(eq(sqliteSchema.competitorSellers.id, competitorSellerId))
        .limit(1),
    postgres: (db) =>
      db
        .select({ taxNumber: postgresSchema.competitorSellers.taxNumber })
        .from(postgresSchema.competitorSellers)
        .where(eq(postgresSchema.competitorSellers.id, competitorSellerId))
        .limit(1),
    mysql: (db) =>
      db
        .select({ taxNumber: mysqlSchema.competitorSellers.taxNumber })
        .from(mysqlSchema.competitorSellers)
        .where(eq(mysqlSchema.competitorSellers.id, competitorSellerId))
        .limit(1),
  })) as { taxNumber: string | null }[];
  if (existing.length === 0 || existing[0]!.taxNumber !== null) return false;

  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.competitorSellers)
        .set({ taxNumber })
        .where(
          and(
            eq(sqliteSchema.competitorSellers.id, competitorSellerId),
            isNull(sqliteSchema.competitorSellers.taxNumber),
          ),
        ),
    postgres: (db) =>
      db
        .update(postgresSchema.competitorSellers)
        .set({ taxNumber })
        .where(
          and(
            eq(postgresSchema.competitorSellers.id, competitorSellerId),
            isNull(postgresSchema.competitorSellers.taxNumber),
          ),
        ),
    mysql: (db) =>
      db
        .update(mysqlSchema.competitorSellers)
        .set({ taxNumber })
        .where(
          and(
            eq(mysqlSchema.competitorSellers.id, competitorSellerId),
            isNull(mysqlSchema.competitorSellers.taxNumber),
          ),
        ),
  });
  return true;
}

/**
 * How many sellers have a stored identity — one number for the sellers screen's header, so an
 * operator can see at a glance how much of the list has been looked into.
 */
export async function countSellerIdentities(appDb: AppDatabase): Promise<number> {
  const rows = (await withDialect(appDb, {
    sqlite: (db) =>
      db.select({ n: sql<number>`count(*)` }).from(sqliteSchema.competitorSellerIdentities),
    postgres: (db) =>
      db.select({ n: sql<number>`count(*)` }).from(postgresSchema.competitorSellerIdentities),
    mysql: (db) => db.select({ n: sql<number>`count(*)` }).from(mysqlSchema.competitorSellerIdentities),
  })) as { n: number | string }[];
  return Number(rows[0]?.n ?? 0);
}
