/**
 * Migration 0026's data step (2026-11-08, tracked products seller filters): `tracked_product_sellers`
 * is backfilled once from the offer rows already in `tracked_product_observations`.
 *
 * Same shape as `psf-migration.test.ts`: the hand-written backfill is appended to Drizzle's
 * generated DDL once per dialect, so it is run for real on all three — migrate up to 0025 from a
 * copy of the folder with its journal cut short, seed observations, migrate the rest of the way.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from './client.js';
import { newId } from './id.js';
import { defaultMigrationsFolder, runMigrations } from './migrate.js';
import * as configRepo from './repositories/config.js';
import * as trackedProductsRepo from './repositories/tracked-products.js';
import type { TrackedProductObservationRow } from './repositories/tracked-products.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from './test-helpers.js';
import { withDialect } from './with-dialect.js';

const FIRST_MIGRATION_AFTER = 26;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1);

/** A copy of the dialect's migrations whose journal stops before 0026. */
function migrationsBefore0026(dialect: AppDatabase['dialect']): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'buybox-tps-migration-'));
  cpSync(defaultMigrationsFolder(dialect), dir, { recursive: true });
  const journalPath = path.join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx < FIRST_MIGRATION_AFTER);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

function observation(
  trackedProductId: string,
  observedAt: number,
  status: string,
  sellerRef: string | null,
): TrackedProductObservationRow {
  return {
    id: newId(),
    trackedProductId,
    observedAt,
    status: status as TrackedProductObservationRow['status'],
    rank: sellerRef === null ? null : 1,
    sellerName: sellerRef,
    sellerRef,
    price: null,
    finalPrice: null,
    offeredStock: null,
  };
}

/** Raw SQL, so the read does not depend on a repository function a later task adds. */
async function readSellers(appDb: AppDatabase): Promise<Record<string, unknown>[]> {
  const statement = sql`select tracked_product_id, seller_ref, first_seen_at, last_seen_at
    from tracked_product_sellers order by seller_ref`;
  const raw = await withDialect<Record<string, unknown>[]>(appDb, {
    sqlite: (db) => db.all<Record<string, unknown>>(statement),
    postgres: async (db) => (await db.execute(statement)).rows as Record<string, unknown>[],
    mysql: async (db) => (await db.execute(statement))[0] as unknown as Record<string, unknown>[],
  });
  return raw.map((row) => ({
    trackedProductId: row.tracked_product_id,
    sellerRef: row.seller_ref,
    firstSeenAt: Number(row.first_seen_at),
    lastSeenAt: Number(row.last_seen_at),
  }));
}

for (const dialect of ALL_DIALECTS) {
  describe(`migration 0026: tracked_product_sellers backfill (${dialect})`, () => {
    let db: TestDb | undefined;
    let folder: string | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
      if (folder) rmSync(folder, { recursive: true, force: true });
      folder = undefined;
    }, 30_000);

    it('fills one row per product and seller from ok observations, first and last seen', async () => {
      folder = migrationsBefore0026(dialect);
      db = await createTestDb(dialect, folder);
      await configRepo.upsertMarketplace(db.appDb, {
        code: 'TY',
        displayName: 'Trendyol',
        enabled: true,
        merchantRef: null,
        createdAt: T0,
        updatedAt: T0,
      });
      const p = newId();
      await trackedProductsRepo.addTrackedProduct(db.appDb, {
        id: p,
        marketplaceCode: 'TY',
        productRef: '1',
        productUrl: '/p-1',
        label: 'Ürün 1',
        isActive: true,
        addedAt: T0,
      });
      await trackedProductsRepo.insertTrackedProductObservations(db.appDb, [
        observation(p, T0, 'ok', 'S1'),
        observation(p, T0 + 5 * DAY, 'ok', 'S1'),
        observation(p, T0 + 2 * DAY, 'ok', 'S2'),
        observation(p, T0 + 3 * DAY, 'noOffers', null),
        observation(p, T0 + 4 * DAY, 'fetchFailed', 'S3'),
        observation(p, T0 + 6 * DAY, 'ok', null),
      ]);

      await runMigrations(db.appDb);
      // Spec §7: idempotent — a second run (the boot-time auto-migrate) changes nothing.
      await runMigrations(db.appDb);

      expect(await readSellers(db.appDb)).toEqual([
        { trackedProductId: p, sellerRef: 'S1', firstSeenAt: T0, lastSeenAt: T0 + 5 * DAY },
        { trackedProductId: p, sellerRef: 'S2', firstSeenAt: T0 + 2 * DAY, lastSeenAt: T0 + 2 * DAY },
      ]);
    }, 60_000);
  });
}
