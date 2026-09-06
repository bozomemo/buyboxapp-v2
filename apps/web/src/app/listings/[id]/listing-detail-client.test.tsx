import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { ListingDetailClient } from './listing-detail-client';

/**
 * Smoke test for `/listings/[id]` (doc 15 §6, Phase 3.4). Shape copied from
 * `seller-detail-client.test.tsx`/`brand-sellers-client.test.tsx`: one `fetch` stub per case, one
 * stable phrase asserted per case, no snapshots, no assertions on layout or class names.
 *
 * Unlike `SellerDetailClient`, this screen never calls `useSearchParams`/`usePathname` — `id`
 * arrives as a plain prop from `page.tsx`, which resolves the dynamic route segment server-side —
 * so `next/navigation` needs no mock here.
 */

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/listings/l1';

const BASE_LISTING = {
  id: 'l1',
  marketplaceCode: 'trendyol',
  marketplaceListingId: 'ml1',
  sellerStockCode: 'SSC1',
  baseStockCode: 'BASE1',
  productName: 'Test Ürünü',
  price: '10000',
  offeredStock: 5,
  isSalable: true,
  isLocked: false,
  isSuspended: false,
  isBlacklisted: false,
  lockReasons: null,
  deactivationReasons: null,
  minPrice: null,
  maxPrice: null,
  repriceEnabled: true,
  lastSeenAt: Date.now(),
};

const EMPTY_BODY = {
  listing: BASE_LISTING,
  waterfall: null,
  competition: { buybox: null, offers: [], priceHistory: [] },
  engine: null,
  lastDecisionExplanation: null,
  history: [],
};

const POPULATED_BODY = {
  listing: BASE_LISTING,
  waterfall: {
    unitCost: '5000',
    cargo: '500',
    commission: '1000',
    vatRate: 20,
    floorPrice: '8000',
  },
  competition: {
    buybox: {
      observedAt: Date.now(),
      rank: 1,
      buyboxPrice: '10000',
      secondPrice: '10500',
      thirdPrice: null,
      hasMultipleSeller: true,
    },
    offers: [
      {
        sellerName: 'Rakip Satıcı',
        sellerRef: 'S1',
        rank: 1,
        price: '10000',
        finalPrice: '10000',
        rating: 4.5,
        dispatchTime: 1,
        offeredStock: 10,
        hasPromotion: false,
      },
    ],
    priceHistory: [
      {
        observedAt: Date.now(),
        buyboxPrice: '10000',
        secondPrice: '10500',
        rank: 1,
        buyboxSellerName: 'Rakip Satıcı',
        buyboxSellerRef: 'S1',
      },
    ],
  },
  engine: {
    phase: 'CLIMBING',
    lastGoodPrice: '9500',
    lastBadPrice: null,
    optimumPrice: '10200',
    settleUntil: null,
    consecutiveRejections: 0,
    updatedAt: Date.now(),
  },
  lastDecisionExplanation: {
    reason: 'Climbing',
    explanation: 'engine explanation text',
    decidedAt: Date.now(),
  },
  history: [
    {
      id: 'h1',
      decidedAt: Date.now(),
      oldPrice: '9800',
      newPrice: '10000',
      reason: 'Climbing',
      explanation: 'engine explanation text',
      state: 'confirmed',
      failureCode: null,
      failureMessage: null,
      floorPrice: '8000',
      buyboxPrice: '10000',
      rank: 1,
    },
  ],
};

describe('ListingDetailClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true } });

    render(<ListingDetailClient id="l1" />);

    expect(await screen.findByText('İlan yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { status: 500, body: { error: 'İlan yüklenemedi.' } } });

    render(<ListingDetailClient id="l1" />);

    expect(await screen.findByText('İlan yüklenemedi.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: EMPTY_BODY } });

    render(<ListingDetailClient id="l1" />);

    expect(await screen.findByText('Bu ilan için henüz fiyat gönderimi yok.')).toBeTruthy();
  });

  it('populated: shows the listing title and a history row', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: POPULATED_BODY } });

    render(<ListingDetailClient id="l1" />);

    expect(await screen.findByText('Test Ürünü')).toBeTruthy();
    expect(screen.getByText('Rakip Satıcı')).toBeTruthy();
  });
});
