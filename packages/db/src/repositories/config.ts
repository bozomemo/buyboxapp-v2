/**
 * Repositories for `marketplaces`, `fee_settings`, `repricing_policies`, `app_settings`
 * and `settings_audit` (doc 05 §2).
 */
import { eq, and, lte, desc } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

export interface MarketplaceRow {
  readonly code: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly merchantRef: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export async function upsertMarketplace(appDb: AppDatabase, row: MarketplaceRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(sqliteSchema.marketplaces)
        .values(row)
        .onConflictDoUpdate({
          target: sqliteSchema.marketplaces.code,
          set: {
            displayName: row.displayName,
            enabled: row.enabled,
            merchantRef: row.merchantRef,
            updatedAt: row.updatedAt,
          },
        }),
    postgres: (db) =>
      db
        .insert(postgresSchema.marketplaces)
        .values(row)
        .onConflictDoUpdate({
          target: postgresSchema.marketplaces.code,
          set: {
            displayName: row.displayName,
            enabled: row.enabled,
            merchantRef: row.merchantRef,
            updatedAt: row.updatedAt,
          },
        }),
    mysql: (db) =>
      db
        .insert(mysqlSchema.marketplaces)
        .values(row)
        .onDuplicateKeyUpdate({
          set: {
            displayName: row.displayName,
            enabled: row.enabled,
            merchantRef: row.merchantRef,
            updatedAt: row.updatedAt,
          },
        }),
  });
}

export async function getMarketplace(appDb: AppDatabase, code: string): Promise<MarketplaceRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (await db.select().from(sqliteSchema.marketplaces).where(eq(sqliteSchema.marketplaces.code, code)))[0],
    postgres: async (db) =>
      (
        await db.select().from(postgresSchema.marketplaces).where(eq(postgresSchema.marketplaces.code, code))
      )[0],
    mysql: async (db) =>
      (await db.select().from(mysqlSchema.marketplaces).where(eq(mysqlSchema.marketplaces.code, code)))[0],
  });
}

export async function listMarketplaces(appDb: AppDatabase): Promise<MarketplaceRow[]> {
  return withDialect(appDb, {
    sqlite: (db) => db.select().from(sqliteSchema.marketplaces),
    postgres: (db) => db.select().from(postgresSchema.marketplaces),
    mysql: (db) => db.select().from(mysqlSchema.marketplaces),
  });
}

export interface FeeSettingsRow {
  readonly id: string;
  readonly marketplaceCode: string;
  readonly effectiveFrom: number;
  readonly commissionVatRate: number;
  readonly commissionRateIncludesVat: boolean;
  readonly commissionVatDeductible: boolean;
  readonly commissionBase: 'gross' | 'net';
  readonly defaultCommissionRate: number;
  /** Serialised JSON: `{ maxPrice: string | null; amount: string }[]` (money as decimal strings). */
  readonly cargoBands: string;
  readonly cargoAmountsIncludeVat: boolean;
  readonly cargoVatRate: number;
  readonly cargoVatDeductible: boolean;
  /** Serialised JSON: `{ minPrice: string; amount: string }[]`. */
  readonly expenditureBands: string;
  readonly expenditureIncludesVat: boolean;
  readonly expenditureVatRate: number;
  readonly expenditureVatDeductible: boolean;
}

/** Fee settings are never updated in place (doc 05 §2) — always a fresh insert. */
export async function insertFeeSettings(appDb: AppDatabase, row: FeeSettingsRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.feeSettings).values(row as never),
    postgres: (db) => db.insert(postgresSchema.feeSettings).values(row as never),
    mysql: (db) => db.insert(mysqlSchema.feeSettings).values(row as never),
  });
}

