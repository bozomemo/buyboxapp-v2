/**
 * Fixture-backed tests for the Hepsiburada brand catalogue (api-references §2.13).
 *
 * `fixtures/brand-catalogue-page.html` is three cards taken verbatim from the live
 * `?q=whiskas` page of 2026-08-28, wrapped in the same container the real page uses — including
 * its double escaping. `brand-catalogue-loopback.html` is what the site actually returns past
 * the last page: page 1 again, `currentPage` back to 1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BrandCatalogueError, type BrandCatalogueQuery } from '../../ports/brand-catalogue-source.js';
import { extractMoriaProductListState, HepsiburadaStateNotFoundError } from '../public-page/embedded-state.js';
import { HepsiburadaBrandCatalogueSchemaError, normalizeHepsiburadaBrandCatalogue } from './normalize.js';
import { HepsiburadaBrandCatalogueSource } from './source.js';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8');

const CATALOGUE_HTML = fixture('brand-catalogue-page.html');
const LOOPBACK_HTML = fixture('brand-catalogue-loopback.html');

const QUERY: BrandCatalogueQuery = { brandRef: null, searchTerm: 'whiskas' };

/** `Response.url` is read-only, so a fixture response is built with it defined. */
function respond(body: string, status = 200, url = 'https://www.hepsiburada.com/ara?q=whiskas'): Response {
  const response = new Response(body, { status, headers: { 'content-type': 'text/html' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('embedded state extraction', () => {
  it('reads the product list out of the JS string literal it is buried in', () => {
    const state = extractMoriaProductListState(CATALOGUE_HTML) as { data: { products: unknown[] } };
    expect(state.data.products).toHaveLength(3);
  });

  it('names the failure when the marker is gone rather than reporting an empty brand', () => {
    expect(() => extractMoriaProductListState('<html><body>nothing here</body></html>')).toThrow(
      HepsiburadaStateNotFoundError,
    );
  });

  it('does not mistake a brace inside a product name for structure', () => {
    // The double-escaping pass exists for exactly this: a `{` in a string value is not a brace.
    const state = { data: { products: [{ productId: 'X', variantList: [{ sku: 'S', name: 'A {B} C' }] }] } };
    const inner = JSON.stringify(JSON.stringify(state)).slice(1, -1);
    const html = `<script>window.MORIA.PRODUCTLIST = Object.assign({}, { 'x': { 'STATE': ${inner}, 'URL': '/ProductList' } });</script>`;
    const parsed = extractMoriaProductListState(html) as { data: { products: { variantList: { name: string }[] }[] } };
    expect(parsed.data.products[0]!.variantList[0]!.name).toBe('A {B} C');
  });
});

describe('catalogue normalisation (api-references §2.13)', () => {
  const page = normalizeHepsiburadaBrandCatalogue(extractMoriaProductListState(CATALOGUE_HTML));

  it('reads the marketplace´s own paging claims', () => {
    expect(page.totalProducts).toBe(564);
    expect(page.pageIndex).toBe(1);
    expect(page.lastPage).toBe(16);
  });

  it('identifies a row by its variant SKU, which is what the listings endpoint is keyed by', () => {
    expect(page.products.map((p) => p.productRef)).toEqual([
      'HBCV00006POXK3',
      'HBCV00009AFF5V',
      'HBV00001AW7SE',
    ]);
  });

  it('converts the lira price to exact kuruş without float arithmetic', () => {
    expect(page.products[0]!.price!.toKurus()).toBe(67116n);
  });

  it('records the buybox holder as an id, never as the shop name', () => {
    const first = page.products[0]!;
    expect(first.buyboxSellerRef).toBe('832e7a59-1ae8-4d23-9a2f-d848742bee01');
    expect(JSON.stringify(first)).not.toContain('HeyMama');
  });

  it('carries the rating count the dead-product suggestion is built on', () => {
    expect(page.products.map((p) => p.ratingCount)).toEqual([102, 7, 333]);
  });

  it('carries the category the marketplace itself assigns', () => {
    expect(page.products[0]!.categoryRef).toBe('60006985');
    expect(page.products[0]!.categoryName).toBe('Yetişkin Kedi Konserveleri');
  });

  it('leaves the brand ref null, because a card does not carry one', () => {
    // Hepsiburada's brand identity is a slug on the product page. Deriving it from the display
    // name here would be the guess this parser is forbidden to make.
    expect(page.products.every((p) => p.brandRef === null)).toBe(true);
    expect(page.products[0]!.brandName).toBe('Whiskas');
  });

  it('emits one row per variant, so a two-size product is not reported as one', () => {
    const state = {
      data: {
        totalProductCount: 2,
        currentPage: 1,
        products: [
          {
            productId: 'HBC1',
            brand: 'Whiskas',
            customerReviewCount: 9,
            variantList: [
              { sku: 'HBCV1', name: '400 g', listing: { priceInfo: { price: 10 }, merchantId: 'm1' } },
              { sku: 'HBCV2', name: '1 kg', listing: { priceInfo: { price: 20 }, merchantId: 'm2' } },
            ],
          },
        ],
      },
    };
    const result = normalizeHepsiburadaBrandCatalogue(state);
    expect(result.products.map((p) => p.productRef)).toEqual(['HBCV1', 'HBCV2']);
    // The rating belongs to the parent card and is the same number repeated, not two of them.
    expect(result.products.map((p) => p.ratingCount)).toEqual([9, 9]);
    expect(result.diagnostics.rawCardCount).toBe(1);
  });

  it('counts a variant with no SKU as dropped rather than storing an unaddressable row', () => {
    const result = normalizeHepsiburadaBrandCatalogue({
      data: { products: [{ productId: 'HBC1', variantList: [{ name: 'no sku' }] }] },
    });
    expect(result.products).toHaveLength(0);
    expect(result.diagnostics.droppedCount).toBe(1);
  });

  it('refuses a payload of the wrong shape instead of reporting a brand with no products', () => {
    expect(() => normalizeHepsiburadaBrandCatalogue({ data: { products: 'nope' } })).toThrow(
      HepsiburadaBrandCatalogueSchemaError,
    );
    expect(() => normalizeHepsiburadaBrandCatalogue({})).toThrow(HepsiburadaBrandCatalogueSchemaError);
  });
});

describe('HepsiburadaBrandCatalogueSource', () => {
  const userAgent = 'BuyBoxApp/1.0 (repricing; reporting-only)';
  const source = (fetchFn: typeof fetch, nowMs = () => 1_000) =>
    new HepsiburadaBrandCatalogueSource({ fetchFn, userAgent, nowMs, burst: 50 });

  it('addresses the catalogue by search term, and pages with `sayfa`', () => {
    const instance = source(async () => respond(CATALOGUE_HTML));
    expect(instance.buildUrl(QUERY, 1)).toBe('https://www.hepsiburada.com/ara?q=whiskas');
    expect(instance.buildUrl(QUERY, 4)).toBe('https://www.hepsiburada.com/ara?q=whiskas&sayfa=4');
  });

  it('refuses a brand-ref-only query rather than sweeping something else', () => {
    // `?markalar=whiskas` alone redirects to the home page, and combined with a search term it
    // changes nothing — measured 2026-08-28. There is no brand-id catalogue here to sweep.
    const instance = source(async () => respond(CATALOGUE_HTML));
    expect(() => instance.buildUrl({ brandRef: 'whiskas', searchTerm: null }, 1)).toThrow(
      BrandCatalogueError,
    );
  });

  it('identifies itself honestly and sends no browser-shaped header', async () => {
    let seen: Headers | undefined;
    const instance = source(async (_url, init) => {
      seen = new Headers(init?.headers);
      return respond(CATALOGUE_HTML);
    });
    await instance.fetchPage(QUERY, 1);
    expect(seen?.get('user-agent')).toBe(userAgent);
    expect(seen?.get('sec-fetch-site')).toBeNull();
    expect(seen?.get('cookie')).toBeNull();
  });

  it('returns the page with its products and the url it actually read', async () => {
    const instance = source(async () => respond(CATALOGUE_HTML));
    const page = await instance.fetchPage(QUERY, 1);
    expect(page.marketplaceCode).toBe('hepsiburada');
    expect(page.products).toHaveLength(3);
    expect(page.totalProducts).toBe(564);
    expect(page.fromCache).toBe(false);
  });

  it('ends the catalogue when the site wraps back to page 1 instead of 404ing', async () => {
    // The measured trap: page 17 of 16 answers 200 with page 1's cards. Handing those back
    // under page 17's number makes a paging loop run for ever.
    const instance = source(async () => respond(LOOPBACK_HTML));
    const page = await instance.fetchPage(QUERY, 17);
    expect(page.products).toHaveLength(0);
    expect(page.pageIndex).toBe(17);
    // The claim survives, so a caller can still see how much it did not get.
    expect(page.totalProducts).toBe(564);
  });

  it('treats a 403 past page 1 as the end of what is reachable, not as a failure', async () => {
    const instance = source(async () => respond('blocked', 403));
    const page = await instance.fetchPage(QUERY, 50);
    expect(page.products).toHaveLength(0);
  });

  it('still reports a 403 on page 1, which is a block and not a ceiling', async () => {
    const instance = source(async () => respond('blocked', 403));
    await expect(instance.fetchPage(QUERY, 1)).rejects.toThrow(BrandCatalogueError);
  });

  it('fails loudly when the page parses to nothing recognisable', async () => {
    const instance = source(async () => respond('<html><body>redesigned</body></html>'));
    await expect(instance.fetchPage(QUERY, 1)).rejects.toMatchObject({ kind: 'parseFailed' });
  });

  it('serves a repeat request from cache and refetches once the ttl expires', async () => {
    let calls = 0;
    let now = 1_000;
    const instance = new HepsiburadaBrandCatalogueSource({
      fetchFn: async () => {
        calls += 1;
        return respond(CATALOGUE_HTML);
      },
      userAgent,
      nowMs: () => now,
      burst: 50,
      cacheTtlMs: 60_000,
    });
    await instance.fetchPage(QUERY, 1);
    const cached = await instance.fetchPage(QUERY, 1);
    expect(calls).toBe(1);
    expect(cached.fromCache).toBe(true);
    now += 60_001;
    await instance.fetchPage(QUERY, 1);
    expect(calls).toBe(2);
  });

  it('never lets a failure carry a price, a rank or a seller into a caller', async () => {
    const instance = source(async () => respond('nope', 500));
    await expect(instance.fetchPage(QUERY, 1)).rejects.toBeInstanceOf(BrandCatalogueError);
  });
});
