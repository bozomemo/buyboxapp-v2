/**
 * `seller_policies` — who may sell which brand (doc 06 §12.4, Faz 5).
 *
 * Storage only. The *meaning* of the rows — precedence, the three states, what beats what — is
 * pure and lives in `packages/core`'s `resolveSellerPolicy`, which is where it can be
 * table-tested without a database. This file is deliberately the boring half.
 *
 * Two invariants are enforced here rather than by the schema, and both for the same reason: no
 * dialect can express them.
 *
 * 1. **Exactly one identity.** A rule names its seller by `(marketplace_code, seller_ref)` or by
 *    `tax_number`, never both and never neither — the same shape as `watched_brands`' "at least
 *    one selector", and no engine can express "exactly one of these column groups is set".
 * 2. **One rule per identity per scope.** A `UNIQUE` index over the identity columns would look
 *    like it enforced this and would not: every engine here treats `NULL` as distinct in a
 *    unique index, so two group defaults (`watched_brand_id IS NULL`) for the same seller would
 *    both be accepted. A constraint that reads as protection while providing none is worse than
 *    none at all, so the match is done in `upsertSellerPolicy` instead and said out loud.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export type SellerPolicyStatus = 'authorised' | 'blocked';

/** A rule as stored. `packages/core`'s `SellerPolicyRule` is the same thing, shaped for the resolver. */
export interface SellerPolicyRow {
  readonly id: string;
  readonly watchedBrandGroupId: string;
  /** Null = the group default, applying to every brand in the group that does not override it. */
  readonly watchedBrandId: string | null;
  readonly marketplaceCode: string | null;
  readonly sellerRef: string | null;
  readonly taxNumber: string | null;
  readonly status: SellerPolicyStatus;
  readonly note: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * A rule that names its seller by neither identity, or by both.
 *
 * Its own error type, like `WatchedBrandSelectorError`, so a route can turn it into a 400 with
 * the operator's own words rather than a 500 — this is a filled-in form being wrong, not the
 * system being broken.
 */
export class SellerPolicyIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SellerPolicyIdentityError';
  }
}

export class SellerPolicyStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SellerPolicyStatusError';
  }
}

/** What identifies the seller a rule is about. Never a display name (doc 05 §5). */
export type PolicyIdentityInput =
  | { readonly marketplaceCode: string; readonly sellerRef: string; readonly taxNumber?: null }
  | { readonly taxNumber: string; readonly marketplaceCode?: null; readonly sellerRef?: null };

export interface UpsertSellerPolicyInput {
  readonly id: string;
  readonly watchedBrandGroupId: string;
  readonly watchedBrandId: string | null;
  readonly identity: PolicyIdentityInput;
  readonly status: SellerPolicyStatus;
  readonly note: string | null;
  readonly nowMs: number;
}

interface NormalisedIdentity {
  readonly marketplaceCode: string | null;
  readonly sellerRef: string | null;
  readonly taxNumber: string | null;
}

/**
 * Trims, and insists on exactly one identity.
 *
 * A tax number is stored **as typed apart from whitespace** — no digit-stripping, no length
 * check. Turkish tax numbers are 10 digits and national id numbers 11, and an operator pasting
 * from a supplier's own paperwork may legitimately have either; silently reformatting what they
 * typed would make the value stop matching the thing they copied it from.
 */
function normaliseIdentity(identity: PolicyIdentityInput): NormalisedIdentity {
  const marketplaceCode = identity.marketplaceCode?.trim() || null;
  const sellerRef = identity.sellerRef?.trim() || null;
  const taxNumber = identity.taxNumber?.trim() || null;

  const hasSeller = marketplaceCode !== null && sellerRef !== null;
  const hasTax = taxNumber !== null;

  if (hasSeller && hasTax) {
    throw new SellerPolicyIdentityError(
      'Bir kural ya satıcı hesabını ya vergi numarasını gösterir, ikisini birden değil.',
    );
  }
  if (!hasSeller && !hasTax) {
    throw new SellerPolicyIdentityError(
      'Satıcı kimliği gerekli: ya pazaryeri + satıcı kodu, ya vergi numarası. İsim kabul edilmez.',
    );
  }
  // A ref without a marketplace is not an identity: the same digits are different companies on
  // different marketplaces, so half the pair is not half an answer, it is no answer.
  if (!hasSeller && (marketplaceCode !== null || sellerRef !== null)) {
    throw new SellerPolicyIdentityError(
      'Satıcı kodu tek başına yeterli değil — hangi pazaryerinde olduğu da gerekir.',
    );
  }

  return hasSeller
    ? { marketplaceCode, sellerRef, taxNumber: null }
    : { marketplaceCode: null, sellerRef: null, taxNumber };
}

