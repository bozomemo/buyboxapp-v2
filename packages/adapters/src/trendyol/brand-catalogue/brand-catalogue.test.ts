/**
 * Trendyol brand-catalogue scraper tests. Fixture-backed only — never a live call (doc 10 §10).
 *
 * The fixture is a real `__single-search-result__PROPS` payload captured from the Whiskas sweep
 * on 2026-08-27, trimmed to three cards chosen because each pins a different rule: a fully
 * populated card, a card with no rating at all, and the *Halı* card — a product carrying the
 * brand's name in an unrelated category, which the brand-owner report exists to surface and
 * which must therefore survive normalisation rather than be filtered out as noise.
 */
import { readFileSync } from 'node:fs';
import { Money } from '@buybox/shared';
import { describe, expect, it, vi } from 'vitest';
import { BrandCatalogueError, hasBrandCatalogueQuery } from '../../ports/brand-catalogue-source.js';
import type { NodeFetchInit, NodeFetchResponse } from '../public-page/node-https-fetch.js';
import { extractSearchResultProps, SharedPropsNotFoundError } from '../public-page/shared-props.js';
import {
  normalizeTrendyolBrandCataloguePage,
  TrendyolBrandCatalogueSchemaError,
} from './normalize.js';
import { TrendyolBrandCatalogueSource } from './source.js';

const pageHtml = readFileSync(new URL('../fixtures/brand-catalogue-page.html', import.meta.url), 'utf8');

function response(body: string, status = 200, url = 'https://www.trendyol.com/sr?wb=104703&pi=1'): NodeFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    text: async () => body,
  };
}

