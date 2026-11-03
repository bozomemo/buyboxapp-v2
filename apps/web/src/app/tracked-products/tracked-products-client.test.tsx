import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockNavigation, stubFetch } from '@/test-utils';
import { TrackedProductsClient } from './tracked-products-client';

/**
 * Smoke test for `/tracked-products` (doc 15 §6, Phase 2.2). Shape copied from
 * `dashboard-client.test.tsx` (Phase 1c's reference) and `jobs-client.test.tsx`: one `fetch` stub
 * per case, one stable phrase asserted per case, no snapshots, no assertions on layout or class
 * names.
 *
 * `TrackedProductsClient` reads `useSearchParams` (to seed the filter bar from `?watchedBrandId=`
 * etc.) and fetches four routes on mount: `/api/tracked-products` (the primary, paged list that
 * gates the loading/error split), `/api/watched-brands`, `/api/settings/marketplaces` and
 * `/api/tracked-products/categories`. All four are stubbed in every case — `stubFetch` rejects
 * loudly on an unmatched path rather than hanging, so a missing route here fails fast rather than
 * silently.
 */

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockNavigation.searchParams,
  usePathname: () => mockNavigation.pathname,
  useRouter: () => mockNavigation.router,
}));

afterEach(() => cleanup());

const EMPTY_SIDE_ROUTES = {
  '/api/watched-brands': { body: { groups: [] } },
  '/api/settings/marketplaces': { body: { marketplaces: [] } },
  '/api/tracked-products/categories': { body: { categories: [] } },
};

describe('TrackedProductsClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({
      '/api/tracked-products': { pending: true },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<TrackedProductsClient />);

    expect(await screen.findByText('Ürünler yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({
      '/api/tracked-products': { reject: new Error('network down') },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<TrackedProductsClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({
      '/api/tracked-products': { body: { products: [], total: 0 } },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<TrackedProductsClient />);

    expect(await screen.findByText('Henüz takip edilen ürün yok.')).toBeTruthy();
  });

  it('populated: shows a product row', async () => {
    stubFetch({
      '/api/tracked-products': {
        body: {
          products: [
            {
              id: 'tp1',
              marketplaceCode: 'trendyol',
              productRef: '123456',
              productUrl: 'https://www.trendyol.com/foo-p-123456',
              label: 'Test Marka - Test Ürünü',
              isActive: true,
              addedAt: Date.now(),
              watchedBrandId: null,
              brandName: 'Test Marka',
              categoryRef: null,
              categoryName: 'Kedi Maması',
              ratingCount: 42,
              ratingAverage: 4.5,
              lastSweptAt: Date.now(),
              lastScrapedAt: Date.now(),
              viaBrandRef: true,
              viaSearchTerm: false,
              latest: [],
              period: null,
              referencePrice: null,
              brandProduct: null,
              isFavourite: false,
            },
          ],
          total: 1,
        },
      },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<TrackedProductsClient />);

    expect(await screen.findByText('Test Marka - Test Ürünü')).toBeTruthy();
  });

  describe('redesign (plan 2026-11-03 phase 2, Task 3)', () => {
    const ONE = {
      products: [],
      total: 1234,
    };

    it('stat row', async () => {
      stubFetch({ '/api/tracked-products': { body: ONE }, ...EMPTY_SIDE_ROUTES });
      render(<TrackedProductsClient />);
      const row = await screen.findByTestId('tracked-stats');
      expect(row.className).toContain('grid-cols-2');
      // Three cards: a four-column row left an empty quarter on wide screens.
      expect(row.className).toContain('lg:grid-cols-3');
      expect(within(row).getByText('Ürün')).toBeTruthy();
      expect(within(row).getByText('1.234')).toBeTruthy();
      expect(within(row).getByText('Marka')).toBeTruthy();
      expect(within(row).getByText('Kategori')).toBeTruthy();
    });

    it('status is a segmented filter', async () => {
      stubFetch({ '/api/tracked-products': { body: ONE }, ...EMPTY_SIDE_ROUTES });
      render(<TrackedProductsClient />);
      const group = await screen.findByRole('group', { name: 'Durum' });
      fireEvent.click(within(group).getByRole('button', { name: /Duraklatıldı/ }));
      await vi.waitFor(() => {
        const calls = (fetch as unknown as { mock: { calls: [RequestInfo | URL][] } }).mock.calls.map(([u]) => String(u));
        expect(calls.some((u) => u.startsWith('/api/tracked-products?') && u.includes('isActive=false'))).toBe(true);
      });
    });
  });
});
