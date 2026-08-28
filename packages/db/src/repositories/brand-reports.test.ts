/**
 * Brand-side seller and product aggregation (doc 06 §12.4, Faz 4).
 *
 * Run across all three dialects, and not as a formality. Three things in `brand-reports.ts` are
 * genuinely per-engine and a single-dialect run would prove nothing about the others: money is
 * zero-padded sortable *text* on SQLite and a native 64-bit integer on PostgreSQL and MySQL, so
 * the deviation arithmetic has to decode on one engine and not the others; the per-look
 * baseline is a derived table joined three ways; and `avg`/`count` come back as strings from
 * some drivers and numbers from others.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as brandReportsRepo from './brand-reports.js';
import * as configRepo from './config.js';
import * as trackedProductsRepo from './tracked-products.js';
import * as watchedBrandsRepo from './watched-brands.js';

const NOW = Date.UTC(2026, 7, 20);
const DAY = 24 * 60 * 60 * 1000;
const MARKETPLACE = 'TY';
const WINDOW = { sinceMs: NOW - 30 * DAY, untilMs: NOW + DAY };

/** Kuruş. `4990` is ₺49,90 — the figures below are chosen so the percentages come out round. */
const lira = (major: number): bigint => BigInt(Math.round(major * 100));

interface Fixture {
  readonly groupId: string;
  readonly brandId: string;
  readonly otherBrandId: string;
  readonly productIds: string[];
}

