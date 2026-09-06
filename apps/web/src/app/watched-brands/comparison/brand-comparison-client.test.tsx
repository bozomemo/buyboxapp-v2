import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { BrandComparisonClient } from './brand-comparison-client';

/**
 * Smoke test for `/watched-brands/comparison` (doc 15 §6, Phase 4.4 — Tier C). Shape copied from
 * `brand-sellers-client.test.tsx`: one `fetch` stub per case, one stable phrase asserted per case,
 * no snapshots, no assertions on layout or class names.
 *
 * `BrandComparisonClient` reads no `next/navigation` hooks, so there is no router mock here. It
 * fetches one route on mount, `/api/brand-reports/comparison` (routes match on pathname only, see
 * `stubFetch`), which gates the loading/error split.
 */

afterEach(() => cleanup());

const ROUTE = '/api/brand-reports/comparison';

describe('BrandComparisonClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [ROUTE]: { pending: true } });

    render(<BrandComparisonClient />);

    expect(await screen.findByText('Karşılaştırma yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [ROUTE]: { reject: new Error('network down') } });

    render(<BrandComparisonClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the no-data-this-period sentence', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          window: { sinceMs: 0, untilMs: 1 },
          brands: [],
          series: [],
          index: null,
          hasCompetitorBrand: false,
        },
      },
    });

    render(<BrandComparisonClient />);

    expect(
      await screen.findByText('Bu dönemde hiçbir marka için kayıtlı bakış yok.', { exact: false }),
    ).toBeTruthy();
  });

  it('populated: shows a brand row', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          window: { sinceMs: 0, untilMs: 1 },
          brands: [{ id: 'b1', label: 'Whiskas', marketplaceCode: 'trendyol', isOwnBrand: true }],
          series: [
            {
              id: 'b1',
              label: 'Whiskas',
              marketplaceCode: 'trendyol',
              isOwnBrand: true,
              points: [{ dayMs: Date.now(), avgPrice: '10000', sellerCount: 3, productsWithOffers: 2 }],
              windowAvgPrice: '10000',
            },
          ],
          index: null,
          hasCompetitorBrand: false,
        },
      },
    });

    render(<BrandComparisonClient />);

    // "Whiskas" renders twice — once as the filter chip, once as the summary row's link — so
    // assert on the row link specifically rather than the ambiguous text.
    expect(await screen.findByRole('link', { name: 'Whiskas' })).toBeTruthy();
  });
});
