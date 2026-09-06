import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { WatchedBrandsClient } from './watched-brands-client';

/**
 * Smoke test for `/watched-brands` (doc 15 §6, Phase 2.7). Shape copied from
 * `tracked-products-client.test.tsx`/`stock-client.test.tsx`: one `fetch` stub per case, one
 * stable phrase asserted per case, no snapshots, no assertions on layout or class names.
 *
 * `WatchedBrandsClient` reads no `next/navigation` hooks, so unlike the listings/tracked-products
 * tests there is no router mock here. It fetches two routes on mount: `/api/watched-brands` (the
 * primary load that gates the loading/error split) and `/api/tracked-products/prune-suggestion`
 * (a reporting-only side panel whose own failure never blocks the primary view — see
 * `watched-brands-client.tsx`'s `load()`). Both are stubbed in every case.
 */

afterEach(() => cleanup());

const EMPTY_SIDE_ROUTES = {
  '/api/tracked-products/prune-suggestion': { body: { suggestions: [] } },
};

describe('WatchedBrandsClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({
      '/api/watched-brands': { pending: true },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<WatchedBrandsClient />);

    expect(await screen.findByText('Markalar yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({
      '/api/watched-brands': { reject: new Error('network down') },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<WatchedBrandsClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({
      '/api/watched-brands': { body: { groups: [] } },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<WatchedBrandsClient />);

    expect(await screen.findByText('Henüz marka grubu yok.')).toBeTruthy();
  });

  it('populated: shows a watched brand row', async () => {
    stubFetch({
      '/api/watched-brands': {
        body: {
          groups: [
            {
              id: 'g1',
              name: 'Mars',
              note: null,
              brands: [
                {
                  id: 'b1',
                  marketplaceCode: 'trendyol',
                  label: 'Whiskas',
                  brandRef: '104703',
                  searchTerm: 'whiskas',
                  isActive: true,
                  lastSweptAt: Date.now(),
                  lastSweepProductCount: 887,
                  productCount: 887,
                  unratedCount: 574,
                  isOwnBrand: true,
                  noSellerCount: 3,
                  neverLookedCount: 0,
                  suggestedBrandRef: null,
                },
              ],
            },
          ],
        },
      },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<WatchedBrandsClient />);

    expect(await screen.findByText('Whiskas')).toBeTruthy();
  });
});