async function seed(appDb: AppDatabase): Promise<Fixture> {
  await configRepo.upsertMarketplace(appDb, {
    code: MARKETPLACE,
    displayName: 'Trendyol',
    enabled: true,
    merchantRef: 'merchant-1',
    createdAt: NOW,
    updatedAt: NOW,
  });
  const groupId = newId();
  await watchedBrandsRepo.createWatchedBrandGroup(appDb, {
    id: groupId,
    name: 'Mars',
    note: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const brandId = newId();
  const otherBrandId = newId();
  for (const [id, label] of [
    [brandId, 'Whiskas'],
    [otherBrandId, 'Royal Canin'],
  ] as const) {
    await watchedBrandsRepo.createWatchedBrand(appDb, {
      id,
      groupId,
      marketplaceCode: MARKETPLACE,
      label,
      brandRef: null,
      searchTerm: label.toLowerCase(),
      isActive: true,
      lastSweptAt: null,
      lastSweepProductCount: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  return { groupId, brandId, otherBrandId, productIds: [] };
}

async function addProduct(
  appDb: AppDatabase,
  watchedBrandId: string,
  ref: string,
): Promise<string> {
  const id = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode: MARKETPLACE,
    productRef: ref,
    productUrl: `/p-${ref}`,
    label: `Ürün ${ref}`,
    isActive: true,
    addedAt: NOW,
    watchedBrandId,
  });
  return id;
}

/** One look: every offer on one product at one moment, `[sellerRef, priceMajor]` in rank order. */
async function look(
  appDb: AppDatabase,
  trackedProductId: string,
  observedAt: number,
  offers: readonly (readonly [string | null, number])[],
): Promise<void> {
  await trackedProductsRepo.insertTrackedProductObservations(
    appDb,
    offers.map(([sellerRef, price], index) => ({
      id: newId(),
      trackedProductId,
      observedAt,
      status: 'ok' as const,
      rank: index + 1,
      sellerName: sellerRef === null ? null : `Satıcı ${sellerRef}`,
      sellerRef,
      price: lira(price),
      finalPrice: lira(price),
      offeredStock: 10,
    })),
  );
}

function bySeller(rows: readonly brandReportsRepo.BrandSellerAggregateRow[], ref: string) {
  const row = rows.find((r) => r.sellerRef === ref);
  if (!row) throw new Error(`no aggregate row for seller ${ref}`);
  return row;
}

for (const dialect of ALL_DIALECTS) {
  describe(`brand reports (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    describe('trackedProductPeriodStats', () => {
      it('reports the band the product traded in across the window', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await look(db.appDb, productId, NOW - 2 * DAY, [
          ['a', 100],
          ['b', 120],
        ]);
        await look(db.appDb, productId, NOW - DAY, [
          ['a', 90],
          ['c', 150],
        ]);

        const stats = await brandReportsRepo.trackedProductPeriodStats(db.appDb, [productId], WINDOW);
        const row = stats.get(productId)!;
        expect(row.minPrice).toBe(lira(90));
        expect(row.maxPrice).toBe(lira(150));
        // Three distinct sellers across the window, though no single look showed three.
        expect(row.sellerCount).toBe(3);
        expect(row.changeCount).toBe(2);
        expect(row.firstSeenAt).toBe(NOW - 2 * DAY);
        expect(row.lastSeenAt).toBe(NOW - DAY);
      }, 30_000);

      it('leaves a product with no look out of the map entirely', async () => {
        // Absent, not a row of zeroes: "we have never seen a price" and "the price was 0" are
        // different, and a caller rendering a band needs to be able to tell them apart.
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        const stats = await brandReportsRepo.trackedProductPeriodStats(db.appDb, [productId], WINDOW);
        expect(stats.has(productId)).toBe(false);
      }, 30_000);

      it('ignores failed looks', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await look(db.appDb, productId, NOW - DAY, [['a', 100]]);
        await trackedProductsRepo.insertTrackedProductObservations(db.appDb, [
          {
            id: newId(),
            trackedProductId: productId,
            observedAt: NOW,
            status: 'fetchFailed',
            rank: null,
            sellerName: null,
            sellerRef: null,
            price: null,
            finalPrice: null,
            offeredStock: null,
          },
        ]);
        const row = (await brandReportsRepo.trackedProductPeriodStats(db.appDb, [productId], WINDOW)).get(
          productId,
        )!;
        expect(row.changeCount).toBe(1);
        expect(row.lastSeenAt).toBe(NOW - DAY);
      }, 30_000);

      it('honours the window bounds', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await look(db.appDb, productId, NOW - 90 * DAY, [['a', 10]]);
        await look(db.appDb, productId, NOW - DAY, [['a', 100]]);
        const row = (await brandReportsRepo.trackedProductPeriodStats(db.appDb, [productId], WINDOW)).get(
          productId,
        )!;
        expect(row.minPrice).toBe(lira(100));
      }, 30_000);

      it('returns an empty map for an empty id list without querying', async () => {
        db = await createTestDb(dialect);
        await seed(db.appDb);
        expect((await brandReportsRepo.trackedProductPeriodStats(db.appDb, [], WINDOW)).size).toBe(0);
      }, 30_000);
    });

    describe('brandSellerAggregatesInRange', () => {
      /**
       * Two products, two looks, deliberately asymmetric so every counter can be told apart:
       * `a` is cheapest twice but holds the buybox once, `b` holds the buybox without ever
       * being cheapest. A fixture where the two coincide would pass with the two counters
       * swapped.
       */
      async function seedMarket(appDb: AppDatabase, brandId: string): Promise<string[]> {
        const p1 = await addProduct(appDb, brandId, '2250165');
        const p2 = await addProduct(appDb, brandId, '2250166');
        // Look 1 on p1: mean 120. `a` is cheapest and top-ranked.
        await look(appDb, p1, NOW - 2 * DAY, [
          ['a', 90],
          ['b', 120],
          ['c', 150],
        ]);
        // Look 2 on p1: mean 120 again, but `b` now holds rank 1 while `a` is still cheapest.
        await look(appDb, p1, NOW - DAY, [
          ['b', 120],
          ['a', 90],
          ['c', 150],
        ]);
        // p2: a single look, `c` alone — a seller whose only market is one it does not share.
        await look(appDb, p2, NOW - DAY, [['c', 200]]);
        return [p1, p2];
      }

      it('separates who wins the buybox from who is cheapest', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        await seedMarket(db.appDb, brandId);

        const rows = await brandReportsRepo.brandSellerAggregatesInRange(db.appDb, WINDOW);
        const a = bySeller(rows, 'a');
        const b = bySeller(rows, 'b');

        expect(a.buyboxCount).toBe(1);
        expect(a.cheapestCount).toBe(2);
        expect(b.buyboxCount).toBe(1);
        expect(b.cheapestCount).toBe(0);
      }, 30_000);

      it('counts products, observations and the price band per seller', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        await seedMarket(db.appDb, brandId);

        const rows = await brandReportsRepo.brandSellerAggregatesInRange(db.appDb, WINDOW);
        const c = bySeller(rows, 'c');
        expect(c.productCount).toBe(2);
        expect(c.observationCount).toBe(3);
        expect(c.minPrice).toBe(lira(150));
        expect(c.maxPrice).toBe(lira(200));
        expect(c.firstSeenAt).toBe(NOW - 2 * DAY);
        expect(c.lastSeenAt).toBe(NOW - DAY);
        expect(c.observedName).toBe('Satıcı c');
      }, 30_000);

      it('orders by how much of the brand the seller covers', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        await seedMarket(db.appDb, brandId);
        const rows = await brandReportsRepo.brandSellerAggregatesInRange(db.appDb, WINDOW);
        expect(rows[0]!.sellerRef).toBe('c'); // the only seller on both products
      }, 30_000);

      it('measures deviation against the whole look, in percent, signed', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        await seedMarket(db.appDb, brandId);

        const rows = await brandReportsRepo.brandSellerAggregatesInRange(db.appDb, WINDOW);
        // Both p1 looks have mean 120: `a` at 90 is −25%, `b` at 120 is 0%.
        expect(bySeller(rows, 'a').avgDeviationPct).toBeCloseTo(-25, 6);
        expect(bySeller(rows, 'b').avgDeviationPct).toBeCloseTo(0, 6);
        // `c` is +25% twice on p1 and 0% on p2 (sole seller, so it *is* the mean) → +16.66…%
        expect(bySeller(rows, 'c').avgDeviationPct).toBeCloseTo(50 / 3, 6);
      }, 30_000);

      it('keeps the excluded seller in the market baseline it is excluded from', async () => {
        // The distinction the audit rests on. Excluding our own store must remove its *row*,
        // never its price — a market average computed without the biggest seller in it would
        // rate everyone else against a market that does not exist.
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        await seedMarket(db.appDb, brandId);

        const rows = await brandReportsRepo.brandSellerAggregatesInRange(db.appDb, {
          ...WINDOW,
          excludeSellers: [{ marketplaceCode: MARKETPLACE, sellerRef: 'c' }],
        });
        expect(rows.map((r) => r.sellerRef).sort()).toEqual(['a', 'b']);
        // Unchanged from the run above: the baseline still includes `c` at 150.
        expect(bySeller(rows, 'a').avgDeviationPct).toBeCloseTo(-25, 6);
      }, 30_000);

      it('scopes to the named brands, and to none for an empty list', async () => {
        db = await createTestDb(dialect);
        const { brandId, otherBrandId } = await seed(db.appDb);
        await seedMarket(db.appDb, brandId);
        const otherProduct = await addProduct(db.appDb, otherBrandId, '9999');
        await look(db.appDb, otherProduct, NOW - DAY, [['z', 500]]);

        const scoped = await brandReportsRepo.brandSellerAggregatesInRange(db.appDb, {
          ...WINDOW,
          watchedBrandIds: [brandId],
        });
        expect(scoped.map((r) => r.sellerRef)).not.toContain('z');

        const both = await brandReportsRepo.brandSellerAggregatesInRange(db.appDb, {
          ...WINDOW,
          watchedBrandIds: [brandId, otherBrandId],
        });
        expect(both.map((r) => r.sellerRef)).toContain('z');

        // An empty list is "no brand matched", not "no restriction" — the reading a caller that
        // expanded a group with no brands in it needs.
        const none = await brandReportsRepo.brandSellerAggregatesInRange(db.appDb, {
          ...WINDOW,
          watchedBrandIds: [],
        });
        expect(none).toEqual([]);
      }, 30_000);

      it('leaves unidentified offers out of every seller row, and counts them separately', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await look(db.appDb, productId, NOW - DAY, [
          ['a', 100],
          [null, 80],
        ]);

        const rows = await brandReportsRepo.brandSellerAggregatesInRange(db.appDb, WINDOW);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.sellerRef).toBe('a');
        // Still part of the market it could not be attributed to: mean of 100 and 80 is 90, so
        // `a` reads +11.1%, not 0%.
        expect(rows[0]!.avgDeviationPct).toBeCloseTo((100 - 90) / 90 * 100, 6);
        expect(rows[0]!.cheapestCount).toBe(0);

        expect(await brandReportsRepo.countUnidentifiedTrackedObservations(db.appDb, WINDOW)).toBe(1);
      }, 30_000);

      it('counts a tie as cheapest for everyone who tied', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await look(db.appDb, productId, NOW - DAY, [
          ['a', 100],
          ['b', 100],
          ['c', 130],
        ]);
        const rows = await brandReportsRepo.brandSellerAggregatesInRange(db.appDb, WINDOW);
        expect(bySeller(rows, 'a').cheapestCount).toBe(1);
        expect(bySeller(rows, 'b').cheapestCount).toBe(1);
        expect(bySeller(rows, 'c').cheapestCount).toBe(0);
      }, 30_000);

      it('returns nothing when the window contains no look', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await look(db.appDb, productId, NOW - 90 * DAY, [['a', 100]]);
        expect(await brandReportsRepo.brandSellerAggregatesInRange(db.appDb, WINDOW)).toEqual([]);
      }, 30_000);
    });

    describe('worstSellerProductDeviations', () => {
      /**
       * The seller this finding is about: ordinary on two products, far under on a third. The
       * seller aggregate has already averaged that third one away, which is why the pair query
       * exists at all.
       */
      async function seedOddOneOut(appDb: AppDatabase, brandId: string) {
        const ordinaryA = await addProduct(appDb, brandId, 'ord-a');
        const ordinaryB = await addProduct(appDb, brandId, 'ord-b');
        const cheap = await addProduct(appDb, brandId, 'cheap');
        for (const productId of [ordinaryA, ordinaryB]) {
          await look(appDb, productId, NOW - 2 * DAY, [
            ['a', 100],
            ['b', 100],
          ]);
        }
        // 50 against a market of 50 and 150 — a mean of 100, so this is 50% under.
        await look(appDb, cheap, NOW - 2 * DAY, [
          ['a', 50],
          ['b', 150],
        ]);
        return { ordinaryA, ordinaryB, cheap };
      }

      it('finds the one product a seller is far under on', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const { cheap } = await seedOddOneOut(db.appDb, brandId);

        const rows = await brandReportsRepo.worstSellerProductDeviations(db.appDb, WINDOW, {
          maxDeviationPct: 30,
          limit: 50,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ sellerRef: 'a', trackedProductId: cheap });
        expect(rows[0]!.avgDeviationPct).toBeCloseTo(-50, 5);
      }, 30_000);

      it('carries the product label so the finding can name it without a second query', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        await seedOddOneOut(db.appDb, brandId);
        const rows = await brandReportsRepo.worstSellerProductDeviations(db.appDb, WINDOW, {
          maxDeviationPct: 30,
          limit: 50,
        });
        expect(rows[0]!.productLabel).toBe('Ürün cheap');
      }, 30_000);

      /** The operator's threshold is pushed into the query: raising it fetches less, not more. */
      it('returns nothing once the threshold is raised past the deviation', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        await seedOddOneOut(db.appDb, brandId);
        const rows = await brandReportsRepo.worstSellerProductDeviations(db.appDb, WINDOW, {
          maxDeviationPct: 60,
          limit: 50,
        });
        expect(rows).toEqual([]);
      }, 30_000);

      it('takes the threshold as a distance below the market whichever sign it is given', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        await seedOddOneOut(db.appDb, brandId);
        const positive = await brandReportsRepo.worstSellerProductDeviations(db.appDb, WINDOW, {
          maxDeviationPct: 30,
          limit: 50,
        });
        const negative = await brandReportsRepo.worstSellerProductDeviations(db.appDb, WINDOW, {
          maxDeviationPct: -30,
          limit: 50,
        });
        expect(negative).toEqual(positive);
      }, 30_000);

      it('never reports a seller sitting above the market', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        await seedOddOneOut(db.appDb, brandId);
        const rows = await brandReportsRepo.worstSellerProductDeviations(db.appDb, WINDOW, {
          maxDeviationPct: 30,
          limit: 50,
        });
        // `b` is the one 50% *over* the market on the same look.
        expect(rows.map((r) => r.sellerRef)).not.toContain('b');
      }, 30_000);

      it('stays inside the brand it was asked about', async () => {
        db = await createTestDb(dialect);
        const { brandId, otherBrandId } = await seed(db.appDb);
        await seedOddOneOut(db.appDb, otherBrandId);
        const rows = await brandReportsRepo.worstSellerProductDeviations(
          db.appDb,
          { ...WINDOW, watchedBrandIds: [brandId] },
          { maxDeviationPct: 30, limit: 50 },
        );
        expect(rows).toEqual([]);
      }, 30_000);

      /**
       * The arithmetic Faz 6 rests on: the seller's mean over *everything else* is derived by
       * subtracting this pair's contribution from the aggregate. That is only sound if both
       * sides count the same rows, which is what `comparedCount` is for.
       */
      it('counts the same rows the seller aggregate averaged over', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        await seedOddOneOut(db.appDb, brandId);

        const aggregates = await brandReportsRepo.brandSellerAggregatesInRange(db.appDb, WINDOW);
        const seller = bySeller(aggregates, 'a');
        const [worst] = await brandReportsRepo.worstSellerProductDeviations(db.appDb, WINDOW, {
          maxDeviationPct: 30,
          limit: 50,
        });

        expect(seller.comparedCount).toBe(3);
        expect(worst!.comparedCount).toBe(1);
        const others =
          (seller.avgDeviationPct! * seller.comparedCount - worst!.avgDeviationPct * worst!.comparedCount) /
          (seller.comparedCount - worst!.comparedCount);
        // Level with the market on the two ordinary products, which is the contrast the finding
        // is about.
        expect(others).toBeCloseTo(0, 5);
      }, 30_000);
    });

    describe('evidenceLooks', () => {
      it('opens the whole look, not only the seller the finding was about', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await look(db.appDb, productId, NOW - DAY, [
          ['a', 80],
          ['b', 100],
          ['c', 120],
        ]);

        const looks = await brandReportsRepo.evidenceLooks(db.appDb, {
          ...WINDOW,
          seller: { marketplaceCode: MARKETPLACE, sellerRef: 'a' },
          limit: 10,
        });
        expect(looks).toHaveLength(1);
        // All three offers: "below the market" is a claim about the other rows, so the other
        // rows are the evidence.
        expect(looks[0]!.offers.map((o) => o.sellerRef)).toEqual(['a', 'b', 'c']);
        expect(looks[0]!.offers[0]!.price).toBe(lira(80));
        expect(looks[0]!.offers[0]!.rank).toBe(1);
      }, 30_000);

      it('carries the product so the operator can go and look at the page', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await look(db.appDb, productId, NOW - DAY, [['a', 80]]);
        const looks = await brandReportsRepo.evidenceLooks(db.appDb, {
          ...WINDOW,
          trackedProductId: productId,
          limit: 10,
        });
        expect(looks[0]).toMatchObject({
          trackedProductId: productId,
          productLabel: 'Ürün 2250165',
          productUrl: '/p-2250165',
          marketplaceCode: MARKETPLACE,
        });
      }, 30_000);

      it('returns the most recent looks first and stops at the limit', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        for (const daysAgo of [5, 4, 3, 2, 1]) {
          await look(db.appDb, productId, NOW - daysAgo * DAY, [['a', 100 - daysAgo]]);
        }
        const looks = await brandReportsRepo.evidenceLooks(db.appDb, {
          ...WINDOW,
          trackedProductId: productId,
          limit: 2,
        });
        expect(looks.map((l) => l.observedAt)).toEqual([NOW - DAY, NOW - 2 * DAY]);
      }, 30_000);

      it('narrows to one product when the finding was about a product', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const wanted = await addProduct(db.appDb, brandId, 'wanted');
        const other = await addProduct(db.appDb, brandId, 'other');
        await look(db.appDb, wanted, NOW - DAY, [['a', 80]]);
        await look(db.appDb, other, NOW - DAY, [['a', 80]]);

        const looks = await brandReportsRepo.evidenceLooks(db.appDb, {
          ...WINDOW,
          seller: { marketplaceCode: MARKETPLACE, sellerRef: 'a' },
          trackedProductId: wanted,
          limit: 10,
        });
        expect(looks.map((l) => l.trackedProductId)).toEqual([wanted]);
      }, 30_000);

      it('keeps an unidentified offer in the evidence', async () => {
        // It is dropped from every aggregate — it has no identity to attribute — but it was on
        // the page, and evidence that quietly omitted a competitor would misstate the market
        // the finding was measured against.
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await look(db.appDb, productId, NOW - DAY, [
          ['a', 80],
          [null, 90],
        ]);
        const looks = await brandReportsRepo.evidenceLooks(db.appDb, {
          ...WINDOW,
          trackedProductId: productId,
          limit: 10,
        });
        expect(looks[0]!.offers).toHaveLength(2);
        expect(looks[0]!.offers[1]!.sellerRef).toBeNull();
      }, 30_000);

      it('returns nothing rather than throwing when the subject has no look in the window', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await look(db.appDb, productId, NOW - 90 * DAY, [['a', 80]]);
        const looks = await brandReportsRepo.evidenceLooks(db.appDb, {
          ...WINDOW,
          trackedProductId: productId,
          limit: 10,
        });
        expect(looks).toEqual([]);
      }, 30_000);
    });

    describe('sellerProductTargets (Faz 7)', () => {
      it('answers with the pages this seller was seen on, freshest first', async () => {
        // A merchant-scoped request needs a product the seller is actually on, and the most
        // recent sighting is the likeliest to still be true.
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const older = await addProduct(db.appDb, brandId, 'older');
        const newer = await addProduct(db.appDb, brandId, 'newer');
        await look(db.appDb, older, NOW - 5 * DAY, [['a', 100]]);
        await look(db.appDb, newer, NOW - DAY, [['a', 100]]);

        const targets = await brandReportsRepo.sellerProductTargets(
          db.appDb,
          { marketplaceCode: MARKETPLACE, sellerRef: 'a' },
          WINDOW,
          10,
        );
        expect(targets.map((t) => t.trackedProductId)).toEqual([newer, older]);
        expect(targets[0]!.productRef).toBe('newer');
        expect(targets[0]!.lastSeenAt).toBe(NOW - DAY);
      }, 30_000);

      it('leaves out a product this seller has never been on', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const theirs = await addProduct(db.appDb, brandId, 'theirs');
        const somebodyElses = await addProduct(db.appDb, brandId, 'other');
        await look(db.appDb, theirs, NOW - DAY, [['a', 100]]);
        await look(db.appDb, somebodyElses, NOW - DAY, [['b', 100]]);

        const targets = await brandReportsRepo.sellerProductTargets(
          db.appDb,
          { marketplaceCode: MARKETPLACE, sellerRef: 'a' },
          WINDOW,
          10,
        );
        expect(targets.map((t) => t.trackedProductId)).toEqual([theirs]);
      }, 30_000);

      it('one row per product, however many times the seller was seen on it', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await look(db.appDb, productId, NOW - 3 * DAY, [['a', 100]]);
        await look(db.appDb, productId, NOW - 2 * DAY, [['a', 90]]);
        await look(db.appDb, productId, NOW - DAY, [['a', 80]]);

        const targets = await brandReportsRepo.sellerProductTargets(
          db.appDb,
          { marketplaceCode: MARKETPLACE, sellerRef: 'a' },
          WINDOW,
          10,
        );
        expect(targets).toHaveLength(1);
        expect(targets[0]!.lastSeenAt).toBe(NOW - DAY);
      }, 30_000);

      it('offers a page where the seller was present but the price was unreadable', async () => {
        // Deliberately weaker than the aggregates' clause: every report here needs a price
        // because it is averaging one, but "this seller was on that page" is proved by the
        // offer existing. The stricter clause would skip precisely the sellers whose prices
        // come back malformed — the ones most worth looking into.
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await trackedProductsRepo.insertTrackedProductObservations(db.appDb, [
          {
            id: newId(),
            trackedProductId: productId,
            observedAt: NOW - DAY,
            status: 'ok',
            rank: 1,
            sellerName: 'Satıcı a',
            sellerRef: 'a',
            price: null,
            finalPrice: null,
            offeredStock: null,
          },
        ]);

        const targets = await brandReportsRepo.sellerProductTargets(
          db.appDb,
          { marketplaceCode: MARKETPLACE, sellerRef: 'a' },
          WINDOW,
          10,
        );
        expect(targets.map((t) => t.trackedProductId)).toEqual([productId]);
      }, 30_000);

      it('never returns a failed look, which is a status and not a sighting', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        const productId = await addProduct(db.appDb, brandId, '2250165');
        await trackedProductsRepo.insertTrackedProductObservations(db.appDb, [
          {
            id: newId(),
            trackedProductId: productId,
            observedAt: NOW - DAY,
            status: 'fetchFailed',
            rank: null,
            sellerName: null,
            sellerRef: 'a',
            price: null,
            finalPrice: null,
            offeredStock: null,
          },
        ]);

        const targets = await brandReportsRepo.sellerProductTargets(
          db.appDb,
          { marketplaceCode: MARKETPLACE, sellerRef: 'a' },
          WINDOW,
          10,
        );
        expect(targets).toEqual([]);
      }, 30_000);

      it('stops at the caller’s limit', async () => {
        db = await createTestDb(dialect);
        const { brandId } = await seed(db.appDb);
        for (const ref of ['p1', 'p2', 'p3']) {
          const id = await addProduct(db.appDb, brandId, ref);
          await look(db.appDb, id, NOW - DAY, [['a', 100]]);
        }
        const targets = await brandReportsRepo.sellerProductTargets(
          db.appDb,
          { marketplaceCode: MARKETPLACE, sellerRef: 'a' },
          WINDOW,
          2,
        );
        expect(targets).toHaveLength(2);
      }, 30_000);
    });
  });
}
