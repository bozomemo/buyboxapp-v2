import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatTime } from '@/lib/format';
import { PermissionsProvider } from '@/lib/permissions';
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

  // doc 17 §1: a brand-only install has no prices to submit, so neither the verdict nor its chips
  // may talk about them — found on a real brand-only run (2026-09-19), whose verdict read
  // "fiyatlandırma güvenilir şekilde ilerlemiyor".
  it('brand-only: the verdict says nothing about prices', async () => {
    stubFetch({
      '/api/dashboard': {
        body: {
          modules: { seller: false, brand: true },
          brandAudit: null,
          systemPaused: false,
          globalKillSwitchEngaged: true,
          marketplaces: [
            {
              code: 'trendyol',
              displayName: 'Trendyol',
              enabled: true,
              killSwitchEngaged: false,
              automationEnabled: false,
              budget: { consumed: 0, allowance: 0, reservePct: 10 },
              health: {
                lastImportAt: null,
                lastBuyboxObservationAt: null,
                reachable: true,
                scrapeFailureRatePct: 0,
              },
            },
          ],
          phaseDistribution: {},
          competitorAlerts: { open: 0, coverage: [], staleMarketplaces: [] },
          alerts: [],
          recentDecisions: [],
        },
      },
      '/api/health': { body: HEALTH_OK },
    });

    render(<DashboardClient />);

    expect(await screen.findByText('İşler çalışıyor ve müdahale gerektiren bir şey yok.')).toBeTruthy();
    expect(screen.queryByText(/Fiyat gönderimi/)).toBeNull();
  });

  describe('redesign (plan 2026-11-03 phase 2, Task 2)', () => {
    const BRAND_ONLY = {
      modules: { seller: false, brand: true },
      systemPaused: false,
      globalKillSwitchEngaged: true,
      marketplaces: [
        {
          code: 'trendyol',
          displayName: 'Trendyol',
          enabled: true,
          killSwitchEngaged: false,
          automationEnabled: false,
          budget: { consumed: 0, allowance: 0, reservePct: 10 },
          health: { lastImportAt: null, lastBuyboxObservationAt: null, reachable: true, scrapeFailureRatePct: 0 },
        },
      ],
      phaseDistribution: {},
      competitorAlerts: { open: 0, coverage: [], staleMarketplaces: [] },
      alerts: [],
      recentDecisions: [],
      brandAudit: {
        windowMs: 30 * 86_400_000,
        openFindings: { stated: 9, measured: 5 },
        brands: [
          { id: 'b1', label: 'Miyav Gold', marketplaceCode: 'trendyol', productCount: 84, noSellerCount: 4, neverLookedCount: 0, openFindings: 9, lastSweptAt: Date.now() },
          { id: 'b2', label: 'Havhav Pro', marketplaceCode: 'trendyol', productCount: 44, noSellerCount: 2, neverLookedCount: 0, openFindings: 5, lastSweptAt: Date.now() },
        ],
        referencePrice: { productsWithPrice: 120, productsTotal: 128 },
        trend: [],
      },
    };

    it('stat row from brand audit', async () => {
      stubFetch({ '/api/dashboard': { body: BRAND_ONLY }, '/api/health': { body: HEALTH_OK } });
      render(<DashboardClient />);
      const row = await screen.findByTestId('dashboard-stats');
      expect(row.className).toContain('grid-cols-2');
      expect(row.className).toContain('lg:grid-cols-4');
      const stats = within(row);
      expect(stats.getByText('Açık bulgu')).toBeTruthy();
      expect(stats.getByText('14')).toBeTruthy();
      expect(stats.getByText('Satıcısı olmayan ürün')).toBeTruthy();
      expect(stats.getByText('6')).toBeTruthy();
      expect(stats.getByText('Tavsiye fiyat kapsamı')).toBeTruthy();
      expect(stats.getByText('%94')).toBeTruthy();
      expect(stats.getByText('Takip edilen ürün')).toBeTruthy();
      expect(stats.getByText('128')).toBeTruthy();
    });

    it('a failed refresh warns above the brand numbers it qualifies', async () => {
      stubFetch({ '/api/dashboard': { body: BRAND_ONLY }, '/api/health': { body: HEALTH_OK } });
      render(<DashboardClient />);
      const row = await screen.findByTestId('dashboard-stats');
      stubFetch({ '/api/dashboard': { reject: new Error('server down') }, '/api/health': { body: HEALTH_OK } });
      fireEvent.click(screen.getByRole('button', { name: 'Yenile' }));
      const alert = await screen.findByText(/Son yenileme başarısız oldu/);
      // "Aşağıdaki bilgiler … itibarıyladır" must sit above every number it describes.
      expect(alert.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    // "Aşağıdaki bilgiler … itibarıyladır" names the last *good* read. A failed refresh used to
    // advance it too, so the warning dated stale numbers to the moment they failed to update.
    it('a failed refresh keeps the time of the last good read', async () => {
      const goodAt = new Date('2026-11-03T10:00:00').getTime();
      const failedAt = new Date('2026-11-03T10:05:00').getTime();
      const now = vi.spyOn(Date, 'now').mockReturnValue(goodAt);
      stubFetch({ '/api/dashboard': { body: BRAND_ONLY }, '/api/health': { body: HEALTH_OK } });
      render(<DashboardClient />);
      await screen.findByTestId('dashboard-stats');
      now.mockReturnValue(failedAt);
      stubFetch({ '/api/dashboard': { reject: new Error('server down') }, '/api/health': { body: HEALTH_OK } });
      fireEvent.click(screen.getByRole('button', { name: 'Yenile' }));
      const alert = await screen.findByText(/Son yenileme başarısız oldu/);
      expect(alert.textContent).toContain(formatTime(goodAt));
      expect(alert.textContent).not.toContain(formatTime(failedAt));
      now.mockRestore();
    });

    it('no stat row without brand audit', async () => {
      stubFetch({ '/api/dashboard': { body: { ...BRAND_ONLY, brandAudit: null } }, '/api/health': { body: HEALTH_OK } });
      render(<DashboardClient />);
      await screen.findByText('İşler çalışıyor ve müdahale gerektiren bir şey yok.');
      expect(screen.queryByText('Açık bulgu')).toBeNull();
    });

    it('verdict stays the page h1', async () => {
      stubFetch({ '/api/dashboard': { body: { ...BRAND_ONLY, brandAudit: null } }, '/api/health': { body: HEALTH_OK } });
      render(<DashboardClient />);
      expect(await screen.findByRole('heading', { level: 1, name: 'Her şey yolunda' })).toBeTruthy();
    });

    it('keeps permission gating', async () => {
      stubFetch({
        '/api/dashboard': { body: { ...BRAND_ONLY, modules: { seller: true, brand: true }, brandAudit: null } },
        '/api/health': { body: HEALTH_OK },
        '/api/auth/me': { body: { user: { permissions: ['view'] } } },
      });
      render(
        <PermissionsProvider>
          <DashboardClient />
        </PermissionsProvider>,
      );
      const toggle = await screen.findByRole('button', { name: 'Fiyat gönderimini aç' });
      await vi.waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(true));
      expect(toggle.getAttribute('title')).toBe('Bu işlem için yetkiniz yok');
    });
  });
});