function sourceWith(
  fetchFn: (url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>,
  overrides: { readonly nowMs?: () => number } = {},
): TrendyolBrandCatalogueSource {
  return new TrendyolBrandCatalogueSource({
    fetchFn,
    userAgent: 'test-agent',
    // A full bucket and no real waiting: these tests assert parsing and control flow, not timing.
    requestsPerMinute: 6000,
    burst: 100,
    sleep: async () => {},
    ...overrides,
  });
}

describe('search-result state extraction', () => {
  it('finds the payload by marker, not by script position', () => {
    // The fixture puts a decoy `window.decoy = {"product":…}` script first, mirroring the
    // legacy scraper's `/html/body/script[1]` bug (doc 04 §1.5, doc 09 §22).
    const state = extractSearchResultProps(pageHtml) as { data: { products: unknown[] } };
    expect(state.data.products).toHaveLength(3);
  });

  it('reads the bracket-form assignment the hyphenated marker forces', () => {
    // `__single-search-result__PROPS` is not a valid JS identifier, so it can only ever appear
    // as window["…"]= — the `=` sits past the closing `"]`.
    expect(pageHtml).toContain('window["__single-search-result__PROPS"]=');
    expect(() => extractSearchResultProps(pageHtml)).not.toThrow();
  });

  it('raises the typed parse error when the marker is absent', () => {
    expect(() => extractSearchResultProps('<html><body>nothing here</body></html>')).toThrow(
      SharedPropsNotFoundError,
    );
  });
});

describe('normalisation', () => {
  const page = normalizeTrendyolBrandCataloguePage(extractSearchResultProps(pageHtml));

  it('maps a fully populated card', () => {
    const product = page.products.find((p) => p.productRef === '2250165');
    expect(product).toBeDefined();
    expect(product!.brandName).toBe('Whiskas');
    expect(product!.categoryRef).toBe('1030');
    expect(product!.categoryName).toBe('Kedi Kuru Maması');
    expect(product!.ratingCount).toBe(219);
    expect(product!.buyboxSellerRef).toBe('575543');
    expect(product!.url).toContain('-p-2250165');
  });

  it('converts price to exact kurus through a decimal string, never a float', () => {
    const product = page.products.find((p) => p.productRef === '2250165');
    expect(product!.price).toEqual(Money.fromMajorUnitsString('908.00'));
    expect(product!.price!.toKurus()).toBe(90800n);
  });

  it('returns the storefront brand id, not the internal one', () => {
    // Whiskas is brandId 14722 and webBrands[0].id 104703. Only the latter is what `wb=`
    // addresses, so only the latter can be compared against the query that produced the sweep.
    const product = page.products.find((p) => p.productRef === '2250165');
    expect(product!.brandRef).toBe('104703');
  });

  it('reports an unrated product as null, never as zero', () => {
    // "Nobody has rated this" drives the dead-product suggestion; "we could not read it" must
    // not be mistaken for it.
    const unrated = page.products.find((p) => p.ratingCount === null);
    expect(unrated).toBeDefined();
    expect(unrated!.ratingAverage).toBeNull();
  });

  it('keeps a product listed in an unrelated category', () => {
    // The Halı card. A brand-owner audit exists precisely to surface these, so the normaliser
    // must never quietly drop a card for having a surprising category.
    const odd = page.products.find((p) => p.categoryName === 'Halı');
    expect(odd).toBeDefined();
    expect(odd!.brandName).toBe('Whiskas');
  });

  it('reports the marketplace total and per-page diagnostics', () => {
    expect(page.totalProducts).toBe(887);
    expect(page.diagnostics.stateFound).toBe(true);
    expect(page.diagnostics.dataFound).toBe(true);
    expect(page.diagnostics.rawCardCount).toBe(3);
    expect(page.diagnostics.droppedCount).toBe(0);
  });

  it('drops a card with no identity and counts it', () => {
    const result = normalizeTrendyolBrandCataloguePage({
      data: { total: 2, products: [{ name: 'no ids at all' }, { contentId: 9, name: 'fine' }] },
    });
    expect(result.products).toHaveLength(1);
    expect(result.diagnostics.rawCardCount).toBe(2);
    expect(result.diagnostics.droppedCount).toBe(1);
  });

  it('normalises a payload with no products to an empty page rather than throwing', () => {
    // This is what the end of a catalogue looks like; a paging caller must terminate on data.
    const result = normalizeTrendyolBrandCataloguePage({ data: { total: 0 } });
    expect(result.products).toEqual([]);
    expect(result.diagnostics.dataFound).toBe(true);
  });

  it('refuses to guess when products is present but not an array', () => {
    expect(() => normalizeTrendyolBrandCataloguePage({ data: { products: { '0': {} } } })).toThrow(
      TrendyolBrandCatalogueSchemaError,
    );
  });
});

describe('url construction', () => {
  const source = sourceWith(async () => response(pageHtml));

  it('uses the brand id when one is given', () => {
    const url = source.buildUrl({ brandRef: '104703', searchTerm: null }, 3);
    expect(url).toContain('wb=104703');
    expect(url).toContain('pi=3');
    expect(url).not.toContain('q=');
  });

  it('uses the search term when no brand id is given', () => {
    const url = source.buildUrl({ brandRef: null, searchTerm: 'whiskas' }, 1);
    expect(url).toContain('q=whiskas');
    expect(url).not.toContain('wb=');
  });

  it('never intersects the two selectors', () => {
    // The whole point of carrying both is to compare their results; ANDing them would produce
    // a third answer that is neither, and would hide exactly the rows the comparison looks for.
    const url = source.buildUrl({ brandRef: '104703', searchTerm: 'whiskas' }, 1);
    expect(url).toContain('wb=104703');
    expect(url).not.toContain('q=whiskas');
  });

  it('rejects a query with no selector at all', () => {
    expect(() => source.buildUrl({ brandRef: null, searchTerm: '  ' }, 1)).toThrow(BrandCatalogueError);
    expect(hasBrandCatalogueQuery({ brandRef: null, searchTerm: '  ' })).toBe(false);
  });
});

describe('fetching', () => {
  const query = { brandRef: '104703', searchTerm: null };

  it('returns a normalised page', async () => {
    const source = sourceWith(async () => response(pageHtml));
    const page = await source.fetchPage(query, 1);
    expect(page.marketplaceCode).toBe('trendyol');
    expect(page.pageIndex).toBe(1);
    expect(page.products).toHaveLength(3);
    expect(page.fromCache).toBe(false);
  });

  it('treats 404 past the last page as an empty page, not a failure', async () => {
    // Measured live: page 38 of Whiskas' 37 and page 210 of Royal Canin's 203 both answer 404.
    const source = sourceWith(async () => response('', 404));
    const page = await source.fetchPage(query, 38);
    expect(page.products).toEqual([]);
    expect(page.totalProducts).toBeNull();
    expect(page.diagnostics.dataFound).toBe(false);
  });

  it('raises fetchFailed on any other non-2xx status', async () => {
    const source = sourceWith(async () => response('', 500));
    await expect(source.fetchPage(query, 1)).rejects.toMatchObject({
      name: 'BrandCatalogueError',
      kind: 'fetchFailed',
      httpStatus: 500,
    });
  });

  it('retries a 403 and succeeds, spending a token per attempt', async () => {
    const fetchFn = vi
      .fn<(url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>>()
      .mockResolvedValueOnce(response('', 403))
      .mockResolvedValueOnce(response(pageHtml));
    const source = sourceWith(fetchFn);
    const page = await source.fetchPage(query, 1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(page.products).toHaveLength(3);
  });

  it('does not retry a status other than 403', async () => {
    const fetchFn = vi
      .fn<(url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>>()
      .mockResolvedValue(response('', 502));
    const source = sourceWith(fetchFn);
    await expect(source.fetchPage(query, 1)).rejects.toBeInstanceOf(BrandCatalogueError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('raises parseFailed when the page carries no state', async () => {
    const source = sourceWith(async () => response('<html><body>blocked</body></html>'));
    await expect(source.fetchPage(query, 1)).rejects.toMatchObject({ kind: 'parseFailed' });
  });

  it('serves a repeated page from cache without a second request', async () => {
    const fetchFn = vi
      .fn<(url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>>()
      .mockResolvedValue(response(pageHtml));
    const source = sourceWith(fetchFn);
    await source.fetchPage(query, 1);
    const second = await source.fetchPage(query, 1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(second.fromCache).toBe(true);
  });

  it('expires the cache after its ttl', async () => {
    const fetchFn = vi
      .fn<(url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>>()
      .mockResolvedValue(response(pageHtml));
    let now = 0;
    const source = sourceWith(fetchFn, { nowMs: () => now });
    await source.fetchPage(query, 1);
    now = 11 * 60_000;
    await source.fetchPage(query, 1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('caches per page index, never across them', async () => {
    const fetchFn = vi
      .fn<(url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>>()
      .mockResolvedValue(response(pageHtml));
    const source = sourceWith(fetchFn);
    await source.fetchPage(query, 1);
    await source.fetchPage(query, 2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