/** The row effective at `atMs` for a marketplace — the latest `effectiveFrom <= atMs`. */
export async function getEffectiveFeeSettings(
  appDb: AppDatabase,
  marketplaceCode: string,
  atMs: number,
): Promise<FeeSettingsRow | undefined> {
  // `commissionBase` etc. are plain `text` at the Drizzle level (doc 05 §1: enums are
  // "text + check constraint", not a native type) — see the note in
  // repositories/competition.ts's latestBuyboxObservation for why this cast is safe.
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.feeSettings)
          .where(
            and(
              eq(sqliteSchema.feeSettings.marketplaceCode, marketplaceCode),
              lte(sqliteSchema.feeSettings.effectiveFrom, atMs),
            ),
          )
          .orderBy(desc(sqliteSchema.feeSettings.effectiveFrom))
          .limit(1)
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.feeSettings)
          .where(
            and(
              eq(postgresSchema.feeSettings.marketplaceCode, marketplaceCode),
              lte(postgresSchema.feeSettings.effectiveFrom, atMs),
            ),
          )
          .orderBy(desc(postgresSchema.feeSettings.effectiveFrom))
          .limit(1)
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.feeSettings)
          .where(
            and(
              eq(mysqlSchema.feeSettings.marketplaceCode, marketplaceCode),
              lte(mysqlSchema.feeSettings.effectiveFrom, atMs),
            ),
          )
          .orderBy(desc(mysqlSchema.feeSettings.effectiveFrom))
          .limit(1)
      )[0],
  }) as Promise<FeeSettingsRow | undefined>;
}

export interface RepricingPolicyRow {
  readonly marketplaceCode: string;
  readonly coarseStepMode: 'absolute' | 'percent';
  readonly coarseStepAbsolute: bigint | null;
  readonly coarseStepPercent: number | null;
  readonly refineTolerance: bigint;
  readonly seekStrategy: 'direct' | 'stepped';
  readonly undercutBy: bigint;
  readonly seekStep: bigint;
  readonly soleSellerMarginPct: number;
  readonly lowStockGuardEnabled: boolean;
  readonly lowStockThreshold: number;
  readonly lowStockMarginPct: number;
  readonly stockMode: 'respectStock' | 'ignoreStock';
  readonly minPhysicalStock: number;
  readonly requirePriceConfirmation: boolean;
  readonly settleDurationMs: number;
  readonly competitorPriceDelta: bigint;
  readonly useSellerIdentityTrigger: boolean;
  readonly pollIntervalMs: number;
  readonly concurrency: number;
  readonly dailyUpdateAllowanceFormula: string;
  readonly budgetReservePct: number;
  readonly enabled: boolean;
  readonly updatedBy: string;
  readonly updatedAt: number;
}

export async function upsertRepricingPolicy(appDb: AppDatabase, row: RepricingPolicyRow): Promise<void> {
  const { marketplaceCode, ...set } = row;
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(sqliteSchema.repricingPolicies)
        .values(row)
        .onConflictDoUpdate({ target: sqliteSchema.repricingPolicies.marketplaceCode, set }),
    postgres: (db) =>
      db
        .insert(postgresSchema.repricingPolicies)
        .values(row)
        .onConflictDoUpdate({ target: postgresSchema.repricingPolicies.marketplaceCode, set }),
    mysql: (db) => db.insert(mysqlSchema.repricingPolicies).values(row).onDuplicateKeyUpdate({ set }),
  });
}

export async function getRepricingPolicy(
  appDb: AppDatabase,
  marketplaceCode: string,
): Promise<RepricingPolicyRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (
        await db
          .select()
          .from(sqliteSchema.repricingPolicies)
          .where(eq(sqliteSchema.repricingPolicies.marketplaceCode, marketplaceCode))
      )[0],
    postgres: async (db) =>
      (
        await db
          .select()
          .from(postgresSchema.repricingPolicies)
          .where(eq(postgresSchema.repricingPolicies.marketplaceCode, marketplaceCode))
      )[0],
    mysql: async (db) =>
      (
        await db
          .select()
          .from(mysqlSchema.repricingPolicies)
          .where(eq(mysqlSchema.repricingPolicies.marketplaceCode, marketplaceCode))
      )[0],
  }) as Promise<RepricingPolicyRow | undefined>;
}

export interface AppSettingRow {
  readonly key: string;
  readonly value: string; // JSON
  readonly updatedBy: string;
  readonly updatedAt: number;
}

