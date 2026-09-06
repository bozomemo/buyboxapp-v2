import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { CompetitorsClient } from './competitors-client';

/**
 * Smoke test for `/competitors` (doc 15 §6, Phase 4.1 — Tier C). Shape copied from
 * `seller-detail-client.test.tsx`: one `fetch` stub per case, one stable phrase asserted per
 * case, no snapshots, no assertions on layout or class names.
 *
 * The screen calls no `next/navigation` hook (filters are local `useState`, not seeded from the
 * URL), so unlike the detail screens this test needs no `next/navigation` mock. It fetches
 * `/api/competitors` on mount and on every filter change; the listing-search endpoint
 * (`/api/competitors/listings`) is only hit once the operator types into the listing picker, so
 * it is never called in these four cases and needs no stub.
 */

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/competitors';

const EMPTY_COVERAGE = { ok: 0, parseFailed: 0, fetchFailed: 0, firstAt: null, lastOkAt: null };

const EMPTY_BODY = {
  filters: { sinceMs: 0, untilMs: 1 },
  truncated: { observations: false, scrapeRuns: false },
  priceTimeline: null,
  sellerPresence: [],
  buyboxShare: [],
  timeWeightedBuyboxShare: [],
  uncoveredMs: 0,
  coverage: EMPTY_COVERAGE,
  sellerProfile: null,
  observationCoverage: [],
};

describe('CompetitorsClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true } });

    render(<CompetitorsClient />);

    expect(await screen.findByText('Rakip geçmişi yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { reject: new Error('network down') } });

    render(<CompetitorsClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: EMPTY_BODY } });

    render(<CompetitorsClient />);

    expect(await screen.findByText('Filtreyle eşleşen kayıt yok.')).toBeTruthy();
  });

  it('populated: shows a seller-presence row', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: {
        body: {
          ...EMPTY_BODY,
          sellerPresence: [
            {
              listingId: 'l1',
              productName: 'Test Ürünü',
              marketplaceListingId: 'ml1',
              sellerRef: 'S1',
              sellerName: 'Test Satıcı',
              firstSeen: Date.now(),
              lastSeen: Date.now(),
              observationCount: 3,
            },
          ],
        },
      },
    });

    render(<CompetitorsClient />);

    expect(await screen.findByText('Test Ürünü')).toBeTruthy();
  });
});
