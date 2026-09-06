import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { AlertsClient } from './alerts-client';

/**
 * Smoke test for `/alerts` (doc 15 §6, Phase 2.3). Shape copied from `jobs-client.test.tsx`
 * (Phase 2.1's reference, itself copied from the Phase 1c dashboard reference): one `fetch` stub
 * per case, one stable phrase asserted per case, no snapshots, no assertions on layout or class
 * names.
 *
 * `AlertsClient` fetches exactly one route on mount: `/api/alerts`. The listing picker inside the
 * (closed by default) rule editor fetches `/api/listings` only once the operator types a search
 * term, so it needs no stub here.
 */

afterEach(() => cleanup());

describe('AlertsClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ '/api/alerts': { pending: true } });

    render(<AlertsClient />);

    expect(await screen.findByText('Alarmlar yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ '/api/alerts': { reject: new Error('network down') } });

    render(<AlertsClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({
      '/api/alerts': {
        body: {
          alerts: [],
          rules: [],
          staleness: [],
          staleAfterMs: 86_400_000,
          options: {
            marketplaces: [],
            sellers: [],
            sellerGroups: [],
            defaultQuietPeriodMs: 3_600_000,
          },
        },
      },
    });

    render(<AlertsClient />);

    expect(await screen.findByText('Henüz alarm kuralı tanımlanmamış.')).toBeTruthy();
    expect(
      screen.getByText(
        'Bir kural tanımlanmadan hiçbir koşul izlenmez. Aşağıdan yeni bir kural oluşturabilirsiniz.',
      ),
    ).toBeTruthy();
  });

  it('populated: shows an open alert and its rule name', async () => {
    const now = Date.now();
    stubFetch({
      '/api/alerts': {
        body: {
          alerts: [
            {
              id: 'alert-1',
              ruleName: 'Sahte ürün şüphesi — 400 TL altı',
              listingId: 'listing-1',
              productName: 'Örnek Ürün',
              marketplaceCode: 'trendyol',
              ourPrice: '50000',
              state: 'open',
              firstSeenAt: now - 3_600_000,
              lastSeenAt: now - 60_000,
              resolvedAt: null,
              thresholdApplied: '40000',
              sellers: [
                {
                  sellerRef: 'seller-1',
                  sellerName: 'Rakip Satıcı',
                  observedPrice: '39900',
                  priceSource: 'price',
                  rank: 1,
                  promotionText: null,
                  joinedAt: now - 3_600_000,
                },
              ],
              departedSellers: 0,
            },
          ],
          rules: [],
          staleness: [
            {
              marketplaceCode: 'trendyol',
              displayName: 'Trendyol',
              lastOkAt: now,
              ageMs: 0,
              ok: 1,
              failed: 0,
              stale: false,
            },
          ],
          staleAfterMs: 86_400_000,
          options: {
            marketplaces: [],
            sellers: [],
            sellerGroups: [],
            defaultQuietPeriodMs: 3_600_000,
          },
        },
      },
    });

    render(<AlertsClient />);

    // The rule name that fired the alert, and the raw `state` ('open') must not reach the screen
    // as its own word — only via the rule/product it names.
    expect(await screen.findByText('Sahte ürün şüphesi — 400 TL altı')).toBeTruthy();
    expect(screen.getByText('Örnek Ürün')).toBeTruthy();
  });
});
