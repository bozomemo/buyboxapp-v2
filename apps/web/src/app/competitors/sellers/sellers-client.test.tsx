import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '@/test-utils';
import { SellersClient } from './sellers-client';

/**
 * Smoke test for `/competitors/sellers` (doc 15 §6, Phase 4.2 — Tier C). Shape copied from
 * `competitors-client.test.tsx`/`seller-detail-client.test.tsx`: one `fetch` stub per case, one
 * stable phrase asserted per case, no snapshots, no assertions on layout or class names.
 *
 * The screen calls no `next/navigation` hook (the period/marketplace filters are local
 * `useState`, not seeded from the URL), so unlike the detail screens this test needs no
 * `next/navigation` mock. It fetches `/api/competitors/sellers` on mount and on every filter
 * change.
 */

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/competitors/sellers';

const EMPTY_COVERAGE = { ok: 0, parseFailed: 0, fetchFailed: 0, firstAt: null, lastOkAt: null };

const EMPTY_BODY = {
  filters: { sinceMs: 0, untilMs: 1, marketplaceCode: null },
  sellers: [],
  groups: [],
  unidentifiedObservations: 0,
  coverage: EMPTY_COVERAGE,
  ownStores: [],
  ownSellerUnresolved: [],
};

describe('SellersClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true } });

    render(<SellersClient />);

    expect(await screen.findByText('Rakip satıcı raporu yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { reject: new Error('network down') } });

    render(<SellersClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: EMPTY_BODY } });

    render(<SellersClient />);

    expect(
      await screen.findByText(
        'Bu dönemde kayıtlı rakip teklifi yok. Tarama işi kapalıysa İşler ekranından açın, ya da dönem/pazaryeri filtresini genişletin.',
      ),
    ).toBeTruthy();
  });

  it('populated: shows a seller row', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: {
        body: {
          ...EMPTY_BODY,
          sellers: [
            {
              marketplaceCode: 'trendyol',
              sellerRef: 'S1',
              sellerName: 'Test Satıcı',
              groupId: null,
              groupName: null,
              operatorNote: null,
              listingCount: 4,
              observationCount: 10,
              buyboxCount: 3,
              buyboxRate: 0.3,
              avgRank: 2.1,
              minPrice: '9000',
              maxPrice: '11000',
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
            },
          ],
        },
      },
    });

    render(<SellersClient />);

    expect(await screen.findByText('Test Satıcı')).toBeTruthy();
  });

  // Redesign phase 3 (plan 2026-11-03-ui-redesign-phase-3-rest, Task 8 and Review Focus 3).
  it('period filter keeps its selection', async () => {
    // A clock that moves on every read: option values computed from `Date.now()` would never
    // equal the stored one again — the phase-2 bug this pins against.
    let clock = 1_800_000_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000));
    stubFetch({ [PRIMARY_ROUTE]: { body: EMPTY_BODY } });

    render(<SellersClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'Son 7 gün' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Son 7 gün' }).getAttribute('aria-pressed')).toBe('true'),
    );
    expect(screen.getByRole('button', { name: 'Son 30 gün' }).getAttribute('aria-pressed')).toBe('false');
    spy.mockRestore();
  });
});
