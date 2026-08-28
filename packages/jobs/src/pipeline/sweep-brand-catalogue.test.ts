/**
 * `SweepBrandCatalogue` (api-references §1.7, doc 06).
 *
 * The last describe block is the module's own definition of done — turning the sweep off, or
 * running it with no source at all, must leave repricing untouched — asserted rather than
 * assumed, mirroring `scrape-competitors.test.ts`.
 */
import {
  BrandCatalogueError,
  type BrandCataloguePage,
  type BrandCatalogueProduct,
  type BrandCatalogueQuery,
  type IBrandCatalogueSource,
} from '@buybox/adapters';
import { eventsRepo, jobsRepo, newId, trackedProductsRepo, watchedBrandsRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBrandCatalogueSourceRegistry } from '../brand-catalogue-source-registry.js';
import { FakeClock } from '../clock.js';
import { buildAdapterRegistry } from '../adapter-registry.js';
import type { JobContext, JobProgress } from '../job.js';
import { createSqliteTestDb, NOW, seedMarketplace, type TestDb } from '../test-helpers.js';
import {
  mergeSelectorResults,
  sweepBrandCatalogue,
  sweepSelector,
  SWEEP_BRAND_CATALOGUE_JOB,
} from './sweep-brand-catalogue.js';

function product(ref: string, overrides: Partial<BrandCatalogueProduct> = {}): BrandCatalogueProduct {
  return {
    productRef: ref,
    url: `/whiskas/urun-p-${ref}`,
    name: `Ürün ${ref}`,
    brandName: 'Whiskas',
    brandRef: '104703',
    categoryRef: '1030',
    categoryName: 'Kedi Kuru Maması',
    ratingCount: 12,
    ratingAverage: 4.5,
    price: Money.fromMajorUnitsString('908.00'),
    buyboxSellerRef: '575543',
    ...overrides,
  };
}

/**
 * A source driven by a per-selector list of pages. `byBrandRef` / `bySearchTerm` are indexed by
 * page number; a page index past the end returns empty, which is exactly what the real source
 * does for Trendyol's 404 past the last page.
 */
function fakeSource(options: {
  readonly byBrandRef?: readonly (readonly BrandCatalogueProduct[])[];
  readonly bySearchTerm?: readonly (readonly BrandCatalogueProduct[])[];
  readonly failOn?: (query: BrandCatalogueQuery, pageIndex: number) => BrandCatalogueError | undefined;
  readonly total?: number | null;
}): IBrandCatalogueSource & { readonly calls: { query: BrandCatalogueQuery; pageIndex: number }[] } {
  const calls: { query: BrandCatalogueQuery; pageIndex: number }[] = [];
  return {
    code: 'trendyol',
    calls,
    async fetchPage(query, pageIndex): Promise<BrandCataloguePage> {
      calls.push({ query, pageIndex });
      const failure = options.failOn?.(query, pageIndex);
      if (failure) throw failure;
      const pages = query.brandRef !== null ? (options.byBrandRef ?? []) : (options.bySearchTerm ?? []);
      return {
        marketplaceCode: 'trendyol',
        query,
        pageIndex,
        totalProducts: options.total ?? null,
        products: pages[pageIndex - 1] ?? [],
        fetchedUrl: 'https://www.trendyol.com/sr',
        observedAt: new Date(NOW),
        diagnostics: {
          parserVersion: '1.0.0',
          stateFound: true,
          dataFound: true,
          rawCardCount: (pages[pageIndex - 1] ?? []).length,
          droppedCount: 0,
        },
        fromCache: false,
      };
    },
  };
}

