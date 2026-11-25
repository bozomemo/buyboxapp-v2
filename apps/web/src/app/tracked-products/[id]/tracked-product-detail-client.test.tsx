import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { TrackedProductDetailClient } from './tracked-product-detail-client';

/**
 * Smoke test for `/tracked-products/[id]` (doc 15 §6, Phase 3.5). Shape copied from
 * `listing-detail-client.test.tsx`: one `fetch` stub per case, one stable phrase asserted per
 * case, no snapshots, no assertions on layout or class names.
 *
 * Like `ListingDetailClient`, this screen never calls `useSearchParams`/`usePathname` — `id`
 * arrives as a plain prop from `page.tsx`, which resolves the dynamic route segment server-side —
 * so `next/navigation` needs no mock here.
 */

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/tracked-products/t1';

const BASE_PRODUCT = {
  id: 't1',
  marketplaceCode: 'trendyol',
  productRef: 'PR1',
  productUrl: 'https://www.trendyol.com/urun/p-1',
  label: 'Marka - Test Rakip Ürünü',
  isActive: true,
  addedAt: Date.now(),
  lastScrapedAt: Date.now(),
};

const EMPTY_BODY = {
  product: BASE_PRODUCT,
  window: { sinceMs: Date.now() - 1000, untilMs: Date.now() },
  latestLook: null,
  looks: [],
  sellers: [],
};

const POPULATED_BODY = {
  product: BASE_PRODUCT,
  window: { sinceMs: Date.now() - 1000, untilMs: Date.now() },
  latestLook: { observedAt: Date.now(), status: 'ok', offers: 2 },
  looks: [{ observedAt: Date.now(), status: 'ok', offers: 2, buyboxPrice: '10000' }],
  sellers: [
    {
      key: 's1',
      sellerName: 'Rakip Satıcı',
      sellerRef: 'S1',
      unverifiedKey: false,
      current: {
        observedAt: Date.now(),
        rank: 1,
        price: '10000',
        finalPrice: '10000',
        offeredStock: 10,
        sellerRating: 4.5,
        dispatchTime: 1,
        hasPromotion: false,
        promotionText: null,
      },
      previousPrice: null,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      points: [
        {
          observedAt: Date.now(),
          rank: 1,
          price: '10000',
          finalPrice: '10000',
          offeredStock: 10,
          sellerRating: 4.5,
          dispatchTime: 1,
          hasPromotion: false,
          promotionText: null,
        },
      ],
    },
  ],
};

describe('TrackedProductDetailClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true } });

    render(<TrackedProductDetailClient id="t1" />);

    expect(await screen.findByText('Ürün yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { status: 500, body: { error: 'Ürün yüklenemedi.' } } });

    render(<TrackedProductDetailClient id="t1" />);

    expect(await screen.findByText('Ürün yüklenemedi.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: EMPTY_BODY } });

    render(<TrackedProductDetailClient id="t1" />);

    expect(await screen.findByText('Bu ürün için henüz satıcı gözlemi yok.')).toBeTruthy();
    expect(screen.getByText('Henüz bakış yok.')).toBeTruthy();
  });

  it('populated: shows the product title and a seller row', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: POPULATED_BODY } });

    render(<TrackedProductDetailClient id="t1" />);

    // The title is also the breadcrumb's last crumb now; the page heading is the one that counts.
    expect(await screen.findByRole('heading', { level: 1, name: 'Marka - Test Rakip Ürünü' })).toBeTruthy();
    // "Rakip Satıcı" also names the buybox seller in the "Şu An" summary, so the seller-table row
    // is asserted specifically via its expand button rather than by text alone.
    expect(screen.getByRole('button', { name: 'Rakip Satıcı' })).toBeTruthy();
  });

  function withSellers(...currents: Record<string, unknown>[]) {
    const template = POPULATED_BODY.sellers[0]!;
    return {
      ...POPULATED_BODY,
      sellers: currents.map((current, i) => ({
        ...template,
        key: `s${i}`,
        sellerName: `Satıcı ${i}`,
        sellerRef: `S${i}`,
        current: { ...template.current, ...current },
      })),
    };
  }

  // Review 2026-11-25 Y8: no seller showed a stock and the card said "0" — read as an empty shelf.
  it('shows total stock as unknown when no seller states one, never as 0', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: withSellers({ offeredStock: null }, { offeredStock: null }) } });
    render(<TrackedProductDetailClient id="t1" />);
    const label = await screen.findByText('Toplam Görünen Stok');
    expect(label.nextElementSibling?.textContent).toBe('bilinmiyor');
  });

  it('says a partial total is a floor when some sellers do not state stock', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: withSellers({ offeredStock: 10 }, { offeredStock: null }) } });
    render(<TrackedProductDetailClient id="t1" />);
    const label = await screen.findByText('Toplam Görünen Stok');
    expect(label.nextElementSibling?.textContent).toBe('en az 10');
  });

  // Review 2026-11-25 O10: Trendyol's price already includes the promotion, so the two columns
  // were the same number on nearly every row and read as "the basket discount is missing".
  it('shows one price column, with the basket price only where it differs', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: {
        body: withSellers({ price: '10000', finalPrice: '10000' }, { price: '10000', finalPrice: '9000' }),
      },
    });
    render(<TrackedProductDetailClient id="t1" />);
    await screen.findByRole('button', { name: 'Satıcı 0' });
    expect(screen.queryByRole('columnheader', { name: 'Müşteri Fiyatı' })).toBeNull();
    expect(screen.getAllByText(/sepette/)).toHaveLength(1);
  });

  it('writes a seller rating with a Turkish decimal comma, and no rating as a dash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: withSellers({ sellerRating: 8.5 }, { sellerRating: 0 }) } });
    render(<TrackedProductDetailClient id="t1" />);
    await screen.findByRole('button', { name: 'Satıcı 0' });
    expect(screen.getByText('8,5')).toBeTruthy();
    expect(screen.queryByText('0.0')).toBeNull();
  });

  // Redesign phase 3 (plan 2026-11-03-ui-redesign-phase-3-rest, Task 7): a detail screen names
  // where it sits and links back to its list from the breadcrumb.
  it('breadcrumb links back', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: POPULATED_BODY } });

    render(<TrackedProductDetailClient id="t1" />);

    const nav = await screen.findByRole('navigation', { name: 'Konum' });
    expect(within(nav).getByRole('link', { name: 'Takip Edilen Ürünler' }).getAttribute('href')).toBe('/tracked-products');
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });
});
