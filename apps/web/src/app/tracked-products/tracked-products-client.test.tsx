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

    expect(await screen.findByText('Gösterilecek ürün yok.')).toBeTruthy();
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

    // The three stat cards became one summary line (2026-11-08 seller filters spec §5 item 3).
    it('summary line', async () => {
      stubFetch({ '/api/tracked-products': { body: ONE }, ...EMPTY_SIDE_ROUTES });
      render(<TrackedProductsClient />);
      const line = await screen.findByTestId('tracked-summary');
      expect(line.textContent).toContain('1.234 ürün');
      expect(line.textContent).toContain('0 marka');
      expect(line.textContent).toContain('0 kategori');
    });

    it('status is a segmented filter', async () => {
      stubFetch({ '/api/tracked-products': { body: ONE }, ...EMPTY_SIDE_ROUTES });
      render(<TrackedProductsClient />);
      // Durum lives in the Diğer popover since 2026-11-08 (spec §5 item 4).
      fireEvent.click(await screen.findByRole('button', { name: /^Diğer/ }));
      const group = await screen.findByRole('group', { name: 'Durum' });
      fireEvent.click(within(group).getByRole('button', { name: /Duraklatıldı/ }));
      await vi.waitFor(() => {
        const calls = (fetch as unknown as { mock: { calls: [RequestInfo | URL][] } }).mock.calls.map(([u]) => String(u));
        expect(calls.some((u) => u.startsWith('/api/tracked-products?') && u.includes('isActive=false'))).toBe(true);
      });
    });
  });

  describe('seller filters and compact strip (2026-11-08)', () => {
    const PRODUCT = {
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
      sellerCount: 4,
    };
    const ROUTES = {
      '/api/tracked-products': { body: { products: [PRODUCT], total: 1 } },
      '/api/tracked-products/sellers': {
        body: { sellers: [{ marketplaceCode: 'TY', sellerRef: 'S1', sellerName: 'Birinci', productCount: 3 }] },
      },
      ...EMPTY_SIDE_ROUTES,
    };

    /** Every list request the component made, in order. */
    function listCalls(): string[] {
      return (fetch as unknown as { mock: { calls: [RequestInfo | URL][] } }).mock.calls
        .map(([u]) => String(u))
        .filter((u) => u.startsWith('/api/tracked-products?'));
    }

    afterEach(() => window.localStorage.clear());

    it('requests rating-first by default', async () => {
      stubFetch(ROUTES);
      render(<TrackedProductsClient />);
      await screen.findByText('Test Marka - Test Ürünü');
      expect(listCalls()[0]).toContain('sort=ratingCount&sortDir=desc');
    });

    it('Diğer shows how many hidden filters are active', async () => {
      stubFetch(ROUTES);
      render(<TrackedProductsClient />);
      fireEvent.click(await screen.findByRole('button', { name: 'Diğer' }));
      const group = screen.getByRole('group', { name: 'Satıcısızları göster' });
      fireEvent.click(within(group).getByRole('button', { name: /Sadece/ }));
      expect(await screen.findByRole('button', { name: 'Diğer (1)' })).toBeTruthy();
      await vi.waitFor(() => expect(listCalls().at(-1)).toContain('noSellerOnly=true'));
      expect(listCalls().at(-1)).not.toContain('includeNoSeller');
    });

    it('Satıcısızları göster › Dahil asks for every card', async () => {
      stubFetch(ROUTES);
      render(<TrackedProductsClient />);
      fireEvent.click(await screen.findByRole('button', { name: 'Diğer' }));
      const group = screen.getByRole('group', { name: 'Satıcısızları göster' });
      fireEvent.click(within(group).getByRole('button', { name: /Dahil/ }));
      await vi.waitFor(() => expect(listCalls().at(-1)).toContain('includeNoSeller=true'));
      expect(listCalls().at(-1)).not.toContain('noSellerOnly');
    });

    it('arriving with ?includeNoSeller=true keeps the no-seller cards in', async () => {
      // İzlenen Markalar' count links: their numbers include cards nobody sells.
      mockNavigation.searchParams = new URLSearchParams('watchedBrandId=b1&includeNoSeller=true');
      stubFetch(ROUTES);
      render(<TrackedProductsClient />);
      await screen.findByText('Test Marka - Test Ürünü');
      expect(listCalls()[0]).toContain('includeNoSeller=true');
      expect(screen.getByRole('button', { name: 'Diğer (1)' })).toBeTruthy();
    });

    it('an empty list without filters says no-seller cards are hidden', async () => {
      stubFetch({ ...ROUTES, '/api/tracked-products': { body: { products: [], total: 0 } } });
      render(<TrackedProductsClient />);
      expect(await screen.findByText(/Satıcısı olmayan ürünler varsayılan olarak gizlidir/)).toBeTruthy();
    });

    it('selecting a seller sends both params', async () => {
      stubFetch(ROUTES);
      render(<TrackedProductsClient />);
      await screen.findByText('Test Marka - Test Ürünü');
      fireEvent.click(screen.getByRole('button', { name: /^Satıcı filtresi/ }));
      fireEvent.click(await screen.findByRole('option', { name: /Birinci/ }));
      await vi.waitFor(() => expect(listCalls().at(-1)).toContain('sellerMarketplace=TY&sellerRef=S1'));
    });

    it('sends the seller-count filter', async () => {
      stubFetch(ROUTES);
      render(<TrackedProductsClient />);
      fireEvent.change(await screen.findByRole('spinbutton', { name: 'Satıcı ≥' }), { target: { value: '3' } });
      await vi.waitFor(() => expect(listCalls().at(-1)).toContain('minSellerCount=3'));
    });

    it('selection bar is hidden until a row is selected', async () => {
      stubFetch(ROUTES);
      render(<TrackedProductsClient />);
      await screen.findByText('Test Marka - Test Ürünü');
      expect(screen.queryByRole('button', { name: 'Seçilenleri Tekrar Tara' })).toBeNull();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Test Marka - Test Ürünü seç' }));
      expect(screen.getByRole('button', { name: 'Seçilenleri Tekrar Tara' })).toBeTruthy();
    });

    it('an old preset applies', async () => {
      // Saved before 2026-11-08: no `seller`, no `minSellerCount`.
      window.localStorage.setItem(
        'trackedProducts.filterPresets',
        JSON.stringify([
          {
            name: 'Eski',
            value: {
              text: '',
              brandId: '',
              categoryRef: '',
              active: '',
              searchTermOnly: false,
              unratedOnly: false,
              noSellerOnly: false,
              minRatingCount: '5',
            },
          },
        ]),
      );
      stubFetch(ROUTES);
      render(<TrackedProductsClient />);
      await screen.findByText('Test Marka - Test Ürünü');
      fireEvent.click(screen.getByRole('button', { name: 'Kayıtlı' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Eski' }));
      await vi.waitFor(() => expect(listCalls().at(-1)).toContain('minRatingCount=5'));
      expect(listCalls().at(-1)).not.toContain('sellerRef');
      expect(listCalls().at(-1)).not.toContain('minSellerCount');
    });

    it('a stored column preference with periodSellerCount loads', async () => {
      window.localStorage.setItem(
        'trackedProducts.columns',
        JSON.stringify({ order: ['label', 'periodSellerCount', 'sellerCount'], hidden: [], widths: {} }),
      );
      stubFetch(ROUTES);
      render(<TrackedProductsClient />);
      await screen.findByText('Test Marka - Test Ürünü');
      const table = screen.getByRole('table');
      expect(within(table).queryByText('Dönem Satıcı')).toBeNull();
      expect(within(table).getByRole('button', { name: 'Satıcı' })).toBeTruthy();
      // The 30-day count, from the row — not the latest look's (empty here).
      expect(within(table).getByText('4')).toBeTruthy();
    });

    it('Temizle keeps the sort', async () => {
      stubFetch(ROUTES);
      render(<TrackedProductsClient />);
      await screen.findByText('Test Marka - Test Ürünü');
      fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'Satıcı' }));
      await vi.waitFor(() => expect(listCalls().at(-1)).toContain('sort=sellerCount&sortDir=desc'));
      fireEvent.change(screen.getByRole('textbox', { name: 'Ara' }), { target: { value: 'x' } });
      await vi.waitFor(() => expect(listCalls().at(-1)).toContain('text=x'));
      fireEvent.click(screen.getByRole('button', { name: 'Temizle' }));
      await vi.waitFor(() => expect(listCalls().at(-1)).not.toContain('text=x'));
      expect(listCalls().at(-1)).toContain('sort=sellerCount&sortDir=desc');
    });
  });
});
