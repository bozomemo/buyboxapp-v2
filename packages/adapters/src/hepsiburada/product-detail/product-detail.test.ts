/**
 * Fixture-backed tests for the Hepsiburada product detail path (api-references §2.14).
 *
 * `fixtures/product-detail-page.html` is the live redux store of 2026-08-28 for
 * `HBCV00006POXK3`, trimmed to the fields this parser reads — plus, deliberately, the truncated
 * `listings` array and its `hasMoreListings: true`, so the test that proves they never escape
 * has something real to prove it against.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ProductDetailError } from '../../ports/product-detail-source.js';
import { extractReduxStoreState } from '../public-page/embedded-state.js';
import {
  HepsiburadaProductDetailSchemaError,
  HepsiburadaProductMismatchError,
  normalizeHepsiburadaProductDetail,
} from './normalize.js';
import { HepsiburadaProductDetailSource } from './source.js';

const DETAIL_HTML = readFileSync(
  fileURLToPath(new URL('../fixtures/product-detail-page.html', import.meta.url)),
  'utf8',
);

const SKU = 'HBCV00006POXK3';
const URL_PATH = '/whiskas-tavuklu-yas-kedi-mamasi-85-gr-24-adet-pm-HBC00006POXK2';

function respond(body: string, status = 200, url = `https://www.hepsiburada.com${URL_PATH}`): Response {
  const response = new Response(body, { status, headers: { 'content-type': 'text/html' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('product detail normalisation (api-references §2.14)', () => {
  const { detail, diagnostics } = normalizeHepsiburadaProductDetail(
    extractReduxStoreState(DETAIL_HTML),
    SKU,
  );

  it('reads the barcode, which is the only reason this path exists', () => {
    expect(detail.barcode).toBe('8681002995109');
  });

  it('carries the identities a match is built on, and the brand slug', () => {
    expect(detail.productRef).toBe(SKU);
    expect(detail.parentProductRef).toBe('HBC00006POXK2');
    expect(detail.brandRef).toBe('whiskas');
    expect(detail.brandName).toBe('Whiskas');
  });

  it('takes the deepest category, not the first crumb', () => {
    expect(detail.categoryName).toBe('Yetişkin Kedi Konserveleri');
    expect(detail.categoryRef).toBe('60006985');
  });

  it('reports whether the marketplace still shows the product', () => {
    expect(detail.isLive).toBe(true);
  });

  it('ignores `isClosedProduct`, which the live payload sets true on a product that is on sale', () => {
    // Measured 2026-08-28: the verified product carries isProductLive AND isClosedProduct both
    // true while six sellers offer it. Reading the decisive-sounding one would report a live
    // product as gone.
    const result = normalizeHepsiburadaProductDetail(
      { productState: { product: { sku: SKU, isProductLive: true, isClosedProduct: true } } },
      SKU,
    );
    expect(result.detail.isLive).toBe(true);
  });

  it('records that the page truncated its seller list without reading it', () => {
    expect(diagnostics.sellerListWasTruncated).toBe(true);
  });

  describe('the truncated seller list never escapes (Faz 8 definition of done)', () => {
    it('has nowhere to put a price, a seller, a rank or a stock figure', () => {
      // The measured trap: the page carries 2 of 6 sellers and looks complete. The guarantee is
      // structural — walk the whole output and there is no field a seller could live in.
      const seen: string[] = [];
      const walk = (value: unknown): void => {
        if (Array.isArray(value)) {
          for (const item of value) walk(item);
          return;
        }
        if (typeof value === 'object' && value !== null) {
          for (const [key, child] of Object.entries(value)) {
            seen.push(key.toLowerCase());
            walk(child);
          }
        }
      };
      walk(detail);
      for (const forbidden of [
        'listings',
        'merchantid',
        'merchantname',
        'price',
        'prices',
        'buyboxorder',
        'rank',
        'quantity',
        'iswinner',
      ]) {
        expect(seen).not.toContain(forbidden);
      }
    });

    it('does not carry the merchant the page named, in any field', () => {
      expect(JSON.stringify(detail)).not.toContain('HeyMama');
      expect(JSON.stringify(detail)).not.toContain('671.16');
    });
  });

  it('refuses a page about a different product rather than storing its barcode', () => {
    expect(() => normalizeHepsiburadaProductDetail(extractReduxStoreState(DETAIL_HTML), 'HBCV0OTHER')).toThrow(
      HepsiburadaProductMismatchError,
    );
  });

  it('refuses a store of the wrong shape', () => {
    expect(() => normalizeHepsiburadaProductDetail({}, SKU)).toThrow(HepsiburadaProductDetailSchemaError);
    expect(() => normalizeHepsiburadaProductDetail({ productState: { product: {} } }, SKU)).toThrow(
      HepsiburadaProductDetailSchemaError,
    );
  });

  it('leaves liveness unknown when the page states nothing about it', () => {
    const result = normalizeHepsiburadaProductDetail({ productState: { product: { sku: SKU } } }, SKU);
    expect(result.detail.isLive).toBeNull();
  });

  it('leaves a barcode the page did not state as null, never as an empty string', () => {
    const result = normalizeHepsiburadaProductDetail(
      { productState: { product: { sku: SKU, barcode: '  ' } } },
      SKU,
    );
    expect(result.detail.barcode).toBeNull();
  });
});

describe('HepsiburadaProductDetailSource', () => {
  const userAgent = 'BuyBoxApp/1.0 (repricing; reporting-only)';
  const source = (fetchFn: typeof fetch) =>
    new HepsiburadaProductDetailSource({ fetchFn, userAgent, nowMs: () => 1_000, burst: 50 });

  it('uses the url the sweep captured, absolute or site-relative', () => {
    const instance = source(async () => respond(DETAIL_HTML));
    expect(instance.buildUrl(SKU, URL_PATH)).toBe(`https://www.hepsiburada.com${URL_PATH}`);
    expect(instance.buildUrl(SKU, `https://www.hepsiburada.com${URL_PATH}`)).toBe(
      `https://www.hepsiburada.com${URL_PATH}`,
    );
  });

  it('refuses to invent a url when none was captured', () => {
    // `/p-{sku}` was measured to 404 on 2026-08-28, and a slug is display text.
    const instance = source(async () => respond(DETAIL_HTML));
    expect(() => instance.buildUrl(SKU, null)).toThrow(ProductDetailError);
    expect(() => instance.buildUrl(SKU, '   ')).toThrow(ProductDetailError);
  });

  it('identifies itself honestly', async () => {
    let seen: Headers | undefined;
    const instance = source(async (_url, init) => {
      seen = new Headers(init?.headers);
      return respond(DETAIL_HTML);
    });
    await instance.fetchProductDetail(SKU, URL_PATH);
    expect(seen?.get('user-agent')).toBe(userAgent);
    expect(seen?.get('sec-fetch-site')).toBeNull();
    expect(seen?.get('cookie')).toBeNull();
  });

  it('returns the detail with the url it read', async () => {
    const instance = source(async () => respond(DETAIL_HTML));
    const snapshot = await instance.fetchProductDetail(SKU, URL_PATH);
    expect(snapshot.detail.marketplaceCode).toBe('hepsiburada');
    expect(snapshot.detail.barcode).toBe('8681002995109');
    expect(snapshot.fetchedUrl).toBe(`https://www.hepsiburada.com${URL_PATH}`);
    expect(snapshot.fromCache).toBe(false);
  });

  it('reports a page about another product as identityMismatch, not as a parse failure', async () => {
    const instance = source(async () => respond(DETAIL_HTML));
    await expect(instance.fetchProductDetail('HBCV0OTHER', URL_PATH)).rejects.toMatchObject({
      kind: 'identityMismatch',
    });
  });

  it('reports a redesigned page as a parse failure rather than a product with no barcode', async () => {
    const instance = source(async () => respond('<html><body>redesigned</body></html>'));
    await expect(instance.fetchProductDetail(SKU, URL_PATH)).rejects.toMatchObject({
      kind: 'parseFailed',
    });
  });

  it('reports a 404 as a fetch failure', async () => {
    const instance = source(async () => respond('missing', 404));
    await expect(instance.fetchProductDetail(SKU, URL_PATH)).rejects.toMatchObject({
      kind: 'fetchFailed',
      httpStatus: 404,
    });
  });

  it('serves a repeat request from cache', async () => {
    let calls = 0;
    const instance = source(async () => {
      calls += 1;
      return respond(DETAIL_HTML);
    });
    await instance.fetchProductDetail(SKU, URL_PATH);
    const again = await instance.fetchProductDetail(SKU, URL_PATH);
    expect(calls).toBe(1);
    expect(again.fromCache).toBe(true);
  });
});
