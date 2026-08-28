/**
 * Trendyol seller-identity resolution tests (doc 06 §12.4 Faz 7, guide §29).
 *
 * Fixture-backed only — never a live call, never a real browser launch (doc 10 §10).
 *
 * The load-bearing group is "rank never escapes this path": Faz 7's definition of done is that
 * nothing read from a merchant-scoped page can be used as an ordering, and these assertions are
 * what makes that a checked property rather than a comment.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SellerIdentityError } from '../../ports/seller-identity-source.js';
import { extractSharedProps } from '../public-page/shared-props.js';
import {
  normalizeTrendyolSellerIdentity,
  TrendyolIdentityMismatchError,
  TrendyolIdentitySchemaError,
} from './normalize.js';
import { TrendyolSellerIdentitySource } from './source.js';

const pageHtml = readFileSync(new URL('../fixtures/public-page.html', import.meta.url), 'utf8');
const WINNER_REF = '736424';

function htmlResponse(
  body: string,
  status = 200,
  url = 'https://www.trendyol.com/dyson/v12-p-757251065',
): Response {
  const response = new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function sourceWith(
  fetchFn: (url: string, init: unknown) => Promise<Response>,
  overrides: Record<string, unknown> = {},
): TrendyolSellerIdentitySource {
  return new TrendyolSellerIdentitySource({
    userAgent: 'test-agent',
    fetchFn: fetchFn as never,
    nowMs: () => 1_700_000_000_000,
    sleep: async () => undefined,
    ...overrides,
  });
}

describe('identity normalisation (guide §29)', () => {
  it('reads the firm behind the storefront', () => {
    const { identity } = normalizeTrendyolSellerIdentity(extractSharedProps(pageHtml), WINNER_REF);
    expect(identity.sellerRef).toBe(WINNER_REF);
    expect(identity.officialName).toBe('Cansu Beauty Kozmetik A.Ş.');
    expect(identity.taxNumber).toBe('1234567890');
    expect(identity.registeredEmailAddress).toBe('kep@example.invalid');
  });

  it('trims the storefront name rather than storing the payload’s padding', () => {
    const { identity } = normalizeTrendyolSellerIdentity(extractSharedProps(pageHtml), WINNER_REF);
    expect(identity.sellerName).toBe('Cansu Beauty');
  });

  it('leaves a field the payload never carried as null, never as an empty string', () => {
    const { identity } = normalizeTrendyolSellerIdentity(extractSharedProps(pageHtml), WINNER_REF);
    // The observed sample carries no tax office or address. Absent is null (doc 10 §3).
    expect(identity.taxOffice).toBeNull();
    expect(identity.address).toBeNull();
    expect(identity.cityName).toBeNull();
  });

  it('counts only the identity fields it actually mapped', () => {
    const { diagnostics } = normalizeTrendyolSellerIdentity(extractSharedProps(pageHtml), WINNER_REF);
    // officialName, taxNumber, registeredEmailAddress — three of the seven §29 fields.
    expect(diagnostics.identityFieldsFound).toBe(3);
    expect(diagnostics.merchantFound).toBe(true);
    expect(diagnostics.identityMatched).toBe(true);
  });

  it('carries the barcode and stock of the listing that page showed', () => {
    const { identity } = normalizeTrendyolSellerIdentity(extractSharedProps(pageHtml), WINNER_REF);
    expect(identity.listings).toHaveLength(1);
    expect(identity.listings[0]).toMatchObject({
      listingRef: '6977358e4229a736c25b131ecb61f8eb',
      barcode: '5025155088180',
      offeredStock: 4,
    });
  });

  it('reduces an unsellable listing to zero stock rather than to the stated quantity (guide §17)', () => {
    const state = {
      product: {
        merchantListing: {
          merchant: { id: 9, taxNumber: '1' },
          winnerVariant: { listingId: 'x', quantity: 12, sellable: false },
        },
      },
    };
    const { identity } = normalizeTrendyolSellerIdentity(state, '9');
    expect(identity.listings[0]?.offeredStock).toBe(0);
  });

  it('skips the bare variant stub that repeats the winner', () => {
    // `merchantListing.variants` on the sample is `[{ itemNumber }]` — the same listing again,
    // carrying nothing this port stores. Emitting it would double every seller's listing count.
    const { identity } = normalizeTrendyolSellerIdentity(extractSharedProps(pageHtml), WINNER_REF);
    expect(identity.listings.map((listing) => listing.listingRef)).toEqual([
      '6977358e4229a736c25b131ecb61f8eb',
    ]);
  });

  it('keeps a second variant that carries a barcode of its own', () => {
    const state = {
      product: {
        merchantListing: {
          merchant: { id: 9 },
          winnerVariant: { listingId: 'a', barcode: '111', quantity: 1 },
          variants: [{ itemNumber: 5 }, { listingId: 'b', barcode: '222', quantity: 3 }],
        },
      },
    };
    const { identity } = normalizeTrendyolSellerIdentity(state, '9');
    expect(identity.listings.map((listing) => listing.barcode)).toEqual(['111', '222']);
  });
});

describe('rank never escapes this path (Faz 7 definition of done)', () => {
  it('returns no rank, no winner flag and no price for any field', () => {
    const { identity } = normalizeTrendyolSellerIdentity(extractSharedProps(pageHtml), WINNER_REF);
    const seen = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      for (const [key, child] of Object.entries(value)) {
        seen.add(key);
        walk(child);
      }
    };
    walk(identity);
    for (const forbidden of ['rank', 'isWinner', 'winner', 'price', 'finalPrice', 'sellerRating']) {
      expect(seen.has(forbidden)).toBe(false);
    }
  });

  it('answers identically whether the page calls this merchant the winner or not', () => {
    // A merchant-scoped page reports the requested merchant as winner on every row regardless
    // of the real buybox order (measured 2026-08-17). If any part of the identity moved with
    // that claim, this path would be laundering a false rank into an audit record.
    const base = {
      merchant: { id: 9, officialName: 'Firma A.Ş.', taxNumber: '1234567890' },
      winnerVariant: { listingId: 'a', barcode: '111', quantity: 2 },
    };
    const asWinner = normalizeTrendyolSellerIdentity(
      { product: { merchantListing: { ...base, isWinner: true, rank: 1 } } },
      '9',
    );
    const notWinner = normalizeTrendyolSellerIdentity(
      { product: { merchantListing: { ...base, isWinner: false, rank: 8 } } },
      '9',
    );
    expect(asWinner.identity).toEqual(notWinner.identity);
  });

  it('does not read the other merchants on the page at all', () => {
    // The neutral scrape owns the seller list. Reading it here would produce a second, quieter
    // seller set gathered under a request shape whose ordering is known to be wrong.
    const withOthers = normalizeTrendyolSellerIdentity(extractSharedProps(pageHtml), WINNER_REF);
    const stripped = normalizeTrendyolSellerIdentity(
      {
        product: {
          merchantListing: {
            ...(extractSharedProps(pageHtml) as { product: { merchantListing: object } }).product
              .merchantListing,
            otherMerchants: [],
          },
        },
      },
      WINNER_REF,
    );
    expect(withOthers).toEqual(stripped);
  });
});

describe('identity mismatch is a hard failure', () => {
  it('refuses a page that came back describing a different merchant', () => {
    expect(() => normalizeTrendyolSellerIdentity(extractSharedProps(pageHtml), '514600')).toThrow(
      TrendyolIdentityMismatchError,
    );
  });

  it('surfaces it as its own failure kind, not as a parse failure', async () => {
    const source = sourceWith(async () => htmlResponse(pageHtml));
    await expect(
      source.resolveSellerIdentity({ url: null, contentId: '757251065' }, '514600'),
    ).rejects.toMatchObject({ kind: 'identityMismatch' });
  });

  it('throws rather than returning a partial identity when no merchant object exists', () => {
    expect(() => normalizeTrendyolSellerIdentity({ product: { merchantListing: {} } }, '9')).toThrow(
      TrendyolIdentitySchemaError,
    );
  });

  it('refuses to guess when merchantListing arrives as an array (guide §32)', () => {
    expect(() => normalizeTrendyolSellerIdentity({ product: { merchantListing: [] } }, '9')).toThrow(
      TrendyolIdentitySchemaError,
    );
  });
});

describe('the request this source is the only one allowed to make', () => {
  it('asks for the page as the merchant being resolved', () => {
    const source = sourceWith(async () => htmlResponse(pageHtml));
    const url = source.buildUrl({ url: null, contentId: '757251065' }, '736424');
    expect(new URL(url).searchParams.get('merchantId')).toBe('736424');
  });

  it('overwrites our own merchantId rather than appending a second one', () => {
    // A captured productUrl carries `merchantId=<our own seller id>` (mapping.ts). Appending
    // would send two values and let Trendyol pick; the answer must be about the seller asked for.
    const source = sourceWith(async () => htmlResponse(pageHtml));
    const url = source.buildUrl(
      { url: 'https://www.trendyol.com/x-p-1?merchantId=111&filterOverPriceListings=false', contentId: null },
      '736424',
    );
    const params = new URL(url).searchParams;
    expect(params.getAll('merchantId')).toEqual(['736424']);
    expect(params.get('filterOverPriceListings')).toBe('false');
  });

  it('fails typed when the product ref addresses nothing', () => {
    const source = sourceWith(async () => htmlResponse(pageHtml));
    expect(() => source.buildUrl({ url: null, contentId: null }, '736424')).toThrow(SellerIdentityError);
  });

  it('resolves one seller at a time even when two callers ask at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const source = sourceWith(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return htmlResponse(pageHtml);
    });
    const ref = { url: null, contentId: '757251065' };
    await Promise.all([
      source.resolveSellerIdentity(ref, WINNER_REF),
      source.resolveSellerIdentity(ref, WINNER_REF),
    ]);
    expect(maxInFlight).toBe(1);
  });

  it('lets the next caller through after one fails', async () => {
    let call = 0;
    const source = sourceWith(async () => {
      call += 1;
      return call === 1 ? htmlResponse('no state here', 200) : htmlResponse(pageHtml);
    });
    const ref = { url: null, contentId: '757251065' };
    await expect(source.resolveSellerIdentity(ref, WINNER_REF)).rejects.toMatchObject({
      kind: 'parseFailed',
    });
    const snapshot = await source.resolveSellerIdentity(ref, WINNER_REF);
    expect(snapshot.identity.taxNumber).toBe('1234567890');
  });

  it('records a non-200 as a fetch failure carrying the status', async () => {
    const source = sourceWith(async () => htmlResponse('nope', 404), { retryOn403MaxAttempts: 1 });
    await expect(
      source.resolveSellerIdentity({ url: null, contentId: '757251065' }, WINNER_REF),
    ).rejects.toMatchObject({ kind: 'fetchFailed', httpStatus: 404 });
  });

  it('retries a 403, which is measured to alternate per request', async () => {
    let call = 0;
    const source = sourceWith(async () => {
      call += 1;
      return call === 1 ? htmlResponse('blocked', 403) : htmlResponse(pageHtml);
    });
    const snapshot = await source.resolveSellerIdentity({ url: null, contentId: '757251065' }, WINNER_REF);
    expect(call).toBe(2);
    expect(snapshot.identity.officialName).toBe('Cansu Beauty Kozmetik A.Ş.');
  });

  it('stamps the marketplace and the URL it actually reached', async () => {
    const source = sourceWith(async () =>
      htmlResponse(pageHtml, 200, 'https://www.trendyol.com/dyson/v12-p-757251065?merchantId=736424'),
    );
    const snapshot = await source.resolveSellerIdentity({ url: null, contentId: '757251065' }, WINNER_REF);
    expect(snapshot.identity.marketplaceCode).toBe('trendyol');
    expect(snapshot.fetchedUrl).toContain('merchantId=736424');
    expect(snapshot.resolvedAt.getTime()).toBe(1_700_000_000_000);
  });
});
