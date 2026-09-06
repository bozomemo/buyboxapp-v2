import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { BrandSellersClient } from './brand-sellers-client';

/**
 * Smoke test for `/watched-brands/sellers` (doc 15 §6, Phase 3.3). Shape copied from
 * `policy-client.test.tsx`/`seller-detail-client.test.tsx`: one `fetch` stub per case, one stable
 * phrase asserted per case, no snapshots, no assertions on layout or class names.
 *
 * `BrandSellersClient` reads no `next/navigation` hooks, so there is no router mock here. It
 * fetches one route on mount, `/api/brand-reports/sellers` (with or without query parameters —
 * routes match on pathname only, see `stubFetch`), which gates the loading/error split. The
 * seller-identity panel (`seller-identity-panel.tsx`) is opened only on a row click and fetches
 * its own route, so it never runs in these four cases.
 */

afterEach(() => cleanup());

const ROUTE = '/api/brand-reports/sellers';

describe('BrandSellersClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [ROUTE]: { pending: true } });

    render(<BrandSellersClient />);

    expect(await screen.findByText('Rapor yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [ROUTE]: { reject: new Error('network down') } });

    render(<BrandSellersClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence when there is no offer record yet', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          filters: { sinceMs: 0, untilMs: 1, marketplaceCode: null, watchedBrandId: null, groupId: null },
          groups: [],
          brands: [],
          sellers: [],
          unidentifiedCount: 0,
          buybox: { totalLooks: 0, unidentifiedLooks: 0 },
        },
      },
    });

    const { container } = render(<BrandSellersClient />);

    // The sentence is interrupted mid-run by an inline `<code>` element (`ScrapeCompetitors`), so
    // no single node's own text equals it exactly — assert on the rendered text as a whole rather
    // than one element's `textContent`.
    await screen.findByRole('table');
    expect(container.textContent).toContain('Bu dönemde hiç teklif kaydı yok.');
  });

  it('populated: shows a seller row', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          filters: { sinceMs: 0, untilMs: 1, marketplaceCode: null, watchedBrandId: null, groupId: null },
          groups: [{ id: 'g1', name: 'Mars' }],
          brands: [{ id: 'b1', groupId: 'g1', label: 'Whiskas', marketplaceCode: 'trendyol' }],
          sellers: [
            {
              marketplaceCode: 'trendyol',
              sellerRef: 'S1',
              sellerName: 'Test Satıcı',
              groupId: null,
              groupName: null,
              operatorNote: null,
              productCount: 5,
              observationCount: 20,
              buyboxCount: 4,
              cheapestCount: 6,
              buyboxRate: 0.2,
              buyboxSharePct: 12,
              cheapestRate: 0.3,
              avgDeviationPct: null,
              verdict: null,
              minPrice: null,
              maxPrice: null,
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
            },
          ],
          unidentifiedCount: 0,
          buybox: { totalLooks: 4, unidentifiedLooks: 0 },
        },
      },
    });

    render(<BrandSellersClient />);

    expect(await screen.findByText('Test Satıcı')).toBeTruthy();
  });
});
