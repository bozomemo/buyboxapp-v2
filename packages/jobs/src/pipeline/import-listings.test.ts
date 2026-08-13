/**
 * Run through the `Scheduler`/`JobRunner` path (not the handler directly) — that's what
 * makes `job_run_id` a real, FK-valid row for every `app_events` write the handler makes,
 * exactly as in production.
 */
import type { ListingSnapshot } from '@buybox/adapters';
import { listingsRepo, stockRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock.js';
import { Scheduler } from '../scheduler.js';
import { createFakeAdapter, createSqliteTestDb, NOW, seedMarketplace } from '../test-helpers.js';
import { IMPORT_LISTINGS_JOB, importListings } from './import-listings.js';

/** `listings.base_stock_code` FKs to `stock_items` (doc 05 §4) — seed the stock item first. */
async function seedStockItem(
  appDb: Awaited<ReturnType<typeof createSqliteTestDb>>['appDb'],
  baseStockCode: string,
): Promise<void> {
  await stockRepo.upsertStockItem(appDb, {
    baseStockCode,
    name: `Stock ${baseStockCode}`,
    unitCost: 500n,
    unitStock: 20,
    sourceCode: 'manual',
    sourceRef: null,
    costUpdatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function snapshot(marketplaceListingId: string, sellerStockCode: string): ListingSnapshot {
  return {
    marketplaceListingId,
    sellerStockCode,
    productName: `Product ${marketplaceListingId}`,
    price: Money.fromKurus(1000n),
    listPrice: null,
    customerPrice: null,
    offeredStock: 5,
    commissionRate: 15,
    vatRate: 20,
    dispatchTime: null,
    isSalable: true,
    isLocked: false,
    isSuspended: false,
    isArchived: false,
    isBlacklisted: false,
    lockReasons: [],
    deactivationReasons: [],
  };
}

describe('importListings', () => {
  async function run(
    appDb: Awaited<ReturnType<typeof createSqliteTestDb>>['appDb'],
    clock: FakeClock,
    adapter: ReturnType<typeof createFakeAdapter>,
  ) {
    const scheduler = new Scheduler({
      appDb,
      clock,
      adapters: new Map([['trendyol', adapter]]),
      instanceId: 'test',
    });
    scheduler.register({ jobName: IMPORT_LISTINGS_JOB, handler: importListings });
    await scheduler.enqueueNow(IMPORT_LISTINGS_JOB, JSON.stringify({ marketplaceCode: 'trendyol' }));
    return scheduler.tick();
  }

  it('idempotent upsert: re-importing the same listing updates price without duplicating rows', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      await seedStockItem(appDb, 'SKU1');
      const clock = new FakeClock(1000);
      const adapter = createFakeAdapter({
        async *fetchListings() {
          yield snapshot('barcode-1', 'SKU1');
        },
      });

      await run(appDb, clock, adapter);
      const first = await listingsRepo.findListingByMarketplaceId(appDb, 'trendyol', 'barcode-1');
      expect(first).toBeDefined();

      clock.advance(1000);
      adapter.fetchListings = async function* () {
        yield { ...snapshot('barcode-1', 'SKU1'), price: Money.fromKurus(2000n) };
      };
      await run(appDb, clock, adapter);

      const second = await listingsRepo.findListingByMarketplaceId(appDb, 'trendyol', 'barcode-1');
      expect(second?.id).toBe(first?.id); // same row, not a duplicate
      expect(second?.price).toBe(2000n);
    } finally {
      cleanup();
    }
  });

  it('a partial-failure mid-stream leaves no listing wrongly marked inactive (doc 12 Phase 5.3 DoD)', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      await seedStockItem(appDb, 'SKU1');
      const clock = new FakeClock(1000);

      const goodAdapter = createFakeAdapter({
        async *fetchListings() {
          yield snapshot('barcode-1', 'SKU1');
        },
      });
      await run(appDb, clock, goodAdapter);
      const beforePartialFailure = await listingsRepo.findListingByMarketplaceId(
        appDb,
        'trendyol',
        'barcode-1',
      );
      expect(beforePartialFailure?.isArchived).toBe(false);

      // Simulates a transport failure partway through the page stream.
      clock.advance(60_000);
      const failingAdapter = createFakeAdapter({
        // eslint-disable-next-line require-yield -- intentionally throws before yielding
        async *fetchListings() {
          throw new Error('transport failure mid-stream');
        },
      });
      const tick = await run(appDb, clock, failingAdapter);
      expect(tick.ran).toEqual([{ jobName: IMPORT_LISTINGS_JOB, ok: false }]);

      const afterPartialFailure = await listingsRepo.findListingByMarketplaceId(
        appDb,
        'trendyol',
        'barcode-1',
      );
      expect(afterPartialFailure?.isArchived).toBe(false); // never swept — the run wasn't fully successful
    } finally {
      cleanup();
    }
  });

  it('a fully successful import sweeps a listing that has genuinely disappeared', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      await seedStockItem(appDb, 'SKU1');
      const clock = new FakeClock(1000);
      const adapter = createFakeAdapter({
        async *fetchListings() {
          yield snapshot('barcode-1', 'SKU1');
        },
      });
      await run(appDb, clock, adapter);

      clock.advance(60_000);
      const emptyAdapter = createFakeAdapter({
        async *fetchListings() {
          // barcode-1 no longer returned by the marketplace at all
        },
      });
      await run(appDb, clock, emptyAdapter);

      const swept = await listingsRepo.findListingByMarketplaceId(appDb, 'trendyol', 'barcode-1');
      expect(swept?.isArchived).toBe(true);
    } finally {
      cleanup();
    }
  });
});
