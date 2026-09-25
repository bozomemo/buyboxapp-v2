import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { MarketplacesClient } from './marketplaces-client';

/**
 * Smoke test for `/settings/marketplaces` (doc 15 §6, Phase 5 — Tier D). Shape copied from
 * `events-client.test.tsx` / `cross-marketplace-client.test.tsx`: one `fetch` stub per case, one
 * stable phrase asserted per case, no snapshots.
 *
 * "Empty" on this screen means the API returns no configured marketplaces yet (`marketplaces:
 * []`) — the two forms (Trendyol, Hepsiburada) still render with their defaults, so the
 * assertion is the "not yet determined" placeholder for the derived `merchantRef` field.
 * "Populated" means a marketplace row with a stored `merchantRef` and `updatedAt`.
 */

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/settings/marketplaces';
const SELLER_ON = { '/api/modules': { body: { modules: { seller: true, brand: true } } } };

describe('MarketplacesClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true }, ...SELLER_ON });

    render(<MarketplacesClient />);

    expect(await screen.findByText('Pazaryeri ayarları yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { reject: new Error('network down') }, ...SELLER_ON });

    render(<MarketplacesClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows both marketplace forms with the not-yet-determined merchantRef', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: { marketplaces: [] } }, ...SELLER_ON });

    render(<MarketplacesClient />);

    expect(await screen.findAllByText('— henüz belirlenmedi —')).toHaveLength(2);
  });

  it('populated: shows the stored merchantRef and last-update time', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: {
        body: {
          marketplaces: [
            {
              code: 'trendyol',
              displayName: 'Trendyol',
              enabled: true,
              merchantRef: 'M-123456',
              updatedAt: Date.now(),
            },
          ],
        },
      },
      ...SELLER_ON,
    });

    render(<MarketplacesClient />);

    expect(await screen.findByText('M-123456')).toBeTruthy();
    expect(screen.getByText(/önce/)).toBeTruthy();
  });

  // doc 17 §1.4: a brand-only install scrapes public pages and has no store to log in to, so
  // asking a brand manager for an API key and secret is asking for something they do not have.
  it('brand-only: offers the on/off switch without a credential form', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: { body: { marketplaces: [] } },
      '/api/modules': { body: { modules: { seller: false, brand: true } } },
    });

    render(<MarketplacesClient />);

    expect(await screen.findAllByText(/API bilgisi gerekmez/)).toHaveLength(2);
    expect(screen.queryByText('Bağlantıyı Test Et')).toBeNull();
    expect(screen.getAllByText('Etkin')).toHaveLength(2);
  });
});