function assertStatus(status: string): asserts status is SellerPolicyStatus {
  if (status !== 'authorised' && status !== 'blocked') {
    throw new SellerPolicyStatusError(
      `Geçersiz durum "${status}". Yalnızca "authorised" ve "blocked" saklanır; üçüncü durum (tanımsız) kaydın yokluğudur.`,
    );
  }
}

/**
 * The three dialects' `seller_policies` share every column name, so each predicate below is
 * written once against their union rather than three times per branch — the same trick
 * `buildTrackedWhere` uses. Two hand-copied predicates are how a filter comes to behave
 * differently on one engine only.
 */
type PoliciesTable =
  | typeof sqliteSchema.sellerPolicies
  | typeof postgresSchema.sellerPolicies
  | typeof mysqlSchema.sellerPolicies;

/** `watched_brand_id` compared with `IS NULL` when it is null — `= NULL` is never true. */
function scopeClause(t: PoliciesTable, groupId: string, brandId: string | null) {
  return and(
    eq(t.watchedBrandGroupId, groupId),
    brandId === null ? isNull(t.watchedBrandId) : eq(t.watchedBrandId, brandId),
  );
}

function identityClause(t: PoliciesTable, identity: NormalisedIdentity) {
  return identity.taxNumber !== null
    ? and(isNull(t.sellerRef), eq(t.taxNumber, identity.taxNumber))
    : and(eq(t.marketplaceCode, identity.marketplaceCode!), eq(t.sellerRef, identity.sellerRef!));
}

/**
 * Writes one rule, replacing whatever the same seller had in the same scope.
 *
 * An **update rather than a second row**, because two contradictory statements about one seller
 * and one brand are not a history — they are an ambiguity the resolver would then have to break
 * arbitrarily. Changing your mind about a seller replaces the statement; `created_at` is kept
 * from the original so "since when have we had a view on this seller" survives the change.
 *
 * Returns the id actually written, which is the caller's `id` for a new rule and the existing
 * row's for a replacement — an import needs to know which of the two happened.
 */
export async function upsertSellerPolicy(
  appDb: AppDatabase,
  input: UpsertSellerPolicyInput,
): Promise<{ readonly id: string; readonly created: boolean }> {
  assertStatus(input.status);
  const identity = normaliseIdentity(input.identity);

  const existing = await findSellerPolicy(appDb, {
    watchedBrandGroupId: input.watchedBrandGroupId,
    watchedBrandId: input.watchedBrandId,
    identity,
  });

  if (existing) {
    await runDialect(appDb, {
      sqlite: (db) =>
        db
          .update(sqliteSchema.sellerPolicies)
          .set({ status: input.status, note: input.note, updatedAt: input.nowMs })
          .where(eq(sqliteSchema.sellerPolicies.id, existing.id)),
      postgres: (db) =>
        db
          .update(postgresSchema.sellerPolicies)
          .set({ status: input.status, note: input.note, updatedAt: input.nowMs })
          .where(eq(postgresSchema.sellerPolicies.id, existing.id)),
      mysql: (db) =>
        db
          .update(mysqlSchema.sellerPolicies)
          .set({ status: input.status, note: input.note, updatedAt: input.nowMs })
          .where(eq(mysqlSchema.sellerPolicies.id, existing.id)),
    });
    return { id: existing.id, created: false };
  }

  const row = {
    id: input.id,
    watchedBrandGroupId: input.watchedBrandGroupId,
    watchedBrandId: input.watchedBrandId,
    marketplaceCode: identity.marketplaceCode,
    sellerRef: identity.sellerRef,
    taxNumber: identity.taxNumber,
    status: input.status,
    note: input.note,
    createdAt: input.nowMs,
    updatedAt: input.nowMs,
  };
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.sellerPolicies).values(row),
    postgres: (db) => db.insert(postgresSchema.sellerPolicies).values(row),
    mysql: (db) => db.insert(mysqlSchema.sellerPolicies).values(row),
  });
  return { id: input.id, created: true };
}

export async function findSellerPolicy(
  appDb: AppDatabase,
  key: {
    readonly watchedBrandGroupId: string;
    readonly watchedBrandId: string | null;
    readonly identity: NormalisedIdentity;
  },
): Promise<SellerPolicyRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) => {
      const t = sqliteSchema.sellerPolicies;
      return (
        await db
          .select()
          .from(t)
          .where(
            and(
              scopeClause(t, key.watchedBrandGroupId, key.watchedBrandId),
              identityClause(t, key.identity),
            ),
          )
      )[0];
    },
    postgres: async (db) => {
      const t = postgresSchema.sellerPolicies;
      return (
        await db
          .select()
          .from(t)
          .where(
            and(
              scopeClause(t, key.watchedBrandGroupId, key.watchedBrandId),
              identityClause(t, key.identity),
            ),
          )
      )[0];
    },
    mysql: async (db) => {
      const t = mysqlSchema.sellerPolicies;
      return (
        await db
          .select()
          .from(t)
          .where(
            and(
              scopeClause(t, key.watchedBrandGroupId, key.watchedBrandId),
              identityClause(t, key.identity),
            ),
          )
      )[0];
    },
  }) as Promise<SellerPolicyRow | undefined>;
}

