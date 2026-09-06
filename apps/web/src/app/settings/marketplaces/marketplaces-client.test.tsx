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

describe('MarketplacesClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true } });

    render(<MarketplacesClient />);

    expect(await screen.findByText('Pazaryeri ayarları yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { reject: new Error('network down') } });

    render(<MarketplacesClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows both marketplace forms with the not-yet-determined merchantRef', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: { marketplaces: [] } } });

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
    });

    render(<MarketplacesClient />);

    expect(await screen.findByText('M-123456')).toBeTruthy();
    expect(screen.getByText(/önce/)).toBeTruthy();
  });
});
