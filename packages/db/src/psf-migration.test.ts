/**
 * Migration 0022's data step (doc 17 §2.5): every tracked product carrying the old per-card
 * `reference_price` becomes a brand product of its own, linked to it as the ×1 primary.
 *
 * The data step is hand-written SQL appended to Drizzle's generated DDL, once per dialect, so it
 * is run for real on all three: the database is migrated up to 0021 from a copy of the folder
 * with its journal cut short, seeded with the old column, and then migrated the rest of the way.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from './client.js';
import { defaultMigrationsFolder, runMigrations } from './migrate.js';
import * as brandProductsRepo from './repositories/brand-products.js';
import * as configRepo from './repositories/config.js';
import { encodeSortableBigint } from './sortable-bigint.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from './test-helpers.js';
import { runDialect } from './with-dialect.js';

const FIRST_MIGRATION_AFTER = 22;
const ADDED_AT = Date.UTC(2026, 7, 1);
const PRICED_AT = Date.UTC(2026, 8, 3);

/** A copy of the dialect's migrations whose journal stops before 0022. */
function migrationsBefore0022(dialect: AppDatabase['dialect']): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'buybox-psf-migration-'));
  cpSync(defaultMigrationsFolder(dialect), dir, { recursive: true });
  const journalPath = path.join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx < FIRST_MIGRATION_AFTER);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

/** Raw SQL, because the Drizzle schema already has columns the pre-0022 table does not. */
async function seedOldRow(
  appDb: AppDatabase,
  row: { id: string; ref: string; label: string; price: bigint | null; source: string | null },
): Promise<void> {
  const price =
    row.price === null
      ? null
      : appDb.dialect === 'sqlite'
        ? encodeSortableBigint(row.price)
        : row.price.toString();
  const statement = sql`insert into tracked_products
    (id, marketplace_code, product_ref, product_url, label, is_active, added_at,
     reference_price, reference_price_source, reference_price_updated_at)
    values (${row.id}, 'TY', ${row.ref}, ${`/x-p-${row.ref}`}, ${row.label}, ${appDb.dialect === 'postgres' ? sql`true` : sql`1`},
     ${ADDED_AT}, ${price}, ${row.source}, ${row.price === null ? null : PRICED_AT})`;
  await runDialect(appDb, {
    sqlite: (db) => db.run(statement),
    postgres: (db) => db.execute(statement),
    mysql: (db) => db.execute(statement),
  });
}

for (const dialect of ALL_DIALECTS) {
  describe(`migration 0022: PSF moves to brand products (${dialect})`, () => {
    let db: TestDb | undefined;
    let folder: string | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
      if (folder) rmSync(folder, { recursive: true, force: true });
      folder = undefined;
    }, 30_000);

    it('turns each priced card into its own ×1 primary brand product and leaves the rest alone', async () => {
      folder = migrationsBefore0022(dialect);
      db = await createTestDb(dialect, folder);
      await configRepo.upsertMarketplace(db.appDb, {
        code: 'TY',
        displayName: 'Trendyol',
        enabled: true,
        merchantRef: null,
        createdAt: ADDED_AT,
        updatedAt: ADDED_AT,
      });
      await seedOldRow(db.appDb, {
        id: 'priced',
        ref: '1',
        label: 'Whiskas Ton 85g',
        price: 1_249_90n,
        source: 'mars.csv',
      });
      await seedOldRow(db.appDb, { id: 'unpriced', ref: '2', label: 'Başka', price: null, source: null });

      await runMigrations(db.appDb);

      expect(await brandProductsRepo.getBrandProduct(db.appDb, 'priced')).toEqual({
        id: 'priced',
        name: 'Whiskas Ton 85g',
        referencePrice: 1_249_90n,
        minPrice: null,
        maxPrice: null,
        barcode: null,
        source: 'migration',
        referencePriceSource: 'mars.csv',
        createdAt: PRICED_AT,
        updatedAt: PRICED_AT,
      });
      expect(await brandProductsRepo.listBrandProductCards(db.appDb, 'priced')).toEqual([
        {
          id: 'priced',
          brandProductId: 'priced',
          trackedProductId: 'priced',
          marketplaceCode: 'TY',
          unitMultiplier: 1,
          isPrimary: true,
          linkSource: 'migration',
          linkedAt: PRICED_AT,
        },
      ]);
      expect(await brandProductsRepo.getBrandProduct(db.appDb, 'unpriced')).toBeUndefined();
      expect(await brandProductsRepo.cardLinksForTrackedProducts(db.appDb, ['unpriced'])).toEqual(new Map());
    }, 60_000);
  });
}
