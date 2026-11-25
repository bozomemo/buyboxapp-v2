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

  // Review 2026-11-25 Y7: every status was "Bilinmiyor" and the summary said none was out of band.
  it('does not call unknown statuses clean', async () => {
    stubFetch({
      '/api/brand/listings': {
        body: { listings: [listing({ bandStatus: 'unknown' }), listing({ id: 'tp2', bandStatus: 'unknown' })], total: 2 },
      },
    });
    render(<BrandListingsClient />);
    expect(await screen.findByText(/2 kartın bant durumu henüz bilinmiyor/)).toBeTruthy();
    expect(screen.queryByText(/hiçbiri bandın dışında değil/)).toBeNull();
  });

  it('says how many of the rest are unknown beside an in-band summary', async () => {
    stubFetch({
      '/api/brand/listings': {
        body: { listings: [listing(), listing({ id: 'tp2', bandStatus: 'unknown' })], total: 2 },
      },
    });
    render(<BrandListingsClient />);
    expect(await screen.findByText(/bilinen kartların hiçbiri bandın dışında değil/)).toBeTruthy();
    expect(screen.getByText(/1 kartın bant durumu henüz bilinmiyor/)).toBeTruthy();
  });

  it('an open violation shows how long it has been open, linked to Alarmlar', async () => {
    stubFetch({
      '/api/brand/listings': {
        body: {
          listings: [
            listing({ bandStatus: 'belowMin', openViolation: { kind: 'belowMin', since: Date.now() - 3 * 3_600_000 } }),
          ],
          total: 1,
        },
      },
    });

    render(<BrandListingsClient />);

    const link = await screen.findByRole('link', { name: /^3sa/ });
    expect(link.getAttribute('href')).toBe('/brand/alerts');
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

  /** doc 17 §8: the estimate, or the name of the input it is missing — never a silent blank. */
  it('shows the reseller profit estimate, and names the missing input when there is none', async () => {
    stubFetch({
      '/api/brand/listings': {
        body: {
          listings: [
            listing({
              id: 'est',
              label: 'Tahminli',
              profit: {
                commissionRate: 16.5,
                commission: '82500',
                cargo: '10000',
                operation: '5000',
                fixedSaleFee: '1250',
                cost: '300000',
                profit: '101250',
                profitPct: 20.25,
                breakEvenPrice: '325361',
              },
              profitMissing: null,
            }),
            listing({ id: 'miss', label: 'Tarifesiz', profit: null, profitMissing: 'noTariff' }),
          ],
          total: 2,
        },
      },
    });

    render(<BrandListingsClient />);

    expect(await screen.findByText('%16,5')).toBeTruthy();
    expect(screen.getByText('%20,3')).toBeTruthy();
    expect(screen.getByText('tarife yok')).toBeTruthy();
  });

  /** Product owner, 2026-11-23: a rate from Kâr Ayarları' default is marked as such. */
  it('marks a commission taken from the default rate', async () => {
    stubFetch({
      '/api/brand/listings': {
        body: {
          listings: [
            listing({
              profit: {
                commissionRate: 15,
                commissionSource: 'default',
                commission: '75000',
                cargo: '10000',
                operation: '5000',
                fixedSaleFee: '1250',
                cost: '300000',
                profit: '108750',
                profitPct: 21.75,
                breakEvenPrice: '372059',
              },
              profitMissing: null,
            }),
          ],
          total: 1,
        },
      },
    });
    render(<BrandListingsClient />);
    expect(await screen.findByText('%15')).toBeTruthy();
    expect(screen.getByText('varsayılan')).toBeTruthy();
  });

  /** Brand roadmap §6.7: a buybox holder selling under the estimated cost. */
  it('flags a buybox holder selling at a loss and counts it above the grid', async () => {
    const loss = {
      commissionRate: 16.5,
      commission: '82500',
      cargo: '10000',
      operation: '5000',
      fixedSaleFee: '1250',
      cost: '300000',
      profit: '-2500',
      profitPct: -0.8,
      breakEvenPrice: '325361',
    };
    stubFetch({
      '/api/brand/listings': { body: { listings: [listing({ profit: loss, profitMissing: null })], total: 1 } },
    });
    render(<BrandListingsClient />);
    expect(await screen.findByText('zararına')).toBeTruthy();
    expect(screen.getByText(/kartta buybox satıcısı tahmini maliyetinin altında satıyor/)).toBeTruthy();
  });
});