describe('sweepSelector', () => {
  it('pages until a page comes back empty', async () => {
    const source = fakeSource({ byBrandRef: [[product('1'), product('2')], [product('3')]] });
    const result = await sweepSelector(source, { brandRef: '104703', searchTerm: null }, 400);
    expect(result.products.map((p) => p.productRef)).toEqual(['1', '2', '3']);
    // Two pages of data plus the empty third that ended the loop.
    expect(result.pagesFetched).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it('stops at the page ceiling and says so', async () => {
    // A page generator that never runs out — what a frontend change that stopped returning
    // empty pages would look like. The guard must bound it and flag the result.
    const endless = fakeSource({ byBrandRef: Array.from({ length: 50 }, (_, i) => [product(String(i))]) });
    const result = await sweepSelector(endless, { brandRef: '104703', searchTerm: null }, 5);
    expect(result.pagesFetched).toBe(5);
    expect(result.truncated).toBe(true);
  });

  it('does not treat the marketplace total as the loop bound', async () => {
    // `total` claims 100; the pages actually hold 2. The loop must believe the data.
    const source = fakeSource({ byBrandRef: [[product('1'), product('2')]], total: 100 });
    const result = await sweepSelector(source, { brandRef: '104703', searchTerm: null }, 400);
    expect(result.products).toHaveLength(2);
  });
});

describe('mergeSelectorResults', () => {
  it('flags a product found by both selectors', () => {
    const merged = mergeSelectorResults([product('1')], [product('1')]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.viaBrandRef).toBe(true);
    expect(merged[0]!.viaSearchTerm).toBe(true);
  });

  it('flags a product only the search term found', () => {
    // The Halı case: the marketplace does not attribute it to the brand, but its name carries
    // the brand. This is the brand-abuse signal and must survive the merge distinctly.
    const merged = mergeSelectorResults([product('1')], [product('1'), product('99')]);
    const odd = merged.find((m) => m.product.productRef === '99');
    expect(odd!.viaBrandRef).toBe(false);
    expect(odd!.viaSearchTerm).toBe(true);
  });

  it('flags a product only the brand id found', () => {
    const merged = mergeSelectorResults([product('1')], []);
    expect(merged[0]!.viaBrandRef).toBe(true);
    expect(merged[0]!.viaSearchTerm).toBe(false);
  });
});

describe('the job', () => {
  let db: TestDb;
  let clock: FakeClock;

  async function seedBrand(overrides: Partial<watchedBrandsRepo.WatchedBrandRow> = {}): Promise<string> {
    const groupId = newId();
    await watchedBrandsRepo.createWatchedBrandGroup(db.appDb, {
      id: groupId,
      name: 'Mars',
      note: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const id = newId();
    await watchedBrandsRepo.createWatchedBrand(db.appDb, {
      id,
      groupId,
      marketplaceCode: 'trendyol',
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
    return id;
  }

  function ctxFor(source: IBrandCatalogueSource | undefined, payload: Record<string, unknown>): JobContext {
    const progress: JobProgress[] = [];
    return {
      appDb: db.appDb,
      clock,
      adapters: buildAdapterRegistry([]),
      brandCatalogueSources:
        source === undefined ? undefined : buildBrandCatalogueSourceRegistry([['trendyol', source]]),
      correlationId: 'test-run',
      payload: JSON.stringify(payload),
      reportProgress: (p) => progress.push(p),
    };
  }

  beforeEach(async () => {
    db = await createSqliteTestDb();
    clock = new FakeClock(NOW);
    await seedMarketplace(db.appDb, 'trendyol');
    // `app_events.job_run_id` is a foreign key, so the events these tests assert on need a real
    // run row to point at — the runner supplies one in production.
    await jobsRepo.startJobRun(db.appDb, {
      id: 'test-run',
      jobName: SWEEP_BRAND_CATALOGUE_JOB,
      startedAt: NOW,
      finishedAt: null,
      state: 'running',
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: null,
      correlationId: 'test-run',
      jobQueueId: null,
    });
  });
  afterEach(() => db.cleanup());

  it('writes the union of both selectors as tracked products', async () => {
    await seedBrand();
    const source = fakeSource({
      byBrandRef: [[product('1'), product('2')]],
      bySearchTerm: [[product('2'), product('99', { categoryName: 'Halı', categoryRef: '1852' })]],
    });
    const result = await sweepBrandCatalogue(ctxFor(source, { marketplaceCode: 'trendyol' }));

    expect(result).toMatchObject({ itemsTotal: 1, itemsOk: 1, itemsFailed: 0 });
    const rows = await trackedProductsRepo.listTrackedProducts(db.appDb);
    expect(rows.map((r) => r.productRef).sort()).toEqual(['1', '2', '99']);
  });

  it('records which selector found each product', async () => {
    await seedBrand();
    const source = fakeSource({
      byBrandRef: [[product('1')]],
      bySearchTerm: [[product('1'), product('99')]],
    });
    await sweepBrandCatalogue(ctxFor(source, { marketplaceCode: 'trendyol' }));

    const rows = await trackedProductsRepo.listTrackedProducts(db.appDb);
    const both = rows.find((r) => r.productRef === '1')!;
    const searchOnly = rows.find((r) => r.productRef === '99')!;
    expect([both.viaBrandRef, both.viaSearchTerm]).toEqual([true, true]);
    expect([searchOnly.viaBrandRef, searchOnly.viaSearchTerm]).toEqual([false, true]);
  });

  it('stores the catalogue metadata the sweep already paid for', async () => {
    await seedBrand();
    const source = fakeSource({ byBrandRef: [[product('1', { ratingCount: 219, ratingAverage: 4.68 })]] });
    await sweepBrandCatalogue(ctxFor(source, { marketplaceCode: 'trendyol' }));

    const row = (await trackedProductsRepo.listTrackedProducts(db.appDb))[0]!;
    expect(row.categoryRef).toBe('1030');
    expect(row.categoryName).toBe('Kedi Kuru Maması');
    expect(row.ratingCount).toBe(219);
    expect(row.lastSweptAt).toBe(NOW);
    expect(row.watchedBrandId).not.toBeNull();
  });

  it('keeps an unrated product as 0, distinct from an unreadable one as null', async () => {
    await seedBrand();
    const source = fakeSource({
      byBrandRef: [[product('1', { ratingCount: 0 }), product('2', { ratingCount: null })]],
    });
    await sweepBrandCatalogue(ctxFor(source, { marketplaceCode: 'trendyol' }));

    const rows = await trackedProductsRepo.listTrackedProducts(db.appDb);
    expect(rows.find((r) => r.productRef === '1')!.ratingCount).toBe(0);
    expect(rows.find((r) => r.productRef === '2')!.ratingCount).toBeNull();
  });

  it('records the sweep on the brand only after the products are written', async () => {
    const brandId = await seedBrand();
    const source = fakeSource({ byBrandRef: [[product('1'), product('2')]] });
    await sweepBrandCatalogue(ctxFor(source, { marketplaceCode: 'trendyol' }));

    const brand = await watchedBrandsRepo.getWatchedBrand(db.appDb, brandId);
    expect(brand!.lastSweptAt).toBe(NOW);
    expect(brand!.lastSweepProductCount).toBe(2);
  });

  it('re-sweeping refreshes marketplace data but keeps operator-owned fields', async () => {
    const brandId = await seedBrand();
    await sweepBrandCatalogue(
      ctxFor(fakeSource({ byBrandRef: [[product('1', { name: 'İlk ad' })]] }), {
        marketplaceCode: 'trendyol',
      }),
    );
    const first = (await trackedProductsRepo.listTrackedProducts(db.appDb))[0]!;

    clock.advance(60_000);
    await sweepBrandCatalogue(
      ctxFor(fakeSource({ byBrandRef: [[product('1', { name: 'Yeni ad', ratingCount: 400 })]] }), {
        marketplaceCode: 'trendyol',
      }),
    );
    const second = (await trackedProductsRepo.listTrackedProducts(db.appDb))[0]!;

    // Sweep-owned: refreshed.
    expect(second.ratingCount).toBe(400);
    expect(second.lastSweptAt).toBe(NOW + 60_000);
    // Operator-owned: untouched, so a rename or a deactivation survives the nightly sweep.
    expect(second.label).toBe(first.label);
    expect(second.addedAt).toBe(first.addedAt);
    expect(second.id).toBe(first.id);
    void brandId;
  });

  it('starts a rating series on a product’s first sweep', async () => {
    await seedBrand();
    await sweepBrandCatalogue(
      ctxFor(fakeSource({ byBrandRef: [[product('1', { ratingCount: 219 })]] }), {
        marketplaceCode: 'trendyol',
      }),
    );
    const row = (await trackedProductsRepo.listTrackedProducts(db.appDb))[0]!;
    const series = await trackedProductsRepo.trackedProductMetricsSince(db.appDb, row.id, 0);
    expect(series).toHaveLength(1);
    expect(series[0]!.ratingCount).toBe(219);
  });

  it('writes no history row when the rating did not move', async () => {
    // The whole reason the history is change-detected: a daily sweep over two brands is ~5,750
    // products, and a row each would be millions a year saying "unchanged".
    await seedBrand();
    const sweep = () =>
      sweepBrandCatalogue(
        ctxFor(fakeSource({ byBrandRef: [[product('1', { ratingCount: 219 })]] }), {
          marketplaceCode: 'trendyol',
        }),
      );
    await sweep();
    clock.advance(24 * 60 * 60_000);
    await sweep();
    clock.advance(24 * 60 * 60_000);
    await sweep();

    const row = (await trackedProductsRepo.listTrackedProducts(db.appDb))[0]!;
    expect(await trackedProductsRepo.trackedProductMetricsSince(db.appDb, row.id, 0)).toHaveLength(1);
  });

  it('appends a history row when the rating moves', async () => {
    await seedBrand();
    await sweepBrandCatalogue(
      ctxFor(fakeSource({ byBrandRef: [[product('1', { ratingCount: 219 })]] }), {
        marketplaceCode: 'trendyol',
      }),
    );
    clock.advance(24 * 60 * 60_000);
    await sweepBrandCatalogue(
      ctxFor(fakeSource({ byBrandRef: [[product('1', { ratingCount: 231 })]] }), {
        marketplaceCode: 'trendyol',
      }),
    );

    const row = (await trackedProductsRepo.listTrackedProducts(db.appDb))[0]!;
    const series = await trackedProductsRepo.trackedProductMetricsSince(db.appDb, row.id, 0);
    expect(series.map((m) => m.ratingCount)).toEqual([219, 231]);
  });

  it('never records an unreadable rating as an event in the series', async () => {
    // A null is our failure to parse the page, not something that happened to the product.
    // Writing it would put a fake dip in every series it touched.
    await seedBrand();
    await sweepBrandCatalogue(
      ctxFor(fakeSource({ byBrandRef: [[product('1', { ratingCount: 219 })]] }), {
        marketplaceCode: 'trendyol',
      }),
    );
    clock.advance(24 * 60 * 60_000);
    await sweepBrandCatalogue(
      ctxFor(fakeSource({ byBrandRef: [[product('1', { ratingCount: null })]] }), {
        marketplaceCode: 'trendyol',
      }),
    );

    const row = (await trackedProductsRepo.listTrackedProducts(db.appDb))[0]!;
    const series = await trackedProductsRepo.trackedProductMetricsSince(db.appDb, row.id, 0);
    expect(series.map((m) => m.ratingCount)).toEqual([219]);
  });

  it('records a genuine zero, which is what the dead-product suggestion acts on', async () => {
    await seedBrand();
    await sweepBrandCatalogue(
      ctxFor(fakeSource({ byBrandRef: [[product('1', { ratingCount: 0 })]] }), {
        marketplaceCode: 'trendyol',
      }),
    );
    const row = (await trackedProductsRepo.listTrackedProducts(db.appDb))[0]!;
    const series = await trackedProductsRepo.trackedProductMetricsSince(db.appDb, row.id, 0);
    expect(series.map((m) => m.ratingCount)).toEqual([0]);
  });

  it('sweeps only the requested brand when one is named', async () => {
    const brandId = await seedBrand();
    const other = await watchedBrandsRepo.listWatchedBrands(db.appDb);
    const groupId = other[0]!.groupId;
    await watchedBrandsRepo.createWatchedBrand(db.appDb, {
      id: newId(),
      groupId,
      marketplaceCode: 'trendyol',
      label: 'Royal Canin',
      brandRef: '103046',
      searchTerm: null,
      isActive: true,
      lastSweptAt: null,
      lastSweepProductCount: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const source = fakeSource({ byBrandRef: [[product('1')]], bySearchTerm: [[product('1')]] });
    const result = await sweepBrandCatalogue(
      ctxFor(source, { marketplaceCode: 'trendyol', watchedBrandId: brandId }),
    );
    expect(result.itemsTotal).toBe(1);
    expect(source.calls.every((c) => c.query.brandRef !== '103046')).toBe(true);
  });

  it('skips an inactive brand', async () => {
    await seedBrand({ isActive: false });
    const source = fakeSource({ byBrandRef: [[product('1')]] });
    const result = await sweepBrandCatalogue(ctxFor(source, { marketplaceCode: 'trendyol' }));
    expect(result.itemsTotal).toBe(0);
    expect(source.calls).toHaveLength(0);
  });

  it('counts a failed brand and records it, without failing the run', async () => {
    await seedBrand();
    const source = fakeSource({
      failOn: () => new BrandCatalogueError('blocked', 'fetchFailed', undefined, 403),
    });
    const result = await sweepBrandCatalogue(ctxFor(source, { marketplaceCode: 'trendyol' }));

    // No `error` on the result: one brand's bad page must not make the queue retry every
    // other brand's sweep along with it.
    expect(result).toMatchObject({ itemsTotal: 1, itemsOk: 0, itemsFailed: 1 });
    expect(result.error).toBeUndefined();
    const events = await eventsRepo.listRecentEvents(db.appDb, 10);
    expect(events.some((e) => e.code === 'BrandSweepFailed')).toBe(true);
  });

  it('does not record a sweep result for a brand that failed', async () => {
    const brandId = await seedBrand();
    const source = fakeSource({ failOn: () => new BrandCatalogueError('down', 'fetchFailed') });
    await sweepBrandCatalogue(ctxFor(source, { marketplaceCode: 'trendyol' }));

    // "Swept 3 hours ago, 1,847 products" must stay true until a newer sweep actually
    // replaces it — a partial failure must not report a catalogue that shrank to nothing.
    const brand = await watchedBrandsRepo.getWatchedBrand(db.appDb, brandId);
    expect(brand!.lastSweptAt).toBeNull();
    expect(brand!.lastSweepProductCount).toBeNull();
  });

  it('records a truncated sweep as an event', async () => {
    await seedBrand({ searchTerm: null });
    const endless = fakeSource({ byBrandRef: Array.from({ length: 20 }, (_, i) => [product(String(i))]) });
    await sweepBrandCatalogue(
      ctxFor(endless, { marketplaceCode: 'trendyol', maxPagesPerSelector: 3 }),
    );
    const events = await eventsRepo.listRecentEvents(db.appDb, 10);
    expect(events.some((e) => e.code === 'BrandSweepTruncated')).toBe(true);
  });
});

describe('isolation from the pricing path', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createSqliteTestDb();
    await seedMarketplace(db.appDb, 'trendyol');
  });
  afterEach(() => db.cleanup());

  it('a marketplace with no catalogue source is a supported configuration, not a failure', async () => {
    const result = await sweepBrandCatalogue({
      appDb: db.appDb,
      clock: new FakeClock(NOW),
      adapters: buildAdapterRegistry([]),
      brandCatalogueSources: undefined,
      correlationId: 'test-run',
      payload: JSON.stringify({ marketplaceCode: 'trendyol' }),
      reportProgress: () => {},
    });
    expect(result).toEqual({ itemsTotal: 0, itemsOk: 0, itemsFailed: 0 });
  });

  it('ships disabled, like every other scraper', async () => {
    const { JOB_CATALOG } = await import('../job-catalog.js');
    const entry = JOB_CATALOG.find((e) => e.jobName === SWEEP_BRAND_CATALOGUE_JOB);
    expect(entry).toBeDefined();
    expect(entry!.defaultEnabled).toBe(false);
  });
});
