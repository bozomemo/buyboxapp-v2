/**
 * Table-driven tests for the Hepsiburada mappers. Everything asserted here is traceable to the
 * vendor OpenAPI document (`docs/vendor/hepsiburada-listing-openapi-v1.json`) or the guide,
 * summarised in api-references §2.4 and §2.6.
 */
import { Money } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import {
  HepsiburadaMappingError,
  isTerminalUploadStatus,
  mapListingToSnapshot,
  mapPriceUploadResult,
  selectActivePricing,
  type HepsiburadaListing,
} from './mapping.js';

const AT = Date.parse('2026-08-14T12:00:00Z');

function listing(overrides: Partial<HepsiburadaListing> = {}): HepsiburadaListing {
  return {
    listingId: '3f2b1c88-1f2a-4a1e-9d55-2b7c0f6d1a01',
    hepsiburadaSku: 'HBCV00000ABCDE',
    merchantSku: 'ABC123-2',
    price: 118.97,
    availableStock: 9,
    dispatchTime: 3,
    isSalable: true,
    ...overrides,
  };
}

describe('mapListingToSnapshot', () => {
  it('converts the wire price from lira to exact kuruş', () => {
    expect(mapListingToSnapshot(listing({ price: 118.97 }), AT).price.toKurus()).toBe(11_897n);
  });

  it.each([
    [0.01, 1n],
    [59.5, 5_950n],
    [2450, 245_000n],
    // A value that is not exactly representable as a float: 1234.35 is stored as
    // 1234.3499999999999 and must still land on 123435 kuruş, not 123434.
    [1234.35, 123_435n],
  ])('price %s TL becomes %s kuruş', (lira, kurus) => {
    expect(mapListingToSnapshot(listing({ price: lira }), AT).price.toKurus()).toBe(kurus);
  });

  it('carries hepsiburadaSku as both the listing id and the scrape key (§2.4, §2.11)', () => {
    const snapshot = mapListingToSnapshot(listing(), AT);
    expect(snapshot.marketplaceListingId).toBe('HBCV00000ABCDE');
    expect(snapshot.productPage?.contentId).toBe('HBCV00000ABCDE');
    // The listing schema has no product-page URL field; not invented.
    expect(snapshot.productPage?.url).toBeNull();
  });

  it('leaves productName, listPrice, commissionRate and vatRate null — none are on the schema', () => {
    const snapshot = mapListingToSnapshot(listing(), AT);
    expect(snapshot.productName).toBeNull();
    expect(snapshot.listPrice).toBeNull();
    expect(snapshot.commissionRate).toBeNull();
    expect(snapshot.vatRate).toBeNull();
  });

  it('carries the marketplace kill switches and the frozen state (§2.4)', () => {
    const snapshot = mapListingToSnapshot(
      listing({
        priceIncreaseDisabled: true,
        priceDecreaseDisabled: false,
        isFrozen: true,
        freezeReasons: ['MerchantRequest'],
        isLocked: true,
        lockReasons: ['Yüksek fiyat sebebiyle kilitlendi.'],
      }),
      AT,
    );
    expect(snapshot.priceIncreaseDisabled).toBe(true);
    expect(snapshot.priceDecreaseDisabled).toBe(false);
    expect(snapshot.isFrozen).toBe(true);
    expect(snapshot.freezeReasons).toEqual(['MerchantRequest']);
    expect(snapshot.isLocked).toBe(true);
    expect(snapshot.lockReasons).toEqual(['Yüksek fiyat sebebiyle kilitlendi.']);
  });

  it.each([
    ['hepsiburadaSku', { hepsiburadaSku: null }],
    ['merchantSku', { merchantSku: null }],
    ['price', { price: null }],
  ])('refuses to map a listing missing %s rather than substituting one', (_field, overrides) => {
    expect(() => mapListingToSnapshot(listing(overrides), AT)).toThrow(HepsiburadaMappingError);
  });
});

describe('selectActivePricing', () => {
  const inWindow = { finalPrice: 109.9, startDate: '2026-08-01T00:00:00Z', endDate: '2026-08-31T23:59:59Z' };
  const future = { finalPrice: 99.9, startDate: '2026-09-01T00:00:00Z', endDate: '2026-09-30T23:59:59Z' };
  const past = { finalPrice: 89.9, startDate: '2026-07-01T00:00:00Z', endDate: '2026-07-31T23:59:59Z' };
  const openEnded = { finalPrice: 79.9, startDate: null, endDate: null };

  it.each([
    ['the covering window', [past, inWindow, future], 109.9],
    ['an open-ended entry', [openEnded], 79.9],
    ['nothing when every window is closed or not yet open', [past, future], null],
    ['nothing when there are no pricings', [], null],
  ])('selects %s', (_name, pricings, expected) => {
    expect(selectActivePricing(pricings, AT)?.finalPrice ?? null).toBe(expected);
  });

  it('a campaign outside its window never becomes the customer price', () => {
    const snapshot = mapListingToSnapshot(listing({ pricings: [future] }), AT);
    expect(snapshot.customerPrice).toBeNull();
  });

  it('a campaign inside its window does', () => {
    const snapshot = mapListingToSnapshot(listing({ pricings: [inWindow] }), AT);
    expect(snapshot.customerPrice?.toKurus()).toBe(10_990n);
  });
});

