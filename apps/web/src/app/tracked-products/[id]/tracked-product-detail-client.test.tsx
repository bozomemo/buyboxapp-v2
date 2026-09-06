import { cleanup, render, screen } from '@testing-library/react';
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

    expect(await screen.findByText('Marka - Test Rakip Ürünü')).toBeTruthy();
    // "Rakip Satıcı" also names the buybox seller in the "Şu An" summary, so the seller-table row
    // is asserted specifically via its expand button rather than by text alone.
    expect(screen.getByRole('button', { name: 'Rakip Satıcı' })).toBeTruthy();
  });
});
