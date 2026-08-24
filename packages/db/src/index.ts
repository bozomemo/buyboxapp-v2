/**
 * packages/db — Drizzle schema, migrations, repositories (docs/05, doc 10 §7).
 */
export * as sqliteSchema from './schema/sqlite.js';
export * as postgresSchema from './schema/postgres.js';
export * as mysqlSchema from './schema/mysql.js';

export type { Dialect } from './dialect.js';
export { appDataDir, inferDialect, isRelativeSqlitePath, sqliteFilePath } from './dialect.js';

export type { AppDatabase } from './client.js';
export { createDb } from './client.js';

export type { AutoMigrateOptions, AutoMigrateResult, SchemaDrift, SchemaVersionStatus } from './migrate.js';
export {
  autoMigrate,
  backupSqliteDatabase,
  checkSchemaVersion,
  defaultMigrationsFolder,
  runMigrations,
} from './migrate.js';

export type { DialectBranches, MysqlDb, PostgresDb, SqliteDb } from './with-dialect.js';
export { withDialect } from './with-dialect.js';

export { newId } from './id.js';

export type { RetentionWindows } from './prune-history.js';
export { DEFAULT_RETENTION_WINDOWS, pruneHistory } from './prune-history.js';

export * as configRepo from './repositories/config.js';
export * as stockRepo from './repositories/stock.js';
export * as listingsRepo from './repositories/listings.js';
export * as competitionRepo from './repositories/competition.js';
export * as competitorSellersRepo from './repositories/competitor-sellers.js';
export * as competitorReportsRepo from './repositories/competitor-reports.js';
export * as alertsRepo from './repositories/alerts.js';
export * as repricingRepo from './repositories/repricing.js';
export * as jobsRepo from './repositories/jobs.js';
export * as eventsRepo from './repositories/events.js';
export * as circuitBreakerRepo from './repositories/circuit-breaker.js';
