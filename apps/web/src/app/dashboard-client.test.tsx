import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { DashboardClient } from './dashboard-client';

/**
 * The reference smoke test for the screen-test harness (plan doc 15 §6, Phase 1c). Every later
 * screen's `<screen>-client.test.tsx` copies this shape: one `fetch` stub per case, one stable
 * phrase asserted per case, no snapshots, no assertions on layout or class names.
 */

afterEach(() => cleanup());

const HEALTH_OK = {
  status: 'ok',
  database: { configured: true, reachable: true },
  worker: { running: true },
  warnings: [] as string[],
};

describe('DashboardClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({
      '/api/dashboard': { pending: true },
      '/api/health': { pending: true },
    });

    render(<DashboardClient />);

    expect(await screen.findByText('Sistem durumu okunuyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({
      '/api/dashboard': { reject: new Error('network down') },
      '/api/health': { reject: new Error('network down') },
    });

    render(<DashboardClient />);

    expect(await screen.findByText('Panel verisi yüklenemedi')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({
      '/api/dashboard': {
        body: {
          brandAudit: null,
          systemPaused: false,
          globalKillSwitchEngaged: true,
          marketplaces: [],
          phaseDistribution: {},
          competitorAlerts: { open: 0, coverage: [], staleMarketplaces: [] },
          alerts: [],
          recentDecisions: [],
        },
      },
      '/api/health': { body: HEALTH_OK },
    });

    render(<DashboardClient />);

    expect(
      await screen.findByText(
        'Henüz fiyatlandırılan ilan yok. İlanlar içe aktarıldıktan ve otomasyon açıldıktan sonra burası dolar.',
      ),
    ).toBeTruthy();
  });

  it('populated: shows the verdict headline and a decision row', async () => {
    stubFetch({
      '/api/dashboard': {
        body: {
          brandAudit: null,
          systemPaused: false,
          globalKillSwitchEngaged: false,
          marketplaces: [
            {
              code: 'trendyol',
              displayName: 'Trendyol',
              enabled: true,
              killSwitchEngaged: false,
              automationEnabled: true,
              budget: { consumed: 10, allowance: 100, reservePct: 10 },
              health: {
                lastImportAt: Date.now(),
                lastBuyboxObservationAt: Date.now(),
                reachable: true,
                scrapeFailureRatePct: 0,
              },
            },
          ],
          phaseDistribution: { SEEKING: 1, CLIMBING: 0, REFINING: 0, OPTIMUM: 4, BLOCKED: 0 },
          competitorAlerts: { open: 0, coverage: [], staleMarketplaces: [] },
          alerts: [],
          recentDecisions: [
            {
              id: 'd1',
              listingId: 'l1',
              marketplaceCode: 'trendyol',
              productName: 'Test Ürünü',
              oldPrice: '10000',
              newPrice: '9500',
              reason: 'undercut',
              explanation: 'undercut nearest competitor',
              state: 'confirmed',
              decidedAt: Date.now(),
            },
          ],
        },
      },
      '/api/health': { body: HEALTH_OK },
    });

    render(<DashboardClient />);

    expect(await screen.findByText('Her şey yolunda')).toBeTruthy();
    expect(screen.getByText('Test Ürünü')).toBeTruthy();
  });
});
