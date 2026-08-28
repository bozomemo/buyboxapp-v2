/**
 * Hepsiburada public-listings tests. Fixture-backed only — never a live call (doc 10 §10).
 *
 * The fixture is the **recorded live response** for SKU `BS1372` captured on 2026-08-13
 * (api-references §2.11), so the numeric assertions below are real marketplace values rather
 * than invented ones.
 */
import { readFileSync } from 'node:fs';
import { Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import { CompetitorSourceError } from '../../ports/competitor-source.js';
import { HepsiburadaListingsSchemaError, normalizeHepsiburadaListings } from './normalize.js';
import { buildHepsiburadaPublicHeaders, HepsiburadaPublicListingsSource } from './source.js';

const fixtureJson = readFileSync(new URL('../fixtures/public-listings-BS1372.json', import.meta.url), 'utf8');
const fixture: unknown = JSON.parse(fixtureJson);

const REF = { url: 'https://www.hepsiburada.com/a4tech-xl-750bh-oyun-p-BS1372', contentId: 'BS1372' };

function jsonResponse(
  body: string,
  status = 200,
  url = 'https://www.hepsiburada.com/api/v1/product/listings/BS1372',
): Response {
  const response = new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('normalizeHepsiburadaListings — recorded BS1372 response', () => {
  const result = normalizeHepsiburadaListings(fixture);

  it('reads every seller as one offer', () => {
    expect(result.offers).toHaveLength(10);
    expect(result.diagnostics.listingCount).toBe(10);
    expect(result.diagnostics.merchantCount).toBe(10);
    expect(result.diagnostics.otherMerchantCount).toBe(9);
    expect(result.diagnostics.extractionMethod).toBe('publicJsonApi');
  });

  it('takes the buybox holder from the marketplace flag, not from the lowest price', () => {
    const winners = result.offers.filter((offer) => offer.isWinner);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.sellerName).toBe('Nethouse');
    expect(winners[0]?.rank).toBe(1);
    expect(result.diagnostics.winnerMerchantFound).toBe(true);
  });

  it('identifies sellers by merchantId, never by name', () => {
    expect(result.offers[0]?.sellerRef).toBe('b38d2d14-6ccf-4fc8-a543-c85dfab931f3');
    // The seller's own offer id is a different value and is kept separately.
    expect(result.offers[0]?.listingRef).toBe('6c515fd6-66cc-46e1-bf27-4442084ebdf4');
    expect(result.offers[0]?.listingRef).not.toBe(result.offers[0]?.sellerRef);
  });

  it('converts prices to exact kuruş from major units', () => {
    // `value: 1379` renders as "1.379,00" in the payload's own `formattedPrice`.
    expect(result.offers[0]?.price?.toKurus()).toBe(137_900n);
    // A fractional price must survive exactly, with no float drift: 1511.35 TL.
    expect(result.offers[2]?.price?.toKurus()).toBe(151_135n);
    expect(result.offers[2]?.price).toEqual(Money.fromMajorUnitsString('1511.35'));
  });

  it('leaves finalPrice unknown rather than guessing at a segmented price', () => {
    // `minimumPrices` is keyed "10" / "30" / "non-segmented-price" and its audience is
    // unconfirmed (api-references §2.11).
    expect(result.offers.every((offer) => offer.finalPrice === null)).toBe(true);
  });

  it('maps dispatch time only because the payload states the unit is business days', () => {
    expect(result.offers[0]?.dispatchTime).toBe(0);
    expect(result.offers[2]?.dispatchTime).toBe(1);
  });

  it('orders offers by buyboxOrder and ranks them densely from 1', () => {
    expect(result.offers.map((offer) => offer.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const prices = result.offers.map((offer) => offer.price?.toKurus() ?? 0n);
    // Buybox order happens to be ascending by price here; the assertion is that rank 1 is the
    // flagged winner, not that we sorted by price ourselves.
    expect(prices[0]).toBeLessThan(prices[9] ?? 0n);
  });

  it('carries seller rating as a 0–10 number', () => {
    expect(result.offers[0]?.sellerRating).toBe(9.6);
  });

  it('does not leak marketing slugs into promotion text', () => {
    // `paymentTag` and `tagList` are full of Turkish campaign slugs; none of them is a promotion
    // name, so `promotionText` stays null while `hasPromotion` is decided structurally.
    expect(result.offers.every((offer) => offer.promotionText === null)).toBe(true);
    expect(JSON.stringify(result.offers)).not.toContain('kacmaz-firsatlar');
  });
});

describe('normalizeHepsiburadaListings — defensive rules', () => {
  function payload(listings: unknown): unknown {
    return { statusCode: 200, data: { listings } };
  }

  it('reports an unsellable offer as zero stock regardless of its quantity', () => {
    const result = normalizeHepsiburadaListings(
      payload([{ merchantId: 'm1', buyboxOrder: 1, isSalable: false, quantity: 40 }]),
    );
    expect(result.offers[0]?.offeredStock).toBe(0);
  });

  it('leaves stock unknown rather than zero when the payload gives no quantity', () => {
    const result = normalizeHepsiburadaListings(payload([{ merchantId: 'm1', buyboxOrder: 1 }]));
    expect(result.offers[0]?.offeredStock).toBeNull();
  });

  it('leaves dispatch time unknown when the shipment unit is not business days', () => {
    const result = normalizeHepsiburadaListings(
      payload([{ merchantId: 'm1', buyboxOrder: 1, shipmentDay: 3, shipmentType: 'hours' }]),
    );
    expect(result.offers[0]?.dispatchTime).toBeNull();
  });

  it('reports a missing rating as null, never as a sentinel', () => {
    const result = normalizeHepsiburadaListings(payload([{ merchantId: 'm1', buyboxOrder: 1 }]));
    expect(result.offers[0]?.sellerRating).toBeNull();
  });

  it('sorts an out-of-order payload and puts offers with no buyboxOrder last', () => {
    const result = normalizeHepsiburadaListings(
      payload([
        { merchantId: 'c', buyboxOrder: 3 },
        { merchantId: 'x' },
        { merchantId: 'a', buyboxOrder: 1 },
        { merchantId: 'b', buyboxOrder: 2 },
      ]),
    );
    expect(result.offers.map((offer) => offer.sellerRef)).toEqual(['a', 'b', 'c', 'x']);
    expect(result.offers[3]?.isWinner).toBe(false);
  });

  it('treats an empty seller list as an honest zero, not a failure', () => {
    const result = normalizeHepsiburadaListings(payload([]));
    expect(result.offers).toHaveLength(0);
    expect(result.diagnostics.merchantListingFound).toBe(true);
    expect(result.diagnostics.winnerMerchantFound).toBe(false);
  });

  it('reports honest diagnostics when the payload carries no listings at all', () => {
    const result = normalizeHepsiburadaListings({ statusCode: 200, data: {} });
    expect(result.diagnostics.productFound).toBe(true);
    expect(result.diagnostics.merchantListingFound).toBe(false);
    expect(result.offers).toHaveLength(0);
  });

  it('refuses to guess when listings is not an array', () => {
    expect(() => normalizeHepsiburadaListings(payload({ '0': { merchantId: 'm1' } }))).toThrow(
      HepsiburadaListingsSchemaError,
    );
  });

  it('decides hasPromotion structurally', () => {
    const withCampaign = normalizeHepsiburadaListings(
      payload([{ merchantId: 'm1', buyboxOrder: 1, campaignIds: ['c1'] }]),
    );
    expect(withCampaign.offers[0]?.hasPromotion).toBe(true);
    const withDiscount = normalizeHepsiburadaListings(
      payload([{ merchantId: 'm1', buyboxOrder: 1, discountRate: 12 }]),
    );
    expect(withDiscount.offers[0]?.hasPromotion).toBe(true);
    const without = normalizeHepsiburadaListings(
      payload([{ merchantId: 'm1', buyboxOrder: 1, campaignIds: [], discountRate: 0 }]),
    );
    expect(without.offers[0]?.hasPromotion).toBe(false);
  });
});

describe('HepsiburadaPublicListingsSource', () => {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151.0.0.0';

  function source(fetchFn: typeof fetch, nowMs?: () => number): HepsiburadaPublicListingsSource {
    return new HepsiburadaPublicListingsSource({ fetchFn, userAgent, nowMs, burst: 50 });
  }

  it('addresses the endpoint by SKU', () => {
    const instance = source(async () => jsonResponse(fixtureJson));
    expect(instance.buildUrl(REF)).toBe('https://www.hepsiburada.com/api/v1/product/listings/BS1372');
  });

  it('refuses a ref with no SKU rather than parsing one out of the product URL', () => {
    const instance = source(async () => jsonResponse(fixtureJson));
    expect(() =>
      instance.buildUrl({ url: 'https://www.hepsiburada.com/x-p-BS1372', contentId: null }),
    ).toThrow(CompetitorSourceError);
  });

  it('falls back to the SKU product page as the referer when no url was captured', () => {
    const instance = source(async () => jsonResponse(fixtureJson));
    expect(instance.buildReferer({ url: null, contentId: 'BS1372' }, 'BS1372')).toBe(
      'https://www.hepsiburada.com/p-BS1372',
    );
  });

  it('identifies itself honestly by default, and pretends to be nothing else', async () => {
    // The 2026-08-28 re-measurement: every combination recorded as 403 on 2026-08-13 now
    // answers 200, including this one. Nothing browser-shaped is sent unless asked for.
    let seen: Headers | undefined;
    const instance = source(async (_url, init) => {
      seen = new Headers(init?.headers);
      return jsonResponse(fixtureJson);
    });
    await instance.fetchProductOffers(REF);
    expect(seen?.get('user-agent')).toBe(userAgent);
    expect(seen?.get('accept-language')).toBeNull();
    expect(seen?.get('sec-fetch-site')).toBeNull();
    expect(seen?.get('referer')).toBeNull();
    // No credential is needed and none is ever sent (CLAUDE.md: no credential anywhere it does
    // not belong; api-references §2.11 records that cookies are not required).
    expect(seen?.get('cookie')).toBeNull();
  });

  it('sends the 2026-08-13 browser set only when impersonation is switched back on', async () => {
    let seen: Headers | undefined;
    const instance = new HepsiburadaPublicListingsSource({
      fetchFn: async (_url, init) => {
        seen = new Headers(init?.headers);
        return jsonResponse(fixtureJson);
      },
      userAgent,
      impersonateBrowser: true,
      burst: 50,
    });
    await instance.fetchProductOffers(REF);
    expect(seen?.get('accept-language')).toBe('tr-TR,tr;q=0.9');
    expect(seen?.get('sec-fetch-site')).toBe('same-origin');
    expect(seen?.get('referer')).toBe(REF.url);
  });

  it('exposes both header sets as one function so neither drifts by copy-paste', () => {
    expect(Object.keys(buildHepsiburadaPublicHeaders('UA', 'https://www.hepsiburada.com/x')).sort()).toEqual([
      'Accept',
      'User-Agent',
    ]);
    expect(
      Object.keys(buildHepsiburadaPublicHeaders('UA', 'https://www.hepsiburada.com/x', true)).sort(),
    ).toEqual([
      'Accept',
      'Accept-Language',
      'Referer',
      'Sec-Fetch-Dest',
      'Sec-Fetch-Mode',
      'Sec-Fetch-Site',
      'User-Agent',
    ]);
  });

  it('returns a snapshot with the offers and the fetched url', async () => {
    const instance = source(async () => jsonResponse(fixtureJson));
    const snapshot = await instance.fetchProductOffers(REF);
    expect(snapshot.marketplaceCode).toBe('hepsiburada');
    expect(snapshot.offers).toHaveLength(10);
    expect(snapshot.fromCache).toBe(false);
    expect(snapshot.fetchedUrl).toBe('https://www.hepsiburada.com/api/v1/product/listings/BS1372');
  });

  it('serves a repeat request from cache and refetches once the ttl expires', async () => {
    let calls = 0;
    let now = 1_000;
    const instance = source(
      async () => {
        calls += 1;
        return jsonResponse(fixtureJson);
      },
      () => now,
    );
    await instance.fetchProductOffers(REF);
    const cached = await instance.fetchProductOffers(REF);
    expect(calls).toBe(1);
    expect(cached.fromCache).toBe(true);

    now += 11 * 60_000;
    const fresh = await instance.fetchProductOffers(REF);
    expect(calls).toBe(2);
    expect(fresh.fromCache).toBe(false);
  });

  it('reports a 403 as fetchFailed and names the bot protection', async () => {
    const instance = source(async () => jsonResponse('<html>Güvenlik</html>', 403));
    await expect(instance.fetchProductOffers(REF)).rejects.toMatchObject({
      kind: 'fetchFailed',
      message: expect.stringContaining('Akamai'),
    });
  });

  it('reports a 200 carrying html rather than json as parseFailed', async () => {
    // The transport succeeded; the payload is unusable. Recorded, never retried as an outage.
    const instance = source(async () => jsonResponse('<!DOCTYPE html><html>…</html>'));
    await expect(instance.fetchProductOffers(REF)).rejects.toMatchObject({ kind: 'parseFailed' });
  });

  it('reports a schema change as parseFailed', async () => {
    const instance = source(async () => jsonResponse(JSON.stringify({ data: { listings: { '0': {} } } })));
    await expect(instance.fetchProductOffers(REF)).rejects.toMatchObject({ kind: 'parseFailed' });
  });
});
