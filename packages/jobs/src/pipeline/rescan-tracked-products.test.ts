/**
 * `RescanTrackedProducts` (doc 06 §12.2) — the operator asking for named rows to be re-read now.
 *
 * The behaviour worth pinning down is not "it fetches", it is *which* rows it fetches and what
 * it refuses to touch: exactly the selection, nothing else in the catalogue, regardless of the
 * pause flag, and never a row belonging to the other marketplace.
 */
import {
  CompetitorSourceError,
  type CompetitorOffer,
  type CompetitorPageSnapshot,
  type ICompetitorSource,
  type ProductPageRef,
} from '@buybox/adapters';
import { listingsRepo, trackedProductsRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from '../adapter-registry.js';
import { buildCompetitorSourceRegistry } from '../competitor-source-registry.js';
import { FakeClock } from '../clock.js';
import type { JobResult } from '../job.js';
import { Scheduler } from '../scheduler.js';
import {
  createFakeAdapter,
  createSqliteTestDb,
  NOW,
  seedMarketplace,
  type TestDb,
} from '../test-helpers.js';
import {
  RESCAN_MAX_PRODUCTS,
  RESCAN_TRACKED_PRODUCTS_JOB,
  RescanTrackedProductsPayloadSchema,
  rescanTrackedProducts,
} from './rescan-tracked-products.js';

let runCounter = 0;

function offer(overrides: Partial<CompetitorOffer> = {}): CompetitorOffer {
  return {
    rank: 1,
    sellerRef: 'seller-a',
    sellerName: 'Satıcı A',
    sellerRating: 9.2,
    listingRef: 'listing-a',
    price: Money.fromKurus(120_00n),
    finalPrice: Money.fromKurus(120_00n),
    offeredStock: 5,
    isWinner: true,
    promotionText: null,
    dispatchTime: null,
    ...overrides,
  };
}

/** A controllable `ICompetitorSource` double — never a network call (doc 10 §10). */
function fakeSource(behaviour: (ref: ProductPageRef) => CompetitorOffer[] | Error): {
  source: ICompetitorSource;
  calls: ProductPageRef[];
} {
  const calls: ProductPageRef[] = [];
  const source: ICompetitorSource = {
    code: 'trendyol',
    async fetchProductOffers(ref) {
      calls.push(ref);
      const result = behaviour(ref);
      if (result instanceof Error) throw result;
      const snapshot: CompetitorPageSnapshot = {
        marketplaceCode: 'trendyol',
        productRef: ref,
        fetchedUrl: 'https://www.trendyol.com/x-p-1',
        observedAt: new Date(NOW),
        offers: result,
        diagnostics: {
          extractionMethod: 'embeddedJson',
          parserVersion: 'test',
          stateFound: true,
          productFound: true,
          merchantListingFound: true,
          winnerMerchantFound: true,
          winnerVariantFound: true,
          otherMerchantCount: Math.max(0, result.length - 1),
          merchantCount: new Set(result.map((o) => o.sellerRef)).size,
        },
      };
      return snapshot;
    },
  };
  return { source, calls };
}

describe('RescanTrackedProducts', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createSqliteTestDb();
    await seedMarketplace(db.appDb);
  });

  afterEach(() => db.cleanup());

  async function seedTracked(
    id: string,
    overrides: { isActive?: boolean; marketplaceCode?: string } = {},
  ): Promise<void> {
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id,
      marketplaceCode: overrides.marketplaceCode ?? 'trendyol',
      productRef: id,
      productUrl: `https://www.trendyol.com/x-p-${id}`,
      label: id,
      isActive: overrides.isActive ?? true,
      addedAt: NOW,
    });
  }

  async function run(source: ICompetitorSource, payload: Record<string, unknown>): Promise<JobResult> {
    const scheduler = new Scheduler({
      appDb: db.appDb,
      clock: new FakeClock(NOW),
      adapters: buildAdapterRegistry([['trendyol', createFakeAdapter()]]),
      competitorSources: buildCompetitorSourceRegistry([['trendyol', source]]),
      instanceId: `rescan-${runCounter++}`,
    });
    let result: JobResult = { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
    scheduler.register({
      jobName: RESCAN_TRACKED_PRODUCTS_JOB,
      handler: async (ctx) => {
        result = await rescanTrackedProducts(ctx);
        return result;
      },
    });
    await scheduler.enqueueNow(
      RESCAN_TRACKED_PRODUCTS_JOB,
      JSON.stringify({ marketplaceCode: 'trendyol', ...payload }),
    );
    await scheduler.tick();
    await scheduler.shutdown();
    return result;
  }

  it('reads exactly the selected products and leaves the rest of the catalogue alone', async () => {
    await seedTracked('t-a');
    await seedTracked('t-b');
    await seedTracked('t-c');
    const { source, calls } = fakeSource(() => [offer()]);

    const result = await run(source, { trackedProductIds: ['t-a', 't-c'] });

    expect(result).toMatchObject({ itemsTotal: 2, itemsOk: 2, itemsFailed: 0 });
    expect(calls.map((c) => c.contentId)).toEqual(['t-a', 't-c']);
    expect(await trackedProductsRepo.latestTrackedProductObservations(db.appDb, 't-b')).toHaveLength(0);
  });

  it('stores the look the same way the cadence path does, and creates no listing', async () => {
    await seedTracked('t-a');
    const { source } = fakeSource(() => [offer({ price: Money.fromKurus(99_00n) })]);

    await run(source, { trackedProductIds: ['t-a'] });

    const obs = await trackedProductsRepo.latestTrackedProductObservations(db.appDb, 't-a');
    expect(obs).toHaveLength(1);
    expect(obs[0]?.status).toBe('ok');
    expect(obs[0]?.price).toBe(99_00n);
    // Reporting only: re-reading a tracked product cannot reach the pricing path, because there
    // is no listing row for `Reprice`/`ObserveBuybox` to find.
    expect((await listingsRepo.queryListings(db.appDb, { limit: 10, offset: 0 })).total).toBe(0);
  });

  /**
   * A paused product is one the *cadence* should skip. An operator who ticked that exact row and
   * pressed the button has said something more specific than the flag does — see the `onlyIds`
   * doc comment in `scrape-tracked-products.ts`.
   */
  it('reads a paused product when it was explicitly selected', async () => {
    await seedTracked('t-paused', { isActive: false });
    const { source, calls } = fakeSource(() => [offer()]);

    const result = await run(source, { trackedProductIds: ['t-paused'] });

    expect(calls).toHaveLength(1);
    expect(result.itemsOk).toBe(1);
  });

  it('ignores an id belonging to another marketplace, or one that has been removed', async () => {
    await seedMarketplace(db.appDb, 'hepsiburada');
    await seedTracked('t-hb', { marketplaceCode: 'hepsiburada' });
    const { source, calls } = fakeSource(() => [offer()]);

    const result = await run(source, { trackedProductIds: ['t-hb', 'gone'] });

    expect(calls).toHaveLength(0);
    expect(result).toMatchObject({ itemsTotal: 0, itemsOk: 0, itemsFailed: 0 });
  });

  it('records a failure without failing the run', async () => {
    await seedTracked('t-a');
    const { source } = fakeSource(() => new CompetitorSourceError('boom', 'fetchFailed'));

    const result = await run(source, { trackedProductIds: ['t-a'] });

    expect(result).toMatchObject({ itemsOk: 0, itemsFailed: 1 });
    expect(result.error).toBeUndefined();
    const obs = await trackedProductsRepo.latestTrackedProductObservations(db.appDb, 't-a');
    expect(obs[0]?.status).toBe('fetchFailed');
  });

  it('a deployment with no competitor source reports why rather than failing', async () => {
    await seedTracked('t-a');
    const scheduler = new Scheduler({
      appDb: db.appDb,
      clock: new FakeClock(NOW),
      adapters: buildAdapterRegistry([['trendyol', createFakeAdapter()]]),
      instanceId: `rescan-${runCounter++}`,
    });
    let result: JobResult = { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
    scheduler.register({
      jobName: RESCAN_TRACKED_PRODUCTS_JOB,
      handler: async (ctx) => {
        result = await rescanTrackedProducts(ctx);
        return result;
      },
    });
    await scheduler.enqueueNow(
      RESCAN_TRACKED_PRODUCTS_JOB,
      JSON.stringify({ marketplaceCode: 'trendyol', trackedProductIds: ['t-a'] }),
    );
    await scheduler.tick();
    await scheduler.shutdown();

    expect(result.error).toContain('no competitor source');
    expect(await trackedProductsRepo.latestTrackedProductObservations(db.appDb, 't-a')).toHaveLength(0);
  });

  describe('payload', () => {
    it('refuses an empty selection — a rescan of nothing is not a run', () => {
      const parsed = RescanTrackedProductsPayloadSchema.safeParse({
        marketplaceCode: 'trendyol',
        trackedProductIds: [],
      });
      expect(parsed.success).toBe(false);
    });

    it('refuses a selection past the ceiling rather than reading part of it', () => {
      const ids = Array.from({ length: RESCAN_MAX_PRODUCTS + 1 }, (_, i) => `t-${i}`);
      const parsed = RescanTrackedProductsPayloadSchema.safeParse({
        marketplaceCode: 'trendyol',
        trackedProductIds: ids,
      });
      expect(parsed.success).toBe(false);
    });
  });
});
