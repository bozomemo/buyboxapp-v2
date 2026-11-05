import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionsProvider } from '@/lib/permissions';
import { mockNavigation, stubFetch } from '@/test-utils';
import { SettingsTabs } from './settings-tabs';

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

describe('SettingsTabs', () => {
  it('active tab is marked', () => {
    mockNavigation.pathname = '/settings/fees';

    render(<SettingsTabs sellerEnabled />);

    expect(screen.getByRole('link', { name: 'Ücretler' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Pazaryerleri' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Ayarlar bölümleri' })).toBeTruthy();
  });

  // The first paint is the final one: seller tabs are never drawn and then removed, which is
  // what made every tab click flash three extra tabs while the module was off.
  it('never draws seller tabs when the module is off', () => {
    mockNavigation.pathname = '/settings/modules';

    render(<SettingsTabs sellerEnabled={false} />);

    expect(screen.queryByRole('link', { name: 'Ücretler' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Politika' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ürün Kaynakları' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Modüller' })).toBeTruthy();
  });

  // Auto-update spec §5.3: installing is an administrator's act, so only `settings.manage` sees it.
  it('shows the update tab only to someone who may install', async () => {
    mockNavigation.pathname = '/settings/modules';
    stubFetch({
      '/api/auth/me': { body: { user: { permissions: ['view', 'automation.stop', 'prices.manage'] } } },
    });

    render(
      <PermissionsProvider>
        <SettingsTabs sellerEnabled />
      </PermissionsProvider>,
    );

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Güncelleme' })).toBeNull());
  });

  it('shows the update tab to an administrator', () => {
    mockNavigation.pathname = '/settings/modules';

    render(<SettingsTabs sellerEnabled />);

    expect(screen.getByRole('link', { name: 'Güncelleme' })).toBeTruthy();
  });
});
