/**
 * `watched_brand_groups` / `watched_brands` and the sweep upsert (api-references §1.7).
 *
 * Run across all three dialects, like every other repository test in this package: the sweep
 * upsert is the one place in the module that needs a real conflict clause per dialect
 * (`excluded.*` on SQLite/Postgres, `values()` on MySQL), and a single-dialect test would prove
 * nothing about the other two.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as configRepo from './config.js';
import * as trackedProductsRepo from './tracked-products.js';
import * as watchedBrandsRepo from './watched-brands.js';

const NOW = Date.UTC(2026, 0, 1);
const MARKETPLACE = 'TY';

async function seedGroupAndBrand(
  appDb: AppDatabase,
  overrides: Partial<watchedBrandsRepo.WatchedBrandRow> = {},
): Promise<{ groupId: string; brandId: string }> {
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
  await watchedBrandsRepo.createWatchedBrand(appDb, {
    id: brandId,
    groupId,
    marketplaceCode: MARKETPLACE,
    label: 'Whiskas',
    brandRef: '104703',
    searchTerm: 'whiskas',
    isActive: true,
    lastSweptAt: null,
    lastSweepProductCount: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
  return { groupId, brandId };
}

function swept(
  brandId: string,
  ref: string,
  overrides: Partial<trackedProductsRepo.SweptProduct> = {},
): trackedProductsRepo.SweptProduct {
  return {
    id: newId(),
    marketplaceCode: MARKETPLACE,
    productRef: ref,
    productUrl: `/whiskas/urun-p-${ref}`,
    label: `Ürün ${ref}`,
    watchedBrandId: brandId,
    viaBrandRef: true,
    viaSearchTerm: false,
    brandName: 'Whiskas',
    brandRef: '104703',
    categoryRef: '1030',
    categoryName: 'Kedi Kuru Maması',
    ratingCount: 12,
    ratingAverage: 4.5,
    sweptAt: NOW,
    ...overrides,
  };
}

for (const dialect of ALL_DIALECTS) {
  describe(`watched brands (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('requires at least one selector', async () => {
      db = await createTestDb(dialect);
      const { groupId } = await seedGroupAndBrand(db.appDb);
      await expect(
        watchedBrandsRepo.createWatchedBrand(db.appDb, {
          id: newId(),
          groupId,
          marketplaceCode: MARKETPLACE,
          label: 'Selectorless',
          brandRef: null,
          searchTerm: '   ',
          isActive: true,
          lastSweptAt: null,
          lastSweepProductCount: null,
          createdAt: NOW,
          updatedAt: NOW,
        }),
      ).rejects.toBeInstanceOf(watchedBrandsRepo.WatchedBrandSelectorError);
    }, 30_000);

    it('accepts a search term alone as a complete configuration', async () => {
      db = await createTestDb(dialect);
      const { groupId } = await seedGroupAndBrand(db.appDb);
      const id = newId();
      await watchedBrandsRepo.createWatchedBrand(db.appDb, {
        id,
        groupId,
        marketplaceCode: MARKETPLACE,
        label: 'Royal Canin',
        brandRef: null,
        searchTerm: 'royal canin',
        isActive: true,
        lastSweptAt: null,
        lastSweepProductCount: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const row = await watchedBrandsRepo.getWatchedBrand(db.appDb, id);
      expect(row?.brandRef).toBeNull();
      expect(row?.searchTerm).toBe('royal canin');
    }, 30_000);

    it('filters by active and by group', async () => {
      db = await createTestDb(dialect);
      const { groupId } = await seedGroupAndBrand(db.appDb);
      await watchedBrandsRepo.createWatchedBrand(db.appDb, {
        id: newId(),
        groupId,
        marketplaceCode: MARKETPLACE,
        label: 'Paused',
        brandRef: '999',
        searchTerm: null,
        isActive: false,
        lastSweptAt: null,
        lastSweepProductCount: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(await watchedBrandsRepo.listWatchedBrands(db.appDb)).toHaveLength(2);
      expect(await watchedBrandsRepo.listWatchedBrands(db.appDb, { activeOnly: true })).toHaveLength(1);
      expect(await watchedBrandsRepo.listWatchedBrands(db.appDb, { groupId })).toHaveLength(2);
    }, 30_000);

    it('deleting a group keeps the products it discovered', async () => {
      db = await createTestDb(dialect);
      const { groupId, brandId } = await seedGroupAndBrand(db.appDb);
      await trackedProductsRepo.upsertSweptProducts(db.appDb, [swept(brandId, '1')]);

      await watchedBrandsRepo.deleteWatchedBrandGroup(db.appDb, groupId);

      // The brand is gone; the product and its history are not. Removing a brand from the watch
      // list is a decision about watching, not a reason to destroy observations.
      expect(await watchedBrandsRepo.listWatchedBrands(db.appDb)).toHaveLength(0);
      const products = await trackedProductsRepo.listTrackedProducts(db.appDb);
      expect(products).toHaveLength(1);
      expect(products[0]!.watchedBrandId).toBeNull();
    }, 30_000);

    it('records a sweep result', async () => {
      db = await createTestDb(dialect);
      const { brandId } = await seedGroupAndBrand(db.appDb);
      await watchedBrandsRepo.recordSweepResult(db.appDb, brandId, NOW + 1000, 887);
      const row = await watchedBrandsRepo.getWatchedBrand(db.appDb, brandId);
      expect(row?.lastSweptAt).toBe(NOW + 1000);
      expect(row?.lastSweepProductCount).toBe(887);
    }, 30_000);
  });

  describe(`swept product upsert (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('inserts new products with their catalogue metadata', async () => {
      db = await createTestDb(dialect);
      const { brandId } = await seedGroupAndBrand(db.appDb);
      await trackedProductsRepo.upsertSweptProducts(db.appDb, [
        swept(brandId, '1'),
        swept(brandId, '2', { ratingCount: 0 }),
      ]);
      const rows = await trackedProductsRepo.listTrackedProducts(db.appDb);
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.productRef === '1')!.categoryName).toBe('Kedi Kuru Maması');
      // Zero, not null: genuinely unrated, which is what the dead-product suggestion acts on.
      expect(rows.find((r) => r.productRef === '2')!.ratingCount).toBe(0);
    }, 30_000);

    it('collapses a product both selectors found, keeping the union of the flags', async () => {
      db = await createTestDb(dialect);
      const { brandId } = await seedGroupAndBrand(db.appDb);
      // Two rows for one product with different ids — what a naive insert would fail on.
      await trackedProductsRepo.upsertSweptProducts(db.appDb, [
        swept(brandId, '1', { viaBrandRef: true, viaSearchTerm: false }),
        swept(brandId, '1', { viaBrandRef: false, viaSearchTerm: true }),
      ]);
      const rows = await trackedProductsRepo.listTrackedProducts(db.appDb);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.viaBrandRef).toBe(true);
      expect(rows[0]!.viaSearchTerm).toBe(true);
    }, 30_000);

    it('refreshes sweep-owned columns and preserves operator-owned ones', async () => {
      db = await createTestDb(dialect);
      const { brandId } = await seedGroupAndBrand(db.appDb);
      await trackedProductsRepo.upsertSweptProducts(db.appDb, [
        swept(brandId, '1', { label: 'İlk ad', ratingCount: 10 }),
      ]);
      const before = (await trackedProductsRepo.listTrackedProducts(db.appDb))[0]!;

      await trackedProductsRepo.upsertSweptProducts(db.appDb, [
        swept(brandId, '1', {
          label: 'Pazaryerinin yeni adı',
          ratingCount: 400,
          categoryName: 'Kedi Konserve Maması',
          sweptAt: NOW + 60_000,
        }),
      ]);
      const after = (await trackedProductsRepo.listTrackedProducts(db.appDb))[0]!;

      expect(after.ratingCount).toBe(400);
      expect(after.categoryName).toBe('Kedi Konserve Maması');
      expect(after.lastSweptAt).toBe(NOW + 60_000);
      // Operator-owned: a rename survives the nightly sweep, and so does the original row.
      expect(after.label).toBe(before.label);
      expect(after.addedAt).toBe(before.addedAt);
      expect(after.id).toBe(before.id);
    }, 30_000);

    it('does not resurrect a product the operator deactivated', async () => {
      db = await createTestDb(dialect);
      const { brandId } = await seedGroupAndBrand(db.appDb);
      await trackedProductsRepo.upsertSweptProducts(db.appDb, [swept(brandId, '1')]);
      const row = (await trackedProductsRepo.listTrackedProducts(db.appDb))[0]!;

      // Stand in for the operator switching it off from the grid.
      await trackedProductsRepo.deleteTrackedProduct(db.appDb, row.id);
      await trackedProductsRepo.addTrackedProduct(db.appDb, { ...row, isActive: false });

      await trackedProductsRepo.upsertSweptProducts(db.appDb, [swept(brandId, '1')]);
      expect((await trackedProductsRepo.listTrackedProducts(db.appDb))[0]!.isActive).toBe(false);
    }, 30_000);

    it('writes more rows than one statement can carry', async () => {
      db = await createTestDb(dialect);
      const { brandId } = await seedGroupAndBrand(db.appDb);
      // Above the 200-row chunk size, so the chunking path is actually exercised. A real brand
      // is 887 (Whiskas) to 4,863 (Royal Canin) rows.
      const many = Array.from({ length: 450 }, (_, i) => swept(brandId, `p${i}`));
      await trackedProductsRepo.upsertSweptProducts(db.appDb, many);
      expect(await trackedProductsRepo.listTrackedProducts(db.appDb)).toHaveLength(450);
    }, 30_000);

    it('suggests the brand id most of a brand’s products carry', async () => {
      db = await createTestDb(dialect);
      const { brandId } = await seedGroupAndBrand(db.appDb, { brandRef: null });
      await trackedProductsRepo.upsertSweptProducts(db.appDb, [
        swept(brandId, '1', { brandRef: '104703' }),
        swept(brandId, '2', { brandRef: '104703' }),
        swept(brandId, '3', { brandRef: '104703' }),
        // The Halı case: carries the name, attributed elsewhere. It must not win, and it must
        // still count toward the total so the winner's share reflects reality.
        swept(brandId, '4', { brandRef: '99999' }),
      ]);
      const suggestions = await watchedBrandsRepo.suggestedBrandRefs(db.appDb);
      const forBrand = suggestions.find((s) => s.watchedBrandId === brandId)!;
      expect(forBrand.brandRef).toBe('104703');
      expect(forBrand.productCount).toBe(3);
      expect(forBrand.share).toBeCloseTo(0.75, 5);
    }, 30_000);

    it('counts genuinely unrated products separately from unreadable ones', async () => {
      db = await createTestDb(dialect);
      const { brandId } = await seedGroupAndBrand(db.appDb);
      await trackedProductsRepo.upsertSweptProducts(db.appDb, [
        swept(brandId, '1', { ratingCount: 0 }),
        swept(brandId, '2', { ratingCount: 0 }),
        swept(brandId, '3', { ratingCount: null }),
        swept(brandId, '4', { ratingCount: 219 }),
      ]);
      const counts = await watchedBrandsRepo.watchedBrandCounts(db.appDb);
      const forBrand = counts.find((c) => c.watchedBrandId === brandId)!;
      expect(forBrand.productCount).toBe(4);
      // Three products are not offered for deletion — only the two the marketplace itself
      // reports as never rated. The null is our failure to read, not a dead product.
      expect(forBrand.unratedCount).toBe(2);
    }, 30_000);
  });

  describe(`tracked product grid query (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    async function seedGrid(): Promise<string> {
      const { brandId } = await seedGroupAndBrand(db!.appDb);
      await trackedProductsRepo.upsertSweptProducts(db!.appDb, [
        swept(brandId, '1', {
          label: 'Biftekli Kuru Mama',
          categoryRef: '1030',
          categoryName: 'Kedi Kuru Maması',
          ratingCount: 219,
        }),
        swept(brandId, '2', {
          label: 'Somonlu Konserve',
          categoryRef: '1291',
          categoryName: 'Kedi Konserve Maması',
          ratingCount: 0,
        }),
        swept(brandId, '3', {
          label: 'Whiskas Baskılı Halı',
          categoryRef: '1852',
          categoryName: 'Halı',
          ratingCount: 4,
          viaBrandRef: false,
          viaSearchTerm: true,
        }),
        swept(brandId, '4', {
          label: 'Okunamayan',
          categoryRef: '1030',
          categoryName: 'Kedi Kuru Maması',
          ratingCount: null,
        }),
      ]);
      return brandId;
    }

    it('pages and reports the unpaged total', async () => {
      db = await createTestDb(dialect);
      await seedGrid();
      const page = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        limit: 2,
        offset: 0,
        sort: 'label',
      });
      expect(page.rows).toHaveLength(2);
      expect(page.total).toBe(4);
    }, 30_000);

    it('sorts by rating count, keeping unreadable rows last in both directions', async () => {
      // The three dialects disagree on where nulls land: Postgres puts them first on DESC,
      // SQLite and MySQL last. Left alone, "en cok degerlendirilen" would have opened with a
      // page of unreadable rows on Postgres only. `trackedOrderBy` forces nulls last
      // everywhere; this asserts it on all three.
      db = await createTestDb(dialect);
      await seedGrid();
      const highFirst = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        limit: 10,
        offset: 0,
        sort: 'ratingCount',
        sortDir: 'desc',
      });
      expect(highFirst.rows[0]!.ratingCount).toBe(219);
      expect(highFirst.rows.at(-1)!.ratingCount).toBeNull();

      const lowFirst = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        limit: 10,
        offset: 0,
        sort: 'ratingCount',
        sortDir: 'asc',
      });
      expect(lowFirst.rows[0]!.ratingCount).toBe(0);
      expect(lowFirst.rows.at(-1)!.ratingCount).toBeNull();
    }, 30_000);

    it('filters to products the search term found but the brand id did not', async () => {
      db = await createTestDb(dialect);
      await seedGrid();
      const page = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        searchTermOnly: true,
        limit: 10,
        offset: 0,
      });
      // The Halı row — the brand-misuse shortlist. A product both selectors found must not
      // appear here, or the filter would return the whole catalogue.
      expect(page.rows.map((r) => r.productRef)).toEqual(['3']);
    }, 30_000);

    it('offers only genuinely unrated products, never unreadable ones', async () => {
      db = await createTestDb(dialect);
      await seedGrid();
      const page = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        unratedOnly: true,
        limit: 10,
        offset: 0,
      });
      expect(page.rows.map((r) => r.productRef)).toEqual(['2']);
    }, 30_000);

    it('searches label and marketplace ref with a bound pattern', async () => {
      db = await createTestDb(dialect);
      await seedGrid();
      const byLabel = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        text: 'Konserve',
        limit: 10,
        offset: 0,
      });
      expect(byLabel.rows.map((r) => r.productRef)).toEqual(['2']);
      const byRef = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        text: '3',
        limit: 10,
        offset: 0,
      });
      expect(byRef.rows.map((r) => r.productRef)).toEqual(['3']);
    }, 30_000);

    it('filters by category', async () => {
      db = await createTestDb(dialect);
      await seedGrid();
      const page = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        categoryRef: '1030',
        limit: 10,
        offset: 0,
      });
      expect(page.total).toBe(2);
    }, 30_000);

    it('lists categories with counts, busiest first', async () => {
      db = await createTestDb(dialect);
      await seedGrid();
      const categories = await trackedProductsRepo.trackedProductCategories(db.appDb);
      expect(categories[0]).toMatchObject({ ref: '1030', productCount: 2 });
      // The odd-category row survives into the filter list — that is where brand misuse shows up.
      expect(categories.some((c) => c.name === 'Halı')).toBe(true);
    }, 30_000);

    it('deactivates in bulk and the row survives', async () => {
      db = await createTestDb(dialect);
      await seedGrid();
      const all = await trackedProductsRepo.queryTrackedProducts(db.appDb, { limit: 10, offset: 0 });
      await trackedProductsRepo.setTrackedProductsActive(
        db.appDb,
        all.rows.map((r) => r.id),
        false,
      );
      const active = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        isActive: true,
        limit: 10,
        offset: 0,
      });
      const inactive = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        isActive: false,
        limit: 10,
        offset: 0,
      });
      expect(active.total).toBe(0);
      // Deactivated, never deleted: the suggestion that drives this is a proxy, so it must
      // be reversible.
      expect(inactive.total).toBe(4);
    }, 30_000);

    it('writes a rating sample only when the count moves', async () => {
      db = await createTestDb(dialect);
      const brandId = await seedGrid();
      const row = (await trackedProductsRepo.findTrackedProductsByRefs(db.appDb, MARKETPLACE, ['1'])).get(
        '1',
      )!;

      const written = await trackedProductsRepo.recordTrackedProductMetrics(db.appDb, [
        { id: newId(), trackedProductId: row.id, observedAt: NOW, ratingCount: 219, ratingAverage: 4.6, previousRatingCount: 219 },
        { id: newId(), trackedProductId: row.id, observedAt: NOW, ratingCount: null, ratingAverage: null, previousRatingCount: 219 },
      ]);
      expect(written).toBe(0);

      const changed = await trackedProductsRepo.recordTrackedProductMetrics(db.appDb, [
        { id: newId(), trackedProductId: row.id, observedAt: NOW + 1, ratingCount: 231, ratingAverage: 4.6, previousRatingCount: 219 },
      ]);
      expect(changed).toBe(1);
      const series = await trackedProductsRepo.trackedProductMetricsSince(db.appDb, row.id, 0);
      expect(series.map((m) => m.ratingCount)).toEqual([231]);
      void brandId;
    }, 30_000);
  });
}
