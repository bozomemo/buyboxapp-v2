import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockNavigation, stubFetch } from '@/test-utils';
import { SellerDetailClient } from './seller-detail-client';

/**
 * Smoke test for `/competitors/sellers/[marketplace]/[ref]` (doc 15 §6, Phase 3.1). Shape copied
 * from `watched-brands-client.test.tsx`/`stock-client.test.tsx`: one `fetch` stub per case, one
 * stable phrase asserted per case, no snapshots, no assertions on layout or class names.
 *
 * Unlike `page.tsx`, which resolves the dynamic route segments server-side and passes them as
 * plain props (`marketplace`, `sellerRef` — this screen never calls `useParams`), the component
 * does read `useSearchParams` to seed the time window and the `?watchedBrandId=` filter from a
 * finding link, so `next/navigation` is mocked the same way `tracked-products-client.test.tsx`
 * does it. It fetches two routes on mount: `/api/competitors/sellers/:marketplace/:ref` (the
 * primary load that gates the loading/error split) and `/api/competitors/sellers` (the group
 * picker's options — a side fetch whose own failure is swallowed, see `load()`).
 */

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockNavigation.searchParams,
  usePathname: () => mockNavigation.pathname,
  useRouter: () => mockNavigation.router,
}));

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/competitors/sellers/trendyol/S1';
const SIDE_ROUTES = {
  '/api/competitors/sellers': { body: { groups: [] } },
};

const EMPTY_COVERAGE = { ok: 0, parseFailed: 0, fetchFailed: 0, firstAt: null, lastOkAt: null };

describe('SellerDetailClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: { pending: true },
      ...SIDE_ROUTES,
    });

    render(<SellerDetailClient marketplace="trendyol" sellerRef="S1" />);

    expect(await screen.findByText('Satıcı yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: { reject: new Error('network down') },
      ...SIDE_ROUTES,
    });

    render(<SellerDetailClient marketplace="trendyol" sellerRef="S1" />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: {
        body: {
          filters: { sinceMs: 0, untilMs: 1, watchedBrandId: null },
          seller: {
            marketplaceCode: 'trendyol',
            sellerRef: 'S1',
            sellerName: 'Boş Satıcı',
            operatorNote: null,
            isKnown: true,
          },
          group: null,
          groupMembers: [],
          listings: [],
          trackedProducts: [],
          trackedTruncated: false,
          watchedBrands: [],
          coverage: EMPTY_COVERAGE,
        },
      },
      ...SIDE_ROUTES,
    });

    render(<SellerDetailClient marketplace="trendyol" sellerRef="S1" />);

    expect(await screen.findByText('Bu dönemde bu satıcıyla çakıştığımız bir ürün yok.')).toBeTruthy();
  });

  it('populated: shows a seller listing row', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: {
        body: {
          filters: { sinceMs: 0, untilMs: 1, watchedBrandId: null },
          seller: {
            marketplaceCode: 'trendyol',
            sellerRef: 'S1',
            sellerName: 'Test Satıcı',
            operatorNote: null,
            isKnown: true,
          },
          group: null,
          groupMembers: [],
          listings: [
            {
              listingId: 'l1',
              marketplaceListingId: 'ml1',
              productName: 'Test Ürünü',
              baseStockCode: 'BASE1',
              ourPrice: '10000',
              observationCount: 5,
              buyboxCount: 2,
              avgRank: 1.5,
              minPrice: '9000',
              maxPrice: '11000',
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
            },
          ],
          trackedProducts: [],
          trackedTruncated: false,
          watchedBrands: [],
          coverage: EMPTY_COVERAGE,
        },
      },
      ...SIDE_ROUTES,
    });

    render(<SellerDetailClient marketplace="trendyol" sellerRef="S1" />);

    expect(await screen.findByText('Test Ürünü')).toBeTruthy();
  });
});
