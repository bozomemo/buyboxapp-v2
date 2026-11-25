import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { BrandAlertsClient } from './alerts-client';

/**
 * Smoke test for `/brand/alerts` (doc 15 §6): one `fetch` stub per case, one stable phrase
 * asserted per case. The case beyond the usual four is staleness: an empty list beside a lane
 * that has not read anything must say "we have not looked", not "all clear" (doc 17 §5.4).
 */

afterEach(() => cleanup());

const fresh = { marketplaceCode: 'trendyol', displayName: 'Trendyol', lastOkAt: Date.now(), stale: false };

function violation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    brandProductId: 'bp1',
    brandProductName: 'Ton Balıklı 85g',
    trackedProductId: 'tp1',
    cardLabel: 'Ton 85g 2li',
    cardUrl: '/x-p-1',
    marketplaceCode: 'trendyol',
    kind: 'belowMin',
    sellerRef: '9',
    sellerName: 'Ucuzcu',
    state: 'open',
    firstSeenAt: Date.now() - 3_600_000,
    lastSeenAt: Date.now(),
    resolvedAt: null,
    resolution: null,
    thresholdApplied: '16000',
    unitMultiplier: 2,
    observedPrice: '15000',
    priceSource: 'price',
    basis: 'shelf',
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return { open: [], resolved: [], resolvedWindowMs: 7 * 86_400_000, staleness: [fresh], staleAfterMs: 7_200_000, availability: [], lowStockThreshold: 3, ...overrides };
}

describe('BrandAlertsClient', () => {
  it('loading: shows the loading message', async () => {
    stubFetch({ '/api/brand/alerts': { pending: true } });
    render(<BrandAlertsClient />);
    expect(await screen.findByText('Alarmlar yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure and a retry button', async () => {
    stubFetch({ '/api/brand/alerts': { reject: new Error('network down') } });
    render(<BrandAlertsClient />);
    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty and fresh: says no card is out of band', async () => {
    stubFetch({ '/api/brand/alerts': { body: body() } });
    render(<BrandAlertsClient />);
    expect(await screen.findByText('Açık ihlal yok.')).toBeTruthy();
    expect(screen.getByText(/hiçbirinde buybox satıcısı bandın dışında değil/)).toBeTruthy();
  });

  // Review 2026-11-25 Y6: the only linked card was paused, and the screen sent the operator to
  // Stok to link a card that was already linked.
  it('empty with every linked card paused: says so, not "nothing linked"', async () => {
    stubFetch({ '/api/brand/alerts': { body: body({ staleness: [], linkedCardCount: 1 }) } });
    render(<BrandAlertsClient />);
    expect(await screen.findByText('Açık ihlal yok.')).toBeTruthy();
    expect(screen.getByText(/bağlı kartlarınızın hepsi duraklatılmış/i)).toBeTruthy();
    expect(screen.queryByText(/hiçbir ürününüze pazaryeri kartı bağlanmamış/)).toBeNull();
  });

  it('empty with nothing linked: points to Stok', async () => {
    stubFetch({ '/api/brand/alerts': { body: body({ staleness: [], linkedCardCount: 0 }) } });
    render(<BrandAlertsClient />);
    expect(await screen.findByText(/hiçbir ürününüze pazaryeri kartı bağlanmamış/)).toBeTruthy();
  });

  // Review 2026-11-25 Y9: "webhook bekliyor · e-posta bekliyor · SMS bekliyor" with no channel set
  // up — those notifications will never go.
  it('says a channel is not set up rather than "waiting" for it', async () => {
    const notifications = [
      { channel: 'webhook', state: 'pending', reason: 'bildirilmedi: webhook adresi ayarlanmamış' },
      { channel: 'email', state: 'pending', reason: null },
    ];
    stubFetch({ '/api/brand/alerts': { body: body({ open: [violation({ notifications })] }) } });
    render(<BrandAlertsClient />);
    expect(await screen.findByText(/webhook ayarlı değil/)).toBeTruthy();
    expect(screen.getByText(/e-posta bekliyor/)).toBeTruthy();
  });

  it('empty but stale: leads with "not current", never "all clear"', async () => {
    stubFetch({
      '/api/brand/alerts': { body: body({ staleness: [{ ...fresh, lastOkAt: null, stale: true }] }) },
    });
    render(<BrandAlertsClient />);
    expect(await screen.findByText('Bu alarmlar güncel veriye dayanmıyor')).toBeTruthy();
    expect(screen.getByText(/ilanlar henüz hiç başarıyla taranmadı/)).toBeTruthy();
  });

  it('populated: groups by product and shows the gap to the bound', async () => {
    stubFetch({
      '/api/brand/alerts': {
        body: body({ open: [violation()], resolved: [violation({ id: 'v2', state: 'resolved', resolution: 'buyboxChanged', resolvedAt: Date.now() })] }),
      },
    });
    render(<BrandAlertsClient />);
    expect(await screen.findByText('Açık ihlaller (1)')).toBeTruthy();
    expect(screen.getAllByText('Ton Balıklı 85g').length).toBeGreaterThan(0);
    expect(screen.getByText('−%6,2')).toBeTruthy();
    expect(screen.getByText('Buybox el değiştirdi')).toBeTruthy();
  });

  /** Brand roadmap §6.7. */
  it('marks a coupon-only breach and filters by it', async () => {
    stubFetch({
      '/api/brand/alerts': {
        body: body({
          open: [
            violation({ id: 'shelf', cardLabel: 'Raf kartı' }),
            violation({ id: 'coupon', cardLabel: 'Kupon kartı', priceSource: 'finalPrice', basis: 'coupon' }),
          ],
        }),
      },
    });
    render(<BrandAlertsClient />);
    expect(await screen.findByText('yalnız kupon')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yalnız kupon (1)' }));
    expect(screen.queryByText('Raf kartı')).toBeNull();
    expect(screen.getByText('Kupon kartı')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Raf fiyatı (1)' }));
    expect(screen.queryByText('Kupon kartı')).toBeNull();
  });

  /** Brand roadmap §6.8. */
  it('lists shelf and stock warnings under Bulunurluk', async () => {
    const row = {
      trackedProductId: 'tp9',
      cardLabel: 'Boş raf kartı',
      cardUrl: '/y-p-9',
      marketplaceCode: 'trendyol',
      brandProductId: 'bp9',
      brandProductName: 'Somonlu 400g',
      unitMultiplier: 1,
      ratingCount: 1200,
      lastScrapedAt: Date.now(),
      lastSellerSeenAt: Date.now() - 3 * 86_400_000,
      buyboxSeller: null,
      offeredStock: null,
      sellerCount: 0,
    };
    stubFetch({
      '/api/brand/alerts': {
        body: body({
          availability: [
            { ...row, issue: 'noSellers' },
            { ...row, trackedProductId: 'tp10', cardLabel: 'Az stok kartı', issue: 'lowStock', buyboxSeller: 'Bayi A', offeredStock: 2, sellerCount: 3 },
          ],
        }),
      },
    });
    render(<BrandAlertsClient />);
    expect(await screen.findByText('Bulunurluk (2)')).toBeTruthy();
    expect(screen.getByText('Rafta yok')).toBeTruthy();
    expect(screen.getByText('Stok azalıyor')).toBeTruthy();
    expect(screen.getByText(/2 adet/)).toBeTruthy();
  });

  it('no warnings: says the shelf is fine', async () => {
    stubFetch({ '/api/brand/alerts': { body: body() } });
    render(<BrandAlertsClient />);
    expect(await screen.findByText('Bulunurluk uyarısı yok.')).toBeTruthy();
  });
});
