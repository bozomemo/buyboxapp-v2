import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockNavigation, stubFetch } from '@/test-utils';
import { publishDashboardFreshness, resetDashboardFeed } from '@/lib/dashboard-feed';
import { NavShell } from './nav-shell';

/**
 * Smoke test for `nav-shell.tsx` (doc 15 §6, Phase 7). Shape copied from `fees-client.test.tsx`:
 * one `fetch` stub per case, one stable phrase asserted per case, no snapshots.
 *
 * Unlike a screen client, the shell has two independent polls (`/api/system-pause`,
 * `/api/license`) rather than one primary load, so "loading" and "error" below cover both at
 * once, and "empty"/"populated" are read as the shell's two steady states — licence fine and
 * paused-with-grace-warning — rather than an empty-vs-filled list.
 *
 * `usePathname` is mocked because `nav-shell` calls it directly (doc 15 §6, Phase 1c trap 3).
 */

vi.mock('next/navigation', () => ({
  usePathname: () => mockNavigation.pathname,
  useSearchParams: () => mockNavigation.searchParams,
  useRouter: () => mockNavigation.router,
}));

afterEach(() => {
  cleanup();
  // The view switch remembers its choice; one test's click must not become the next test's view.
  // Guarded because this jsdom's `localStorage` is not always a working Storage.
  try {
    window.localStorage.removeItem('buybox.navView');
  } catch {
    // nothing stored, nothing to leak
  }
});

const SYSTEM_PAUSE_ROUTE = '/api/system-pause';
const LICENSE_ROUTE = '/api/license';

