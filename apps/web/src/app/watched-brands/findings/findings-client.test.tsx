import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { FindingsClient } from './findings-client';

/**
 * Smoke test for `/watched-brands/findings` (doc 15 §6, Phase 2.4). Shape copied from
 * `alerts-client.test.tsx` (Phase 2.3, itself copied from the Phase 1c dashboard reference): one
 * `fetch` stub per case, one stable phrase asserted per case, no snapshots, no assertions on
 * layout or class names.
 *
 * `FindingsClient` fetches exactly one route on mount: `/api/brand-reports/findings`. The evidence
 * panel fetches `/api/brand-reports/evidence` only once an operator opens a finding's "Kanıt", so
 * it needs no stub here.
 */

afterEach(() => cleanup());

const THRESHOLDS = {
  belowMarketPct: 20,
  deepDiscountPct: 30,
  deepDiscountContrastPct: 10,
  undercutSharePct: 60,
  undercutMinProducts: 3,
  newSellerDays: 14,
  minObservations: 5,
  referenceBelowPct: 2,
  unrelatedCategoryMaxSharePct: 5,
  unrelatedCategoryMaxProducts: 3,
};

const BRAND = { id: 'brand-1', groupId: 'group-1', label: 'Örnek Marka', marketplaceCode: 'trendyol' };

const CATALOGUE = {
  groups: [{ id: 'group-1', name: 'Örnek Grup' }],
  brands: [BRAND],
  thresholds: THRESHOLDS,
  thresholdsAreDefault: true,
};

describe('FindingsClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ '/api/brand-reports/findings': { pending: true } });

    render(<FindingsClient />);

    expect(await screen.findByText('Bulgular yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ '/api/brand-reports/findings': { reject: new Error('network down') } });

    render(<FindingsClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({
      '/api/brand-reports/findings': {
        body: {
          ...CATALOGUE,
          brand: BRAND,
          needsBrand: false,
          findings: [],
          notificationsConfigured: true,
          filters: { sinceMs: Date.now() - 1000, untilMs: Date.now() },
          context: {
            hasAuthorisedList: true,
            sellerCount: 4,
            productCount: 10,
            truncatedDeviations: false,
            truncatedDisagreements: false,
            disagreementTotal: 0,
          },
        },
      },
    });

    render(<FindingsClient />);

    expect(await screen.findByText('Bu dönemde ve bu eşiklerle bulgu yok.')).toBeTruthy();
    expect(
      screen.getByText('Eşikler bir keşif aracıdır — hiçbir şey çıkmıyorsa daraltmayı deneyin.'),
    ).toBeTruthy();
  });

  it('populated: shows a finding and its stated/measured group', async () => {
    const now = Date.now();
    stubFetch({
      '/api/brand-reports/findings': {
        body: {
          ...CATALOGUE,
          brand: BRAND,
          needsBrand: false,
          findings: [
            {
              id: 'finding-1',
              kind: 'blockedSellerPresent',
              basis: 'stated',
              subject: {
                kind: 'seller',
                marketplaceCode: 'trendyol',
                sellerRef: 'seller-1',
                name: 'Yasaklı Satıcı A.Ş.',
              },
              thresholdKey: null,
              magnitude: 1,
              productCount: 3,
              lastSeenAt: now - 3_600_000,
              note: null,
              openedAt: now - 86_400_000,
              notifiedAt: null,
            },
          ],
          notificationsConfigured: true,
          filters: { sinceMs: now - 1000, untilMs: now },
          context: {
            hasAuthorisedList: true,
            sellerCount: 4,
            productCount: 10,
            truncatedDeviations: false,
            truncatedDisagreements: false,
            disagreementTotal: 0,
          },
        },
      },
    });

    render(<FindingsClient />);

    // The finding's kind and subject, in Turkish; the raw `kind`/`basis` enum values must not
    // reach the screen as their own words.
    expect(await screen.findByText('Yasaklı satıcı satışta')).toBeTruthy();
    expect(screen.getByText('Yasaklı Satıcı A.Ş.')).toBeTruthy();
    // "Kesin bilgi" appears both as the finding's badge and as the group heading it now sits
    // under (doc 15 §6, 2.4: the stated/measured split was implicit in sort order before).
    expect(screen.getAllByText('Kesin bilgi', { exact: false }).length).toBeGreaterThan(0);
  });
});