/**
 * Every rule in a group, both its own defaults and its brands' overrides.
 *
 * The whole group rather than one brand, because the resolver needs both levels to answer for
 * any one brand — and because a screen showing a brand's effective policy has to be able to say
 * *"authorised by the group default"*, which it cannot do from the brand's own rows alone.
 */
export async function listSellerPolicies(
  appDb: AppDatabase,
  filters: { readonly watchedBrandGroupId?: string; readonly watchedBrandIds?: readonly string[] } = {},
): Promise<SellerPolicyRow[]> {
  return withDialect(appDb, {
    sqlite: async (db) => {
      const t = sqliteSchema.sellerPolicies;
      return db.select().from(t).where(listClause(t, filters));
    },
    postgres: async (db) => {
      const t = postgresSchema.sellerPolicies;
      return db.select().from(t).where(listClause(t, filters));
    },
    mysql: async (db) => {
      const t = mysqlSchema.sellerPolicies;
      return db.select().from(t).where(listClause(t, filters));
    },
  }) as Promise<SellerPolicyRow[]>;
}

function listClause(
  t: PoliciesTable,
  filters: { readonly watchedBrandGroupId?: string; readonly watchedBrandIds?: readonly string[] },
) {
  const parts = [];
  if (filters.watchedBrandGroupId !== undefined) {
    parts.push(eq(t.watchedBrandGroupId, filters.watchedBrandGroupId));
  }
  if (filters.watchedBrandIds !== undefined) {
    // Group defaults are **always** included: a rule scoped to the whole group is in force for
    // every brand named here, and a filter that dropped it would report a seller as undefined
    // when the group has plainly ruled on them.
    parts.push(
      filters.watchedBrandIds.length === 0
        ? isNull(t.watchedBrandId)
        : sql`(${t.watchedBrandId} is null or ${inArray(t.watchedBrandId, [...filters.watchedBrandIds])})`,
    );
  }
  return parts.length === 0 ? undefined : and(...parts);
}

export async function deleteSellerPolicy(appDb: AppDatabase, id: string): Promise<void> {
  // A hard delete, and it is the *only* way to reach the third state: `undefined` is the absence
  // of a row, so "I no longer have a view on this seller" cannot be expressed as a status.
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.sellerPolicies).where(eq(sqliteSchema.sellerPolicies.id, id)),
    postgres: (db) =>
      db.delete(postgresSchema.sellerPolicies).where(eq(postgresSchema.sellerPolicies.id, id)),
    mysql: (db) => db.delete(mysqlSchema.sellerPolicies).where(eq(mysqlSchema.sellerPolicies.id, id)),
  });
}

/**
 * Records the firm behind a marketplace storefront (`competitor_sellers.tax_number`).
 *
 * Operator-owned, so a scrape never touches it — the same rule `group_id` and `operator_note`
 * follow. Faz 7 will resolve tax numbers automatically from the marketplace's own seller page
 * and must write only where this is null; a resolved value never overwrites a person's entry.
 */
export async function setSellerTaxNumber(
  appDb: AppDatabase,
  key: { readonly marketplaceCode: string; readonly sellerRef: string },
  taxNumber: string | null,
): Promise<void> {
  const value = taxNumber?.trim() || null;
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .update(sqliteSchema.competitorSellers)
        .set({ taxNumber: value })
        .where(
          and(
            eq(sqliteSchema.competitorSellers.marketplaceCode, key.marketplaceCode),
            eq(sqliteSchema.competitorSellers.sellerRef, key.sellerRef),
          ),
        ),
    postgres: (db) =>
      db
        .update(postgresSchema.competitorSellers)
        .set({ taxNumber: value })
        .where(
          and(
            eq(postgresSchema.competitorSellers.marketplaceCode, key.marketplaceCode),
            eq(postgresSchema.competitorSellers.sellerRef, key.sellerRef),
          ),
        ),
    mysql: (db) =>
      db
        .update(mysqlSchema.competitorSellers)
        .set({ taxNumber: value })
        .where(
          and(
            eq(mysqlSchema.competitorSellers.marketplaceCode, key.marketplaceCode),
            eq(mysqlSchema.competitorSellers.sellerRef, key.sellerRef),
          ),
        ),
  });
}
