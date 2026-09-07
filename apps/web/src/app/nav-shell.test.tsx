import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockNavigation, stubFetch } from '@/test-utils';
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

afterEach(() => cleanup());

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
});