/** Sets a setting and appends the audit row in the same call — settings are never set silently. */
export async function setAppSetting(appDb: AppDatabase, row: AppSettingRow, auditId: string): Promise<void> {
  const previous = await getAppSetting(appDb, row.key);
  await runDialect(appDb, {
    sqlite: (db) =>
      db
        .insert(sqliteSchema.appSettings)
        .values(row)
        .onConflictDoUpdate({
          target: sqliteSchema.appSettings.key,
          set: { value: row.value, updatedBy: row.updatedBy, updatedAt: row.updatedAt },
        }),
    postgres: (db) =>
      db
        .insert(postgresSchema.appSettings)
        .values(row)
        .onConflictDoUpdate({
          target: postgresSchema.appSettings.key,
          set: { value: row.value, updatedBy: row.updatedBy, updatedAt: row.updatedAt },
        }),
    mysql: (db) =>
      db
        .insert(mysqlSchema.appSettings)
        .values(row)
        .onDuplicateKeyUpdate({
          set: { value: row.value, updatedBy: row.updatedBy, updatedAt: row.updatedAt },
        }),
  });
  await runDialect(appDb, {
    sqlite: (db) =>
      db.insert(sqliteSchema.settingsAudit).values({
        id: auditId,
        entity: 'app_settings',
        entityId: row.key,
        field: 'value',
        oldValue: previous?.value ?? null,
        newValue: row.value,
        changedBy: row.updatedBy,
        changedAt: row.updatedAt,
      }),
    postgres: (db) =>
      db.insert(postgresSchema.settingsAudit).values({
        id: auditId,
        entity: 'app_settings',
        entityId: row.key,
        field: 'value',
        oldValue: previous?.value ?? null,
        newValue: row.value,
        changedBy: row.updatedBy,
        changedAt: row.updatedAt,
      }),
    mysql: (db) =>
      db.insert(mysqlSchema.settingsAudit).values({
        id: auditId,
        entity: 'app_settings',
        entityId: row.key,
        field: 'value',
        oldValue: previous?.value ?? null,
        newValue: row.value,
        changedBy: row.updatedBy,
        changedAt: row.updatedAt,
      }),
  });
}

export async function getAppSetting(appDb: AppDatabase, key: string): Promise<AppSettingRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (await db.select().from(sqliteSchema.appSettings).where(eq(sqliteSchema.appSettings.key, key)))[0],
    postgres: async (db) =>
      (await db.select().from(postgresSchema.appSettings).where(eq(postgresSchema.appSettings.key, key)))[0],
    mysql: async (db) =>
      (await db.select().from(mysqlSchema.appSettings).where(eq(mysqlSchema.appSettings.key, key)))[0],
  });
}

export interface SettingsAuditRow {
  readonly id: string;
  readonly entity: string;
  readonly entityId: string;
  readonly field: string;
  readonly oldValue: string | null;
  readonly newValue: string | null;
  readonly changedBy: string;
  readonly changedAt: number;
}

export async function listSettingsAudit(
  appDb: AppDatabase,
  entity: string,
  entityId: string,
): Promise<SettingsAuditRow[]> {
  return withDialect(appDb, {
    sqlite: (db) =>
      db
        .select()
        .from(sqliteSchema.settingsAudit)
        .where(
          and(
            eq(sqliteSchema.settingsAudit.entity, entity),
            eq(sqliteSchema.settingsAudit.entityId, entityId),
          ),
        )
        .orderBy(desc(sqliteSchema.settingsAudit.changedAt)),
    postgres: (db) =>
      db
        .select()
        .from(postgresSchema.settingsAudit)
        .where(
          and(
            eq(postgresSchema.settingsAudit.entity, entity),
            eq(postgresSchema.settingsAudit.entityId, entityId),
          ),
        )
        .orderBy(desc(postgresSchema.settingsAudit.changedAt)),
    mysql: (db) =>
      db
        .select()
        .from(mysqlSchema.settingsAudit)
        .where(
          and(eq(mysqlSchema.settingsAudit.entity, entity), eq(mysqlSchema.settingsAudit.entityId, entityId)),
        )
        .orderBy(desc(mysqlSchema.settingsAudit.changedAt)),
  });
}
