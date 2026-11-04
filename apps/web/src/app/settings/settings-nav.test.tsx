import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionsProvider } from '@/lib/permissions';
import { mockNavigation, stubFetch } from '@/test-utils';
import { SettingsNav } from './settings-nav';

/**
 * The settings tabs (redesign phase 3, plan `2026-11-03-ui-redesign-phase-3-rest.md` Task 2): the
 * tab you are on is announced, not only drawn in a different colour (doc 15 rule 8).
 */

vi.mock('next/navigation', () => ({
  usePathname: () => mockNavigation.pathname,
  useSearchParams: () => mockNavigation.searchParams,
  useRouter: () => mockNavigation.router,
}));

afterEach(() => cleanup());

describe('SettingsNav', () => {
  it('active tab is marked', async () => {
    mockNavigation.pathname = '/settings/fees';
    stubFetch({ '/api/modules': { body: { modules: { seller: true, brand: true } } } });

    render(<SettingsNav />);

    expect(screen.getByRole('link', { name: 'Ücretler' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Pazaryerleri' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Ayarlar bölümleri' })).toBeTruthy();
  });

  it('hides seller tabs when the module is off', async () => {
    mockNavigation.pathname = '/settings/modules';
    stubFetch({ '/api/modules': { body: { modules: { seller: false, brand: true } } } });

    render(<SettingsNav />);

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Ücretler' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Modüller' })).toBeTruthy();
  });

  // Auto-update spec §5.3: installing is an administrator's act, so only `settings.manage` sees it.
  it('shows the update tab only to someone who may install', async () => {
    mockNavigation.pathname = '/settings/modules';
    stubFetch({
      '/api/modules': { body: { modules: { seller: true, brand: true } } },
      '/api/auth/me': { body: { user: { permissions: ['view', 'automation.stop', 'prices.manage'] } } },
    });

    render(
      <PermissionsProvider>
        <SettingsNav />
      </PermissionsProvider>,
    );

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Güncelleme' })).toBeNull());
  });

  it('shows the update tab to an administrator', () => {
    mockNavigation.pathname = '/settings/modules';
    stubFetch({ '/api/modules': { body: { modules: { seller: true, brand: true } } } });

    render(<SettingsNav />);

    expect(screen.getByRole('link', { name: 'Güncelleme' })).toBeTruthy();
  });
});
