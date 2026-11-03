import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_PERMISSION_TITLE, PermissionsProvider } from '@/lib/permissions';
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

const POPULATED_ROW = {
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
};

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
          rows: [POPULATED_ROW],
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

  // Redesign phase 3 (plan 2026-11-03-ui-redesign-phase-3-rest, Task 6).
  it('phase toggles expose their state', async () => {
    mockNavigation.searchParams = new URLSearchParams();
    stubFetch({ '/api/listings': { body: { rows: [], total: 0 } }, ...BRANDS_ROUTE });

    render(<ListingsClient />);

    const blocked = await screen.findByRole('button', { name: 'Bloke' });
    expect(blocked.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(blocked);
    expect(screen.getByRole('button', { name: 'Bloke' }).getAttribute('aria-pressed')).toBe('true');
    // The yes/no/any filters are segmented groups now, not dropdowns.
    expect(screen.getByRole('group', { name: 'Satılabilir' })).toBeTruthy();
  });

  it('keeps permission gating', async () => {
    mockNavigation.searchParams = new URLSearchParams();
    stubFetch({
      '/api/listings': { body: { total: 1, rows: [POPULATED_ROW] } },
      '/api/auth/me': { body: { user: { permissions: ['view'] } } },
      ...BRANDS_ROUTE,
    });

    render(
      <PermissionsProvider>
        <ListingsClient />
      </PermissionsProvider>,
    );

    await screen.findByText('Test Marka - Test Ürünü');
    await waitFor(() =>
      expect(screen.getByPlaceholderText('min').getAttribute('title')).toBe(NO_PERMISSION_TITLE),
    );
    const min = screen.getByPlaceholderText('min') as HTMLInputElement;
    expect(min.disabled).toBe(true);
    expect(min.className).toContain('h-9');
    // Without `prices.manage` the price is text, not a button into the manual-price editor.
    expect(screen.queryByRole('button', { name: /100,00/ })).toBeNull();
  });
});
