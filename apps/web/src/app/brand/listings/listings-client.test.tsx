import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { BrandListingsClient } from './listings-client';

/**
 * Smoke test for `/brand/listings` (doc 15 §6): one `fetch` stub per case, one stable phrase
 * asserted per case, no snapshots and no assertions on layout or class names.
 *
 * The one case beyond the usual four is the unlinked favourite, because that row is the screen's
 * only place where empty band columns are the correct answer rather than a bug (doc 17 §4.1).
 */

afterEach(() => cleanup());

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tp1',
    marketplaceCode: 'trendyol',
    productRef: '750104',
    productUrl: 'https://www.trendyol.com/x-p-750104',
    label: 'Test Marka - Mama 6lı',
    isActive: true,
    isFavourite: false,
    lastScrapedAt: 1_750_000_000_000,
    sellerCount: 3,
    buyboxSeller: 'Yetkili Bayi',
    buyboxPrice: '29940',
    buyboxPriceSource: 'price',
    unitPrice: '4990',
    brandProduct: { id: 'bp1', name: 'Mama', unitMultiplier: 6, isPrimary: true },
    referencePrice: '4990',
    minPrice: '3990',
    upperBound: '4990',
    upperBoundIsReferencePrice: true,
    bandStatus: 'inBand',
    ...overrides,
  };
}

describe('BrandListingsClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ '/api/brand/listings': { pending: true } });

    render(<BrandListingsClient />);

    expect(await screen.findByText('İlanlar yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ '/api/brand/listings': { reject: new Error('network down') } });

    render(<BrandListingsClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: says how a card gets here rather than showing a bare blank', async () => {
    stubFetch({ '/api/brand/listings': { body: { listings: [], total: 0 } } });

    render(<BrandListingsClient />);

    expect(await screen.findByText('Henüz ilan yok.')).toBeTruthy();
  });

  it('populated: shows the card, its verdict and its unit price', async () => {
    stubFetch({ '/api/brand/listings': { body: { listings: [listing()], total: 1 } } });

    render(<BrandListingsClient />);

    expect(await screen.findByText('Test Marka - Mama 6lı')).toBeTruthy();
    expect(screen.getByText('Aralıkta')).toBeTruthy();
    expect(screen.getByText('×6')).toBeTruthy();
  });

  it('a breach is counted above the grid, not left for the eye to find', async () => {
    stubFetch({
      '/api/brand/listings': {
        body: { listings: [listing({ bandStatus: 'belowMin' })], total: 1 },
      },
    });

    render(<BrandListingsClient />);

    expect(await screen.findByText('Min altında')).toBeTruthy();
    expect(screen.getByText(/kart bandın dışında/)).toBeTruthy();
  });

  /** No PSF, so no verdict — and the row says why rather than showing a silent dash. */
  it('an unlinked favourite is listed without a band', async () => {
    stubFetch({
      '/api/brand/listings': {
        body: {
          listings: [
            listing({
              isFavourite: true,
              brandProduct: null,
              referencePrice: null,
              minPrice: null,
              upperBound: null,
              unitPrice: null,
              bandStatus: 'unknown',
            }),
          ],
          total: 1,
        },
      },
    });

    render(<BrandListingsClient />);

    expect(await screen.findByText('Bağlı değil (favori)')).toBeTruthy();
  });
});