describe('NavShell', () => {
  it('loading: renders the sidebar immediately and shows the system-status loading text', async () => {
    stubFetch({
      [SYSTEM_PAUSE_ROUTE]: { pending: true },
      [LICENSE_ROUTE]: { pending: true },
    });

    render(
      <NavShell>
        <p>içerik</p>
      </NavShell>,
    );

    // The shell chrome does not wait on either poll to appear.
    expect(screen.getByRole('link', { name: 'Panel' })).toBeTruthy();
    expect(await screen.findByText('Sistem durumu yükleniyor…')).toBeTruthy();
  });

  it('error: both polls failing show retry affordances, not a silently empty header', async () => {
    stubFetch({
      [SYSTEM_PAUSE_ROUTE]: { reject: new Error('system-pause down') },
      [LICENSE_ROUTE]: { reject: new Error('license down') },
    });

    render(
      <NavShell>
        <p>içerik</p>
      </NavShell>,
    );

    expect(await screen.findByRole('button', { name: 'Sistem durumu alınamadı — Tekrar dene' })).toBeTruthy();
    expect(await screen.findByText('Lisans durumu okunamadı: license down', { exact: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  // Redesign phase 3 (plan 2026-11-03-ui-redesign-phase-3-rest, Task 12): the header's failure
  // state is a kit danger button, and clicking it asks again.
  it('status error offers retry', async () => {
    stubFetch({
      [SYSTEM_PAUSE_ROUTE]: { reject: new Error('system-pause down') },
      [LICENSE_ROUTE]: { body: { status: { state: 'valid' } } },
    });

    render(
      <NavShell>
        <p>içerik</p>
      </NavShell>,
    );

    const retry = await screen.findByRole('button', { name: 'Sistem durumu alınamadı — Tekrar dene' });
    expect(retry.className).toContain('bg-(--color-danger)');
    expect(retry.getAttribute('title')).toBe('system-pause down');
    const calls = () =>
      vi.mocked(globalThis.fetch).mock.calls.filter((call) => String(call[0]) === SYSTEM_PAUSE_ROUTE).length;
    const before = calls();
    fireEvent.click(retry);
    await vi.waitFor(() => expect(calls()).toBeGreaterThan(before));
  });

  it('empty: a valid licence and a running system show no banner and no alarm colour', async () => {
    stubFetch({
      [SYSTEM_PAUSE_ROUTE]: { body: { engaged: false } },
      [LICENSE_ROUTE]: { body: { status: { state: 'valid' } } },
    });

    render(
      <NavShell>
        <p>içerik</p>
      </NavShell>,
    );

    expect(await screen.findByRole('button', { name: 'Sistem Çalışıyor' })).toBeTruthy();
    expect(screen.queryByText(/Lisans süresi doldu/)).toBeNull();
  });

  it('populated: a paused system and a licence in its grace window both surface, by name', async () => {
    stubFetch({
      [SYSTEM_PAUSE_ROUTE]: { body: { engaged: true } },
      [LICENSE_ROUTE]: { body: { status: { state: 'grace', graceDaysRemaining: 3 } } },
    });

    render(
      <NavShell>
        <p>içerik</p>
      </NavShell>,
    );

    expect(await screen.findByRole('button', { name: 'Genel Durdurma: Duraklatıldı' })).toBeTruthy();
    expect(await screen.findByText(/Lisans süresi doldu\. Sistem 3 gün sonra duracak\./)).toBeTruthy();
  });

  describe('modules (doc 17 §1.3)', () => {
    const base = {
      [SYSTEM_PAUSE_ROUTE]: { body: { engaged: false } },
      [LICENSE_ROUTE]: { body: { status: { state: 'valid' } } },
    };

    it('brand-only: the seller group is not drawn and there is nothing to switch between', async () => {
      stubFetch({ ...base, '/api/modules': { body: { modules: { seller: false, brand: true } } } });
      render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      expect(await screen.findByRole('link', { name: 'Takip Edilen Ürünler' })).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'Rakip Geçmişi' })).toBeNull();
      expect(screen.queryByRole('group', { name: 'Menü görünümü' })).toBeNull();
    });

    it('both installed: both groups by default, and the view switch narrows them', async () => {
      stubFetch({ ...base, '/api/modules': { body: { modules: { seller: true, brand: true } } } });
      render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      expect(await screen.findByRole('group', { name: 'Menü görünümü' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Rakip Geçmişi' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Takip Edilen Ürünler' })).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Marka' }));
      expect(screen.queryByRole('link', { name: 'Rakip Geçmişi' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Takip Edilen Ürünler' })).toBeTruthy();
      // The shared groups never depend on the view.
      expect(screen.getByRole('link', { name: 'İşler' })).toBeTruthy();
    });
  });

  describe('sidebar (spec 2026-11-03-ui-redesign §5.2)', () => {
    const base = {
      [SYSTEM_PAUSE_ROUTE]: { body: { engaged: false } },
      [LICENSE_ROUTE]: { body: { status: { state: 'valid' } } },
    };
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    let stored: Map<string, string>;

    beforeEach(() => {
      stored = new Map();
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: (k: string) => stored.get(k) ?? null,
          setItem: (k: string, v: string) => void stored.set(k, v),
          removeItem: (k: string) => void stored.delete(k),
        },
      });
    });

    afterEach(() => {
      if (original) Object.defineProperty(window, 'localStorage', original);
    });

    it('collapsed rail keeps link names', async () => {
      stored.set('buybox.navCollapsed', '1');
      stubFetch(base);
      render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      expect(await screen.findByRole('button', { name: 'Menüyü genişlet' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Panel' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'İşler' })).toBeTruthy();
    });

    it('rail toggle', async () => {
      stubFetch(base);
      render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Menüyü daralt' }));
      expect(screen.getByRole('button', { name: 'Menüyü genişlet' })).toBeTruthy();
      expect(stored.get('buybox.navCollapsed')).toBe('1');
    });

    // The stored width is read after mount; animating that first change slid the rail shut on
    // every full page load. Only the operator's own toggle animates.
    it('rail does not animate the stored width on load', async () => {
      stored.set('buybox.navCollapsed', '1');
      stubFetch(base);
      const { container } = render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Menüyü genişlet' }));
      const aside = container.querySelector('aside')!;
      expect(aside.className).toContain('transition-[width]');
      cleanup();
      stored.set('buybox.navCollapsed', '1');
      stubFetch(base);
      const again = render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      await screen.findByRole('button', { name: 'Menüyü genişlet' });
      expect(again.container.querySelector('aside')!.className).not.toContain('transition');
    });

    it('sidebar surfaces are tokens, not white overlays', async () => {
      stubFetch(base);
      const { container } = render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      await screen.findByRole('button', { name: 'Menüyü daralt' });
      expect(container.querySelector('aside')!.innerHTML).not.toContain('bg-white/');
    });

    it('rail toggle is drawn in sidebar ink, not content ink', async () => {
      stubFetch(base);
      render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      // A content-ink class on the navy sidebar is 1.08:1 in the light theme — invisible.
      const toggle = await screen.findByRole('button', { name: 'Menüyü daralt' });
      expect(toggle.className).not.toContain('text-(--color-text)');
      expect(toggle.className).toContain('text-(--color-sidebar-text)');
    });

        it('user block lives in the sidebar', async () => {
      stubFetch({
        ...base,
        '/api/auth/me': { body: { user: { displayName: 'Mehmet Y.', roleLabel: 'Yönetici', permissions: ['view', 'edit'] } } },
      });
      render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      const sidebar = screen.getByRole('complementary');
      expect(await within(sidebar).findByRole('button', { name: 'Çıkış yap' })).toBeTruthy();
    });
  });

  describe('scan freshness (spec 2026-11-03-ui-redesign §5.3)', () => {
    const base = {
      [SYSTEM_PAUSE_ROUTE]: { body: { engaged: false } },
      [LICENSE_ROUTE]: { body: { status: { state: 'valid' } } },
    };

    // Off the Panel the pill reads the route itself; on it, the Panel's own read is shared.
    beforeEach(() => {
      mockNavigation.pathname = '/jobs';
      resetDashboardFeed();
    });

    afterEach(() => {
      mockNavigation.pathname = '/';
      vi.useRealTimers();
    });

    it('on the Panel it reads what the Panel fetched, not the route again', async () => {
      mockNavigation.pathname = '/';
      stubFetch(base);
      publishDashboardFreshness({
        modules: { seller: false, brand: true },
        brandAudit: { brands: [{ marketplaceCode: 'trendyol', lastSweptAt: Date.now() - 60_000 }] },
      });
      render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      expect(await within(screen.getByRole('banner')).findByText(/Trendyol/)).toBeTruthy();
      const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
      expect(urls.some((u) => u.startsWith('/api/dashboard'))).toBe(false);
    });

    it('off the Panel it re-reads, so a scan that falls behind turns amber', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const coverage = (stale: boolean) => ({
        body: {
          modules: { seller: true, brand: false },
          brandAudit: null,
          competitorAlerts: {
            coverage: [{ marketplaceCode: 'hepsiburada', displayName: 'Hepsiburada', lastOkAt: Date.now() - 60_000, stale }],
          },
        },
      });
      stubFetch({ ...base, '/api/dashboard': coverage(false) });
      render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      const banner = screen.getByRole('banner');
      expect(await within(banner).findByText(/Hepsiburada/)).toBeTruthy();
      expect(within(banner).queryByText(/gecikmeli/)).toBeNull();
      stubFetch({ ...base, '/api/dashboard': coverage(true) });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(await within(banner).findByText(/gecikmeli/)).toBeTruthy();
    });

    it('pill shows the latest sweep', async () => {
      stubFetch({
        ...base,
        '/api/dashboard': {
          body: {
            modules: { seller: false, brand: true },
            brandAudit: { brands: [{ marketplaceCode: 'trendyol', lastSweptAt: Date.now() - 8 * 60_000 }] },
          },
        },
      });
      render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      expect(await within(screen.getByRole('banner')).findByText(/Trendyol/)).toBeTruthy();
    });

    it('a late scan says so in words, not only in amber', async () => {
      stubFetch({
        ...base,
        '/api/dashboard': {
          body: {
            modules: { seller: true, brand: false },
            brandAudit: null,
            competitorAlerts: {
              coverage: [{ marketplaceCode: 'hepsiburada', displayName: 'Hepsiburada', lastOkAt: Date.now() - 3 * 3_600_000, stale: true }],
            },
          },
        },
      });
      render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      expect(await within(screen.getByRole('banner')).findByText(/gecikmeli/)).toBeTruthy();
    });

        it('pill absent on error', async () => {
      stubFetch({ ...base, '/api/dashboard': { status: 500 } });
      render(
        <NavShell>
          <p>içerik</p>
        </NavShell>,
      );
      expect(await screen.findByRole('button', { name: 'Sistem Çalışıyor' })).toBeTruthy();
      expect(within(screen.getByRole('banner')).queryByText(/Trendyol/)).toBeNull();
    });
  });
});
