import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  describe('redesign (plan 2026-11-03 phase 2, Task 6)', () => {
    it('page header carries the breadcrumb and row actions keep their titles', async () => {
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
                    id: 'b1', marketplaceCode: 'trendyol', label: 'Whiskas', brandRef: '104703', searchTerm: 'whiskas',
                    isActive: true, lastSweptAt: Date.now(), lastSweepProductCount: 887, productCount: 887, unratedCount: 574,
                    isOwnBrand: true, noSellerCount: 3, neverLookedCount: 0, suggestedBrandRef: null,
                  },
                ],
              },
            ],
          },
        },
        ...EMPTY_SIDE_ROUTES,
      });
      render(<WatchedBrandsClient />);
      await screen.findByText('Whiskas');
      expect(screen.getByRole('navigation', { name: 'Konum' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Sadece katalog' }).getAttribute('title')).toBe(
        'Yalnızca katalog: hangi ürünler var? Satıcı/buybox verisi toplanmaz.',
      );
      // The counts include cards nobody sells, which Takip Edilen Ürünler hides by default since
      // 2026-11-08 — so the count links ask for every card, or the list would show fewer rows
      // than the number that was clicked.
      expect(screen.getByRole('link', { name: '887' }).getAttribute('href')).toContain('includeNoSeller=true');
      expect(screen.getByRole('link', { name: '(574 değerlendirmesiz)' }).getAttribute('href')).toContain(
        'includeNoSeller=true',
      );
    });
  });
});

// Review 2026-11-25 Y12: Kaldır left every product the brand found in tracking.
describe('Kaldır', () => {
  const BRAND = {
    id: 'b1', marketplaceCode: 'trendyol', label: 'Test Marka', brandRef: null, searchTerm: 'testmarka',
    isActive: true, lastSweptAt: Date.now(), lastSweepProductCount: 4911, productCount: 4911, unratedCount: 0,
    isOwnBrand: true, noSellerCount: 0, neverLookedCount: 0, suggestedBrandRef: null,
  };

  function deleteUrls(): string[] {
    return vi
      .mocked(fetch)
      .mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE')
      .map((c) => String(c[0]));
  }

  async function openRemove() {
    stubFetch({
      '/api/watched-brands': { body: { groups: [{ id: 'g1', name: 'Mars', note: null, brands: [BRAND] }] } },
      '/api/watched-brands/b1': { body: { ok: true, deletedProducts: 4911, keptProducts: 0 } },
      ...EMPTY_SIDE_ROUTES,
    });
    render(<WatchedBrandsClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'Kaldır' }));
    return screen.findByRole('alertdialog');
  }

  it('offers to delete the products the brand found, off by default', async () => {
    const dialog = await openRemove();
    const box = (await screen.findByRole('checkbox', { name: /4.911 ürünü de sil/ })) as HTMLInputElement;
    expect(dialog.contains(box)).toBe(true);
    expect(box.checked).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Kaldır' }).at(-1)!);
    await waitFor(() => expect(deleteUrls()).toEqual(['/api/watched-brands/b1']));
  });

  it('asks the server to delete them when ticked', async () => {
    await openRemove();
    fireEvent.click(await screen.findByRole('checkbox', { name: /4.911 ürünü de sil/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Kaldır' }).at(-1)!);
    await waitFor(() => expect(deleteUrls()).toEqual(['/api/watched-brands/b1?withProducts=1']));
  });
});
