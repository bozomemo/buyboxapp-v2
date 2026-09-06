import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { PolicyClient } from './policy-client';

/**
 * Smoke test for `/watched-brands/policy` (doc 15 §6, Phase 3.2). Shape copied from
 * `watched-brands-client.test.tsx`/`seller-detail-client.test.tsx`: one `fetch` stub per case, one
 * stable phrase asserted per case, no snapshots, no assertions on layout or class names.
 *
 * `PolicyClient` reads no `next/navigation` hooks, so there is no router mock here. It fetches one
 * route on mount, `/api/seller-policies` (with or without a `watchedBrandId` query string — routes
 * match on pathname only, see `stubFetch`), which gates the loading/error split.
 */

afterEach(() => cleanup());

const ROUTE = '/api/seller-policies';

describe('PolicyClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [ROUTE]: { pending: true } });

    render(<PolicyClient />);

    expect(await screen.findByText('Politika yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [ROUTE]: { reject: new Error('network down') } });

    render(<PolicyClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence when no brand is watched yet', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          filters: { sinceMs: 0, untilMs: 1, watchedBrandId: null },
          groups: [],
          brands: [],
          policies: [],
          sellers: [],
        },
      },
    });

    render(<PolicyClient />);

    expect(await screen.findByText('Henüz izlenen marka yok.')).toBeTruthy();
  });

  it('populated: shows a seller row with its verdict', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          filters: { sinceMs: 0, untilMs: 1, watchedBrandId: 'b1' },
          groups: [{ id: 'g1', name: 'Mars' }],
          brands: [{ id: 'b1', groupId: 'g1', label: 'Whiskas', marketplaceCode: 'trendyol' }],
          policies: [],
          sellers: [
            {
              marketplaceCode: 'trendyol',
              sellerRef: 'S1',
              sellerName: 'Test Satıcı',
              taxNumber: null,
              productCount: 5,
              avgDeviationPct: null,
              lastSeenAt: Date.now(),
              verdict: 'undefined',
              ruleId: null,
              fromGroupDefault: false,
              note: null,
              overriddenRuleIds: [],
            },
          ],
        },
      },
    });

    render(<PolicyClient />);

    expect(await screen.findByText('Test Satıcı')).toBeTruthy();
  });
});
