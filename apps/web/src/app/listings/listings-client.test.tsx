import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockNavigation, stubFetch } from '@/test-utils';
import { ListingsClient } from './listings-client';

/**
 * Smoke test for `/listings` (doc 15 §6, Phase 2.5). Shape copied from
 * `dashboard-client.test.tsx` (Phase 1c's reference) and `tracked-products-client.test.tsx`: one
 * `fetch` stub per case, one stable phrase asserted per case, no snapshots, no assertions on
 * layout or class names.
 *
 * `ListingsClient` reads `useSearchParams` (to seed the phase filter from `?phases=` and the
 * brand filter from `?brandId=`/`?brandName=`) and fetches two routes on mount: `/api/listings`
 * (the primary, paged grid that gates the loading/error split) and `/api/brands` (the brand
 * filter's option list, swallowed to `[]` on failure by the screen itself so it needs no stub
 * failure case of its own).
 */

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockNavigation.searchParams,
  usePathname: () => mockNavigation.pathname,
  useRouter: () => mockNavigation.router,
}));

afterEach(() => cleanup());

const BRANDS_ROUTE = { '/api/brands': { body: { brands: [] } } };

describe('ListingsClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({
      '/api/listings': { pending: true },
      ...BRANDS_ROUTE,
    });

    render(<ListingsClient />);

    expect(await screen.findByText('İlanlar yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({
      '/api/listings': { reject: new Error('network down') },
      ...BRANDS_ROUTE,
    });

    render(<ListingsClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({
      '/api/listings': { body: { rows: [], total: 0 } },
      ...BRANDS_ROUTE,
    });

    render(<ListingsClient />);

    expect(
      await screen.findByText('Henüz ilan yok. Stok içe aktarıldıktan sonra burası dolar.'),
    ).toBeTruthy();
  });

  it('populated: shows a listing row', async () => {
    stubFetch({
      '/api/listings': {
        body: {
          total: 1,
          rows: [
            {
              id: 'l1',
              marketplaceCode: 'trendyol',
              marketplaceListingId: 'ml1',
              sellerStockCode: 'SC1',
              baseStockCode: 'BASE1',
              productName: 'Test Marka - Test Ürünü',
              price: '10000',
              offeredStock: 5,
              commissionRate: null,
              vatRate: 20,
              isSalable: true,
              isLocked: false,
              isSuspended: false,
              isBlacklisted: false,
              repriceEnabled: true,
              observationEnabled: true,
              minPrice: null,
              maxPrice: null,
              allowIncrease: true,
              allowDecrease: true,
              phase: 'OPTIMUM',
              optimumPrice: null,
              lastSeenAt: Date.now(),
              floorPrice: '9000',
              buyboxPrice: '10500',
              secondPrice: null,
              thirdPrice: null,
              rank: 1,
              buyboxSellerName: 'Test Mağaza',
            },
          ],
        },
      },
      ...BRANDS_ROUTE,
    });

    render(<ListingsClient />);

    expect(await screen.findByText('Test Marka - Test Ürünü')).toBeTruthy();
  });

  it('?phases= seeding: seeds the phase filter from the query string on the very first request', async () => {
    mockNavigation.searchParams = new URLSearchParams('phases=BLOCKED');
    stubFetch({
      '/api/listings': { body: { rows: [], total: 0 } },
      ...BRANDS_ROUTE,
    });

    render(<ListingsClient />);

    // The seeded phase counts as an active filter, so the empty state reads as "no match" rather
    // than "nothing imported yet" — this is itself evidence the seeding took effect.
    await screen.findByText('Bu filtrelerle eşleşen ilan yok.');

    const fetchMock = vi.mocked(globalThis.fetch);
    const firstListingsCall = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((url) => url.includes('/api/listings?'));
    expect(firstListingsCall).toBeTruthy();
    expect(new URL(firstListingsCall!, 'http://localhost').searchParams.get('phases')).toBe('BLOCKED');

    // The phase button seeded from the URL renders as pressed/active, not just requested — same
    // Turkish label the filter bar always uses, now shown as the active filter.
    expect(screen.getByRole('button', { name: 'Bloke' }).className).toContain('bg-(--color-accent)');
  });
});
