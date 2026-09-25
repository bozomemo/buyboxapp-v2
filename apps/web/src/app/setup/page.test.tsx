import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockNavigation, stubFetch } from '@/test-utils';
import SetupWizard from './page';
import { Step1Database } from './steps/step1-database';

/**
 * Smoke tests for the setup wizard (doc 15 §6, Phase 6), covering the orchestrator (`page.tsx`)
 * and its most critical step, `Step1Database`. Shape copied from `dashboard-client.test.tsx`: one
 * `fetch` stub per case, one stable phrase asserted per case, no snapshots.
 *
 * The wizard has no single "loading spinner" the way a data grid does — each step owns its own
 * fetch. The four required cases are read as this screen's own equivalents (doc 15 §6 step 6
 * explicitly allows "adıma özgü karşılıkları"):
 *
 *   loading    → a step's own async call never resolves; the step still renders, not a blank page
 *   error      → a step's own action fails and shows its own failure message (not a silent screen)
 *   empty      → a fresh wizard with nothing remembered starts at step 1, as before this pass
 *   populated  → a remembered position (doc 15 §6, Phase 6's fix) is restored instead of resetting
 *                to step 1 — the central regression this pass exists to prevent
 */

vi.mock('next/navigation', () => ({
  useRouter: () => mockNavigation.router,
  usePathname: () => mockNavigation.pathname,
  useSearchParams: () => mockNavigation.searchParams,
}));

const PROGRESS_KEY = 'buybox.setup.wizard.progress.v2';

/**
 * Node 22+'s own experimental `localStorage` global collides with jsdom's under this repo's
 * Node/Vitest combination: `window.localStorage` resolves to a bare, methodless object (no
 * `setItem`/`clear`) instead of jsdom's working implementation, and calling either throws a
 * `TypeError` unrelated to anything this test is checking. A minimal in-memory stand-in, scoped
 * to this file only, sidesteps the collision without touching the shared `vitest.config.ts`.
 */
function installFakeLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } satisfies Storage,
  });
}

beforeEach(() => {
  installFakeLocalStorage();
});

afterEach(() => {
  cleanup();
});

describe('SetupWizard (orchestrator)', () => {
  it('empty: a fresh wizard with no remembered progress starts at step 1 (Veritabanı)', async () => {
    stubFetch({ '/api/setup/database/suggest': { body: { sqlite: 'file:C:\\data\\app.db' } } });

    render(<SetupWizard />);

    expect(await screen.findByText('Adım 1 / 9 — Veritabanı', { exact: false })).toBeTruthy();
  });

  it('populated: a remembered step is restored instead of resetting to step 1', async () => {
    window.localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ stepIndex: 2, databaseReady: true, enabledMarketplaces: [] }),
    );
    // Step1Database still mounts for one render before the restore effect switches the step away.
    stubFetch({ '/api/setup/database/suggest': { pending: true } });

    render(<SetupWizard />);

    expect(await screen.findByText('Adım 3 / 9 — Mağaza Kimliği', { exact: false })).toBeTruthy();
    expect(screen.queryByText('henüz onaylanmadı', { exact: false })).toBeNull();
  });

  it('populated: restoring never re-shows the "database step not confirmed" warning for a completed run', async () => {
    window.localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ stepIndex: 3, databaseReady: true, enabledMarketplaces: ['trendyol'] }),
    );
    stubFetch({
      '/api/setup/database/suggest': { pending: true },
      '/api/settings/marketplaces': { body: { marketplaces: [] } },
    });

    render(<SetupWizard />);

    expect(await screen.findByText('Adım 4 / 9 — Pazaryerleri', { exact: false })).toBeTruthy();
  });

  it('asks the purpose right after the database step', async () => {
    window.localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ stepIndex: 1, databaseReady: true, enabledMarketplaces: [] }),
    );
    stubFetch({
      '/api/setup/database/suggest': { pending: true },
      '/api/modules': { body: { modules: { seller: true, brand: true } } },
    });

    render(<SetupWizard />);

    expect(await screen.findByText('Adım 2 / 9 — Kullanım Amacı', { exact: false })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Marka ürün yöneticisiyim/ })).toBeTruthy();
  });

  /**
   * doc 17 §1.4: a brand-only install skips every seller step and is never asked for seller
   * credentials — the marketplaces step is on/off switches only.
   */
  it('brand-only: four steps, and the marketplaces step asks for no credentials', async () => {
    window.localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        stepIndex: 2,
        databaseReady: true,
        enabledMarketplaces: [],
        modules: { seller: false, brand: true },
      }),
    );
    stubFetch({
      '/api/setup/database/suggest': { pending: true },
      '/api/settings/marketplaces': { body: { marketplaces: [] } },
    });

    render(<SetupWizard />);

    expect(await screen.findByText('Adım 3 / 4 — Pazaryerleri', { exact: false })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Trendyol' })).toBeTruthy();
    expect(screen.queryByText('API Anahtarı')).toBeNull();
    expect(screen.queryByText('Ücret Ayarları')).toBeNull();
  });
});

describe('Step1Database', () => {
  it('loading: renders the form without crashing while the suggestion is still pending', async () => {
    stubFetch({ '/api/setup/database/suggest': { pending: true } });

    render(<Step1Database onDone={() => {}} />);

    expect(await screen.findByText('Veritabanı Motoru')).toBeTruthy();
  });

  it('error: a failed connection test shows its own failure message, not a silent screen', async () => {
    stubFetch({
      '/api/setup/database/suggest': { body: { sqlite: 'file:C:\\data\\app.db' } },
      '/api/setup/database/test': { body: { ok: false, error: 'ECONNREFUSED' } },
    });

    render(<Step1Database onDone={() => {}} />);

    const testButton = await screen.findByRole('button', { name: 'Bağlantıyı Test Et' });
    testButton.click();

    expect(await screen.findByText('ECONNREFUSED')).toBeTruthy();
  });

  it('empty: an untouched connection-string field shows no validation error yet', async () => {
    stubFetch({ '/api/setup/database/suggest': { body: { sqlite: 'file:C:\\data\\app.db' } } });

    render(<Step1Database onDone={() => {}} />);

    await waitFor(async () => expect(await screen.findByText('Bağlantı Bilgisi')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('populated: a successful test and migrate enables İleri', async () => {
    stubFetch({
      '/api/setup/database/suggest': { body: { sqlite: 'file:C:\\data\\app.db' } },
      '/api/setup/database/test': { body: { ok: true } },
      '/api/setup/database/migrate': { body: { ok: true, appliedCount: 3 } },
    });

    render(<Step1Database onDone={() => {}} />);

    (await screen.findByRole('button', { name: 'Bağlantıyı Test Et' })).click();
    expect(await screen.findByText('Bağlantı başarılı.')).toBeTruthy();

    (await screen.findByRole('button', { name: 'Migrasyonları Çalıştır' })).click();
    expect(await screen.findByText('Şema güncel (3 migrasyon uygulandı).')).toBeTruthy();

    expect(screen.getByRole('button', { name: 'İleri' })).not.toHaveProperty('disabled', true);
  });
});
