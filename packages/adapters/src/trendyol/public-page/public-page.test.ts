/**
 * Trendyol public-page scraper tests. Fixture-backed only — never a live call (doc 10 §10).
 *
 * The assertions track `docs/trendyol-merchants-scraping-guide.md` section by section, and
 * several of them exist specifically to pin behaviour the legacy scraper got wrong
 * (doc 04 §1.5, doc 09 §22).
 */
import { readFileSync } from 'node:fs';
import { Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import { CompetitorSourceError } from '../../ports/competitor-source.js';
import { normalizeTrendyolPage, TrendyolPageSchemaError } from './normalize.js';
import { extractSharedProps, readBalancedObject, SharedPropsNotFoundError } from './shared-props.js';
import { TrendyolPublicPageSource } from './source.js';

const pageHtml = readFileSync(new URL('../fixtures/public-page.html', import.meta.url), 'utf8');

function htmlResponse(
  body: string,
  status = 200,
  url = 'https://www.trendyol.com/dyson/v12-p-757251065',
): Response {
  const response = new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('shared-props extraction (guide §1, §2)', () => {
  it('finds the script by marker, not by DOM position', () => {
    // The fixture puts two decoy <script> elements before the payload; the legacy
    // `/html/body/script[1]` selector would have picked the wrong one (doc 04 §1.5).
    const state = extractSharedProps(pageHtml) as { product: { id: number } };
    expect(state.product.id).toBe(757251065);
  });

  it('balanced-brace parsing survives a "}};" sequence inside a JSON string', () => {
    // The legacy parser cut from `{"product"` to the first `}};` — the fixture contains that
    // exact sequence inside a string value, which would have truncated the payload.
    const state = extractSharedProps(pageHtml) as { hint: string; product: unknown };
    expect(state.hint).toContain('}};');
    expect(state.product).toBeTypeOf('object');
  });

  it('readBalancedObject does not count braces inside strings or escaped quotes', () => {
    const source = String.raw`{"a":"{{ \" }}","b":{"c":1}} trailing`;
    expect(readBalancedObject(source, 0)).toBe(String.raw`{"a":"{{ \" }}","b":{"c":1}}`);
  });

  it('reads a JSON.parse("…") assignment as well as a bare object literal', () => {
    const payload = JSON.stringify({ product: { id: 5, merchantListing: {} } });
    const html = `<html><body><script>window.__envoy__SHARED_PROPS = JSON.parse(${JSON.stringify(payload)});</script></body></html>`;
    expect(extractSharedProps(html)).toEqual({ product: { id: 5, merchantListing: {} } });
  });

  it('throws a typed error when the marker is absent', () => {
    expect(() => extractSharedProps('<html><body><script>var x = 1;</script></body></html>')).toThrow(
      SharedPropsNotFoundError,
    );
  });

  it('throws a typed error when the payload is not valid JSON', () => {
    const html = '<html><body><script>window.__envoy__SHARED_PROPS = {nope:};</script></body></html>';
    expect(() => extractSharedProps(html)).toThrow(SharedPropsNotFoundError);
  });
});

describe('offer normalisation (guide §5–§24)', () => {
  const { offers, diagnostics } = normalizeTrendyolPage(extractSharedProps(pageHtml));

  it('§7: emits the winner joined from merchant + winnerVariant, plus every other listing variant', () => {
    // 1 winner + SATÜRN(1) + Mega Teknoloji(2) + Stoksuz(1) = 5 offers from 4 merchants.
    expect(offers).toHaveLength(5);
    expect(diagnostics.otherMerchantCount).toBe(3);
    expect(diagnostics.merchantCount).toBe(4);
    expect(diagnostics.listingCount).toBe(5);
  });

  it('§22: the winner flag comes from its position, not from being cheapest', () => {
    expect(offers.filter((o) => o.isWinner)).toHaveLength(1);
    expect(offers[0]!.isWinner).toBe(true);
    expect(offers[0]!.rank).toBe(1);
    expect(offers[0]!.sellerRef).toBe('736424');
    expect(offers[0]!.sellerName).toBe('Cansu Beauty'); // trimmed, per doc 01 §7
  });

  it('§8, §10: merchant id and listing id are separate identifiers', () => {
    expect(offers[0]!.sellerRef).toBe('736424');
    expect(offers[0]!.listingRef).toBe('6977358e4229a736c25b131ecb61f8eb');
    expect(offers[1]!.sellerRef).toBe('514600');
    expect(offers[1]!.listingRef).toBe('260d03dd4e1a963dc138b6c1951238ce');
  });

  it('§12: one merchant with two variants produces two offers, both carrying its identity', () => {
    const mega = offers.filter((o) => o.sellerRef === '992001');
    expect(mega).toHaveLength(2);
    expect(mega.map((o) => o.listingRef)).toEqual(['aaa111', 'bbb222']);
  });

  it('§14, §15: prices come from numeric `value` in lira and become exact kuruş', () => {
    expect(offers[0]!.price?.toKurus()).toBe(3_501_000n); // 35.010 TL → 35010,00 ₺
    expect(offers[0]!.finalPrice?.toKurus()).toBe(3_450_050n); // couponApplicablePrice 34500,50 ₺
    expect(offers[1]!.price?.toKurus()).toBe(3_999_900n);
  });

  it('§15: the final price falls back to the shelf price when there is no coupon price', () => {
    expect(offers[1]!.finalPrice?.toKurus()).toBe(offers[1]!.price?.toKurus());
  });

  it('§16: "NaN TL" with no numeric value normalises to null, never to a number', () => {
    const stockless = offers.find((o) => o.sellerRef === '300777')!;
    expect(stockless.price).toBeNull();
    expect(stockless.finalPrice).toBeNull();
  });

  it('§9: the seller score is sellerScore.value; absent is null, never -1', () => {
    expect(offers[0]!.sellerRating).toBe(9.2);
    expect(offers[1]!.sellerRating).toBe(9);
    expect(offers.find((o) => o.sellerRef === '300777')!.sellerRating).toBeNull();
  });

  it('§17: an unsellable offer is zero stock; a quantity is used as given', () => {
    expect(offers[0]!.offeredStock).toBe(4);
    expect(offers.find((o) => o.sellerRef === '300777')!.offeredStock).toBe(0);
  });

  it('§19, §26: promotion presence is structural; the Turkish name is data, never a selector', () => {
    expect(offers[0]!.hasPromotion).toBe(true);
    expect(offers[0]!.promotionText).toBe('Kargo Bedava');
    expect(offers[1]!.hasPromotion).toBe(false);
    expect(offers[1]!.promotionText).toBeNull();
  });

  it('§29: no merchant tax/contact metadata leaks into the normalised offer', () => {
    const serialised = JSON.stringify(offers);
    expect(serialised).not.toContain('taxNumber');
    expect(serialised).not.toContain('registeredEmailAddress');
    expect(serialised).not.toContain('officialName');
  });

  it('§18: rush-delivery hours are not smuggled in as dispatch-time days', () => {
    expect(offers[0]!.dispatchTime).toBeNull();
  });

  it('§32: a merchantListing that arrives as an array is a schema mismatch, not a guess', () => {
    expect(() => normalizeTrendyolPage({ product: { merchantListing: [{ merchant: { id: 1 } }] } })).toThrow(
      TrendyolPageSchemaError,
    );
  });

  it('§32: a missing merchantListing yields zero offers and honest diagnostics, not a throw', () => {
    const result = normalizeTrendyolPage({ product: { id: 1 } });
    expect(result.offers).toEqual([]);
    expect(result.diagnostics.productFound).toBe(true);
    expect(result.diagnostics.merchantListingFound).toBe(false);
    expect(result.diagnostics.winnerVariantFound).toBe(false);
  });

  it('§13: a merchant-level price is used when the variant carries none', () => {
    const result = normalizeTrendyolPage({
      product: {
        merchantListing: {
          otherMerchants: [
            {
              id: 42,
              name: 'Fallback',
              price: { discountedPrice: { value: 100 } },
              variants: [{ listingId: 'x', quantity: 1 }],
            },
          ],
        },
      },
    });
    expect(result.offers[0]!.price?.toKurus()).toBe(Money.fromMajorUnitsString('100.00').toKurus());
  });
});

describe('TrendyolPublicPageSource (doc 07 §7)', () => {
  function build(overrides: Partial<Parameters<typeof createSource>[0]> = {}) {
    return createSource(overrides);
  }

  function createSource(options: {
    readonly html?: string;
    readonly status?: number;
    readonly nowMs?: () => number;
    readonly cacheTtlMs?: number;
  }) {
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      calls.push(typeof input === 'string' ? input : input.toString());
      return htmlResponse(options.html ?? pageHtml, options.status ?? 200);
    };
    const source = new TrendyolPublicPageSource({
      fetchFn,
      userAgent: 'BuyBoxApp/1.0 (+reporting)',
      // A high rate so the tests never actually sleep; the limiter itself is unit-tested
      // separately in reliability/rate-limiter.test.ts.
      requestsPerMinute: 600_000,
      burst: 100,
      cacheTtlMs: options.cacheTtlMs,
      nowMs: options.nowMs,
    });
    return { source, calls };
  }

  it('builds the product URL from contentId when no productUrl was captured (doc 04 §1.5)', () => {
    const { source } = build({});
    expect(source.buildUrl({ url: null, contentId: '757251065' })).toBe(
      'https://www.trendyol.com/marka/urun-p-757251065',
    );
  });

  it('prefers the marketplace-supplied productUrl (api-references §1.4)', () => {
    const { source } = build({});
    expect(source.buildUrl({ url: 'https://www.trendyol.com/dyson/v12-p-757251065', contentId: '1' })).toBe(
      'https://www.trendyol.com/dyson/v12-p-757251065',
    );
    expect(source.buildUrl({ url: '/dyson/v12-p-757251065', contentId: null })).toBe(
      'https://www.trendyol.com/dyson/v12-p-757251065',
    );
  });

  it('fails typed, not silently, when a listing has no page reference at all', () => {
    const { source } = build({});
    expect(() => source.buildUrl({ url: null, contentId: null })).toThrow(CompetitorSourceError);
  });

  it('returns normalised offers and records the post-redirect canonical URL', async () => {
    const { source } = build({});
    const snapshot = await source.fetchProductOffers({ url: null, contentId: '757251065' });
    expect(snapshot.offers).toHaveLength(5);
    expect(snapshot.fetchedUrl).toBe('https://www.trendyol.com/dyson/v12-p-757251065');
    expect(snapshot.fromCache).toBe(false);
    expect(snapshot.diagnostics.extractionMethod).toBe('embeddedJson');
  });

  it('serves an identical request from cache within the TTL, and refetches after it (doc 07 §7)', async () => {
    let now = 1_000_000;
    const { source, calls } = build({ nowMs: () => now, cacheTtlMs: 60_000 });
    const ref = { url: null, contentId: '757251065' };

    await source.fetchProductOffers(ref);
    const second = await source.fetchProductOffers(ref);
    expect(calls).toHaveLength(1);
    expect(second.fromCache).toBe(true);

    now += 60_001;
    const third = await source.fetchProductOffers(ref);
    expect(calls).toHaveLength(2);
    expect(third.fromCache).toBe(false);
  });

  it('raises fetchFailed on a non-2xx response (doc 05 §5 status)', async () => {
    const { source } = build({ status: 503 });
    await expect(source.fetchProductOffers({ url: null, contentId: '1' })).rejects.toMatchObject({
      name: 'CompetitorSourceError',
      kind: 'fetchFailed',
    });
  });

  it('raises parseFailed — distinct from fetchFailed — when the page shape changed', async () => {
    const { source } = build({ html: '<html><body><p>bakım</p></body></html>' });
    await expect(source.fetchProductOffers({ url: null, contentId: '1' })).rejects.toMatchObject({
      name: 'CompetitorSourceError',
      kind: 'parseFailed',
    });
  });

  it('sends the configured User-Agent (doc 04 §1.5 requires a user-agent policy)', async () => {
    let seen: string | undefined;
    const fetchFn: typeof fetch = async (_input, init) => {
      seen = new Headers(init?.headers).get('User-Agent') ?? undefined;
      return htmlResponse(pageHtml);
    };
    const source = new TrendyolPublicPageSource({ fetchFn, userAgent: 'BuyBoxApp/1.0 (+reporting)' });
    await source.fetchProductOffers({ url: null, contentId: '1' });
    expect(seen).toBe('BuyBoxApp/1.0 (+reporting)');
  });
});
