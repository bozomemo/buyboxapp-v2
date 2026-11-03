import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
 * does it. It fetches three routes on mount: `/api/competitors/sellers/:marketplace/:ref` (the
 * primary load that gates the loading/error split), `/api/competitors/sellers/group` (the group
 * picker's options) and `/api/modules` — both side fetches whose own failure is swallowed.
 */

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockNavigation.searchParams,
  usePathname: () => mockNavigation.pathname,
  useRouter: () => mockNavigation.router,
}));

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/competitors/sellers/trendyol/S1';
const SIDE_ROUTES = {
  '/api/competitors/sellers/group': { body: { groups: [] } },
  '/api/modules': { body: { modules: { seller: true, brand: true } } },
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

  // doc 17 §1.3: the brand module links every seller row and finding here, so a brand-only
  // install must see the brand half without a section about listings it does not have, and a
  // way back to the screen it came from rather than one that is switched off.
  it('brand-only: hides our-listings and links back to the brand sellers screen', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: {
        body: {
          filters: { sinceMs: 0, untilMs: 1, watchedBrandId: null },
          seller: {
            marketplaceCode: 'trendyol',
            sellerRef: 'S1',
            sellerName: 'Marka Satıcısı',
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
      '/api/competitors/sellers/group': { body: { groups: [] } },
      '/api/modules': { body: { modules: { seller: false, brand: true } } },
    });

    render(<SellerDetailClient marketplace="trendyol" sellerRef="S1" />);

    const back = await screen.findByRole('link', { name: '← Marka satıcıları' });
    expect(back.getAttribute('href')).toBe('/watched-brands/sellers');
    expect(screen.queryByText('Sattığımız ürünlerde')).toBeNull();
    // The own-listings scrape coverage is the seller's; brand-only never runs that scrape.
    expect(screen.queryByText('Bu dönemde hiç tarama yapılmamış.')).toBeNull();
  });

  // Redesign phase 3 (plan 2026-11-03-ui-redesign-phase-3-rest, Task 7 and Review Focus 3).
  const EMPTY_DETAIL = {
    filters: { sinceMs: 0, untilMs: 1, watchedBrandId: null },
    seller: { marketplaceCode: 'trendyol', sellerRef: 'S1', sellerName: 'Test Satıcı', operatorNote: null, isKnown: true },
    group: null,
    groupMembers: [],
    listings: [],
    trackedProducts: [],
    trackedTruncated: false,
    watchedBrands: [],
    coverage: EMPTY_COVERAGE,
  };

  it('period filter keeps its selection', async () => {
    mockNavigation.searchParams = new URLSearchParams();
    // A clock that moves on every read: option values computed from `Date.now()` would never
    // equal the stored one again — the phase-2 bug this pins against.
    let clock = 1_800_000_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000));
    stubFetch({ [PRIMARY_ROUTE]: { body: EMPTY_DETAIL }, ...SIDE_ROUTES });

    render(<SellerDetailClient marketplace="trendyol" sellerRef="S1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Son 7 gün' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Son 7 gün' }).getAttribute('aria-pressed')).toBe('true'),
    );
    expect(screen.getByRole('button', { name: 'Son 30 gün' }).getAttribute('aria-pressed')).toBe('false');
    spy.mockRestore();
  });

  it('breadcrumb links back', async () => {
    mockNavigation.searchParams = new URLSearchParams();
    stubFetch({ [PRIMARY_ROUTE]: { body: EMPTY_DETAIL }, ...SIDE_ROUTES });

    render(<SellerDetailClient marketplace="trendyol" sellerRef="S1" />);

    const nav = await screen.findByRole('navigation', { name: 'Konum' });
    expect(within(nav).getByRole('link', { name: 'Rakip Satıcılar' }).getAttribute('href')).toBe('/competitors/sellers');
    expect(screen.getByRole('heading', { level: 1, name: 'Test Satıcı' })).toBeTruthy();
  });
});