describe('isTerminalUploadStatus', () => {
  it.each([
    ['Done', true],
    ['Failed', true],
    ['done', true],
    // Everything the vendor does not document is "not yet confirmed", never success (§2.6).
    ['Processing', false],
    ['InProgress', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%s → %s', (status, expected) => {
    expect(isTerminalUploadStatus(status)).toBe(expected);
  });
});

describe('mapPriceUploadResult', () => {
  const submitted = ['HBCV00000ABCDE', 'HBCV00000FGHIJ'];

  it('reports an unrecognised status as pending, not as success', () => {
    expect(mapPriceUploadResult({ status: 'Processing', total: 2 }, submitted)).toEqual({
      status: 'pending',
    });
  });

  it('treats a "Done" batch with priceValidations as a FAILURE (§2.6 MinLock/MaxLock)', () => {
    const result = mapPriceUploadResult(
      {
        status: 'Done',
        total: 2,
        errors: null,
        priceValidations: [
          {
            elementNo: 1,
            hepsiburadaSku: 'HBCV00000ABCDE',
            type: 'MaxLock',
            minPrice: 899.8,
            maxPrice: 13767.0,
            regulativePriceDetail: { categoryName: 'Kahve Makineleri' },
            description: 'Yüksek fiyat sebebiyle kilitlendi.',
          },
        ],
      },
      submitted,
    );
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;

    const locked = result.items.find((i) => i.marketplaceListingId === 'HBCV00000ABCDE');
    expect(locked?.status).toBe('failed');
    expect(locked?.lock?.type).toBe('MaxLock');
    // The band is carried as Money so the next decision can intersect it with our own floor.
    expect(locked?.lock?.minPrice?.toKurus()).toBe(89_980n);
    expect(locked?.lock?.maxPrice?.toKurus()).toBe(1_376_700n);
    expect(locked?.lock?.categoryName).toBe('Kahve Makineleri');

    // The element that was not flagged did succeed.
    expect(result.items.find((i) => i.marketplaceListingId === 'HBCV00000FGHIJ')?.status).toBe('success');
  });

  it('retains raw error codes verbatim and never invents a reason', () => {
    const result = mapPriceUploadResult(
      {
        status: 'Failed',
        total: 2,
        errors: [
          {
            elementNo: 2,
            hepsiburadaSku: 'HBCV00000FGHIJ',
            errors: ['OutOfPriceRange', 'DiscountedListingPriceIncrease'],
          },
        ],
      },
      submitted,
    );
    if (result.status !== 'completed') throw new Error('expected completed');
    const failed = result.items.find((i) => i.marketplaceListingId === 'HBCV00000FGHIJ');
    expect(failed?.status).toBe('failed');
    expect(failed?.failureReason).toBe('OutOfPriceRange; DiscountedListingPriceIncrease');
  });

  it('resolves an element by its 1-based elementNo when the response omits the SKU', () => {
    const result = mapPriceUploadResult(
      { status: 'Failed', total: 2, errors: [{ elementNo: 2, errors: ['InvalidPrice'] }] },
      submitted,
    );
    if (result.status !== 'completed') throw new Error('expected completed');
    expect(result.items.find((i) => i.status === 'failed')?.marketplaceListingId).toBe('HBCV00000FGHIJ');
  });

  it('reports one item per listing when an element is both locked and errored', () => {
    const result = mapPriceUploadResult(
      {
        status: 'Done',
        total: 1,
        errors: [{ elementNo: 1, hepsiburadaSku: 'HBCV00000ABCDE', errors: ['OutOfPriceRange'] }],
        priceValidations: [
          { elementNo: 1, hepsiburadaSku: 'HBCV00000ABCDE', type: 'MinLock', minPrice: 10, maxPrice: 20 },
        ],
      },
      ['HBCV00000ABCDE'],
    );
    if (result.status !== 'completed') throw new Error('expected completed');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.lock?.type).toBe('MinLock');
  });

  it('without the submitted batch, reports only the failures and claims no successes', () => {
    const result = mapPriceUploadResult({
      status: 'Done',
      total: 2,
      errors: [{ elementNo: 2, hepsiburadaSku: 'HBCV00000FGHIJ', errors: ['ProductNotFound'] }],
    });
    if (result.status !== 'completed') throw new Error('expected completed');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.status).toBe('failed');
  });

  it('marks everything successful when a terminal batch reports nothing wrong', () => {
    const result = mapPriceUploadResult({ status: 'Done', total: 2 }, submitted);
    if (result.status !== 'completed') throw new Error('expected completed');
    expect(result.items.map((i) => i.status)).toEqual(['success', 'success']);
    expect(result.items.every((i) => i.failureReason === null)).toBe(true);
  });
});

describe('Money conversion is exact in both directions', () => {
  it('a kuruş amount survives the round trip through the wire representation', () => {
    const kurus = 123_456n;
    const lira = Number(Money.fromKurus(kurus).toKurus()) / 100;
    expect(Money.fromMajorUnitsString(lira.toFixed(2)).toKurus()).toBe(kurus);
  });
});
