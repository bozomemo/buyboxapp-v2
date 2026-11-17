/**
 * Band violations (doc 17 §5) across all three dialects: money is a sortable text encoding on
 * SQLite and a native `bigint` elsewhere, and the open → confirm → resolve cycle is what every
 * reader of this table relies on.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as bandViolationsRepo from './band-violations.js';
import * as brandProductsRepo from './brand-products.js';
import * as configRepo from './config.js';
import * as notificationDeliveriesRepo from './notification-deliveries.js';
import * as trackedProductsRepo from './tracked-products.js';

const NOW = Date.UTC(2026, 10, 12);
const ALI = { sellerRef: '1', sellerName: 'Ali' };

async function seed(appDb: AppDatabase): Promise<{ productId: string; cardId: string; trackedId: string }> {
  await configRepo.upsertMarketplace(appDb, {
    code: 'TY',
    displayName: 'Trendyol',
    enabled: true,
    merchantRef: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const trackedId = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id: trackedId,
    marketplaceCode: 'TY',
    productRef: '111',
    productUrl: '/urun-p-111',
    label: 'Kart 111',
    isActive: true,
    addedAt: NOW,
  });
  const productId = newId();
  await brandProductsRepo.insertBrandProduct(appDb, {
    id: productId,
    name: 'Ton Balıklı 85g',
    referencePrice: 100_00n,
    minPrice: 80_00n,
    maxPrice: null,
    barcode: null,
    source: 'manual',
    referencePriceSource: null,
    unitPrice: null,
    desi: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const cardId = newId();
  const linked = await brandProductsRepo.linkCard(appDb, {
    id: cardId,
    brandProductId: productId,
    trackedProductId: trackedId,
    unitMultiplier: 3,
    isPrimary: true,
    linkSource: 'manual',
    linkedAt: NOW,
  });
  expect(linked.ok).toBe(true);
  return { productId, cardId, trackedId };
}

for (const dialect of ALL_DIALECTS) {
  describe(`band violations (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('opens, confirms, resolves; reads back money exactly', async () => {
      db = await createTestDb(dialect);
      const { productId, trackedId } = await seed(db.appDb);

      const opened = await bandViolationsRepo.applyBandPlan(db.appDb, {
        trackedProductId: trackedId,
        brandProductId: productId,
        unitMultiplier: 3,
        snapshot: '[]',
        nowMs: NOW,
        plan: {
          open: [{ kind: 'belowMin', ...ALI, thresholdApplied: 240_00n, observedPrice: 239_99n, priceSource: 'price' }],
          confirm: [],
          resolve: [],
        },
      });
      expect(opened).toHaveLength(1);
      expect(await bandViolationsRepo.countOpenBandViolations(db.appDb)).toBe(1);

      const open = await bandViolationsRepo.openViolationsForCard(db.appDb, trackedId);
      expect(open).toEqual([{ id: opened[0]!.id, kind: 'belowMin', ...ALI, brandProductId: productId }]);

      await bandViolationsRepo.applyBandPlan(db.appDb, {
        trackedProductId: trackedId,
        brandProductId: productId,
        unitMultiplier: 3,
        snapshot: '[]',
        nowMs: NOW + 1000,
        plan: {
          open: [],
          confirm: [{ id: opened[0]!.id, observedPrice: 200_00n, priceSource: 'finalPrice' }],
          resolve: [],
        },
      });
      const [listed] = await bandViolationsRepo.queryBandViolations(db.appDb, { state: 'open' });
      expect(listed).toMatchObject({
        brandProductName: 'Ton Balıklı 85g',
        cardLabel: 'Kart 111',
        marketplaceCode: 'TY',
        thresholdApplied: 240_00n,
        observedPrice: 200_00n,
        priceSource: 'finalPrice',
        firstSeenAt: NOW,
        lastSeenAt: NOW + 1000,
        unitMultiplier: 3,
      });

      const forCards = await bandViolationsRepo.openViolationsForCards(db.appDb, [trackedId, 'none']);
      expect(forCards.get(trackedId)).toEqual([{ kind: 'belowMin', firstSeenAt: NOW }]);
      expect(forCards.has('none')).toBe(false);

      await bandViolationsRepo.applyBandPlan(db.appDb, {
        trackedProductId: trackedId,
        brandProductId: productId,
        unitMultiplier: 3,
        snapshot: '[]',
        nowMs: NOW + 2000,
        plan: { open: [], confirm: [], resolve: [{ id: opened[0]!.id, resolution: 'inBand' }] },
      });
      expect(await bandViolationsRepo.countOpenBandViolations(db.appDb)).toBe(0);
      const resolved = await bandViolationsRepo.queryBandViolations(db.appDb, {
        state: 'resolved',
        resolvedSinceMs: NOW,
      });
      expect(resolved).toHaveLength(1);
      expect(resolved[0]).toMatchObject({ resolution: 'inBand', resolvedAt: NOW + 2000 });
      expect(
        await bandViolationsRepo.queryBandViolations(db.appDb, { state: 'resolved', resolvedSinceMs: NOW + 3000 }),
      ).toHaveLength(0);
    });

    it('unlinking a card resolves its open violations as unlinked', async () => {
      db = await createTestDb(dialect);
      const { productId, cardId, trackedId } = await seed(db.appDb);
      await bandViolationsRepo.applyBandPlan(db.appDb, {
        trackedProductId: trackedId,
        brandProductId: productId,
        unitMultiplier: 3,
        snapshot: '[]',
        nowMs: NOW,
        plan: {
          open: [{ kind: 'aboveMax', ...ALI, thresholdApplied: 300_00n, observedPrice: 310_00n, priceSource: 'price' }],
          confirm: [],
          resolve: [],
        },
      });

      await brandProductsRepo.unlinkCard(db.appDb, cardId, NOW + 5);

      expect(await bandViolationsRepo.countOpenBandViolations(db.appDb)).toBe(0);
      const [row] = await bandViolationsRepo.queryBandViolations(db.appDb, { state: 'resolved' });
      expect(row).toMatchObject({ resolution: 'unlinked', resolvedAt: NOW + 5 });
    });

    it('deleting the brand product deletes its violations', async () => {
      db = await createTestDb(dialect);
      const { productId, trackedId } = await seed(db.appDb);
      await bandViolationsRepo.applyBandPlan(db.appDb, {
        trackedProductId: trackedId,
        brandProductId: productId,
        unitMultiplier: 3,
        snapshot: '[]',
        nowMs: NOW,
        plan: {
          open: [{ kind: 'aboveMax', ...ALI, thresholdApplied: 300_00n, observedPrice: 310_00n, priceSource: 'price' }],
          confirm: [],
          resolve: [],
        },
      });
      await brandProductsRepo.deleteBrandProduct(db.appDb, productId);
      expect(await bandViolationsRepo.countOpenBandViolations(db.appDb)).toBe(0);
      expect(await bandViolationsRepo.queryBandViolations(db.appDb, { state: 'resolved' })).toHaveLength(0);
    });

    // Retention (doc 05 §10, build plan 11.8): an open row is never pruned however old, a
    // resolved one goes by `resolved_at`, and deliveries go by `created_at` in any state.
    it('pruning keeps every open violation and drops only resolved rows past the cutoff', async () => {
      db = await createTestDb(dialect);
      const { productId, trackedId } = await seed(db.appDb);
      const open = (kind: 'belowMin' | 'aboveMax', nowMs: number) =>
        bandViolationsRepo.applyBandPlan(db!.appDb, {
          trackedProductId: trackedId,
          brandProductId: productId,
          unitMultiplier: 3,
          snapshot: '[]',
          nowMs,
          plan: {
            open: [{ kind, ...ALI, thresholdApplied: 240_00n, observedPrice: 239_99n, priceSource: 'price' }],
            confirm: [],
            resolve: [],
          },
        });
      const resolve = (id: string, nowMs: number) =>
        bandViolationsRepo.applyBandPlan(db!.appDb, {
          trackedProductId: trackedId,
          brandProductId: productId,
          unitMultiplier: 3,
          snapshot: '[]',
          nowMs,
          plan: { open: [], confirm: [], resolve: [{ id, resolution: 'inBand' }] },
        });

      // Opened long ago, resolved recently: kept. Opened and resolved long ago: pruned.
      const [longRunning] = await open('belowMin', NOW - 500);
      await resolve(longRunning!.id, NOW - 10);
      const [stale] = await open('belowMin', NOW - 400);
      await resolve(stale!.id, NOW - 300);
      // Still open, older than any cutoff: kept.
      const [stillOpen] = await open('aboveMax', NOW - 1000);

      await bandViolationsRepo.pruneResolvedBandViolations(db.appDb, NOW - 100);

      const resolvedIds = (await bandViolationsRepo.queryBandViolations(db.appDb, { state: 'resolved' })).map((r) => r.id);
      expect(resolvedIds).toEqual([longRunning!.id]);
      const openIds = (await bandViolationsRepo.queryBandViolations(db.appDb, { state: 'open' })).map((r) => r.id);
      expect(openIds).toEqual([stillOpen!.id]);
    });

    it('pruning deliveries goes by created_at, whatever the state', async () => {
      db = await createTestDb(dialect);
      const row = (id: string, state: notificationDeliveriesRepo.DeliveryState, createdAt: number) => ({
        id,
        subjectType: 'bandViolation' as const,
        subjectId: 'v1',
        channel: 'email' as const,
        state,
        attempts: 0,
        lastError: null,
        createdAt,
        sentAt: null,
      });
      await notificationDeliveriesRepo.enqueueDeliveries(db.appDb, [
        row('old-pending', 'pending', NOW - 300),
        row('old-sent', 'sent', NOW - 200),
        row('new', 'pending', NOW - 10),
      ]);
      await notificationDeliveriesRepo.pruneNotificationDeliveries(db.appDb, NOW - 100);
      const left = await notificationDeliveriesRepo.deliveriesForSubjects(db.appDb, 'bandViolation', ['v1']);
      expect((left.get('v1') ?? []).map((d) => d.id)).toEqual(['new']);
    });
  });
}
