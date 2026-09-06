import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { PolicyClient } from './policy-client';

/**
 * Smoke test for `/settings/policy` (doc 15 §6, Phase 4.5 — Tier C, full evaluation). Shape
 * copied from `fees-client.test.tsx`: one `fetch` stub per case, one stable phrase asserted per
 * case, no snapshots, no assertions on layout or class names.
 *
 * The screen fetches `/api/settings/policy?marketplaceCode=trendyol` on mount (`trendyol` is the
 * default selection) and needs no `next/navigation` mock — its filter state is local `useState`.
 * "Empty" on this form screen means "no policy saved for this marketplace yet" (`current: null`),
 * not an empty list — the form still renders with defaults, so the assertion is the banner that
 * says so.
 */

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/settings/policy';

const CURRENT: Record<string, unknown> = {
  coarseStepMode: 'percent',
  coarseStepPercent: '5',
  refineTolerance: '0.50',
  seekStrategy: 'direct',
  undercutBy: '0.10',
  seekStep: '1.00',
  soleSellerMarginPct: '10',
  lowStockGuardEnabled: false,
  lowStockThreshold: '3',
  lowStockMarginPct: '5',
  stockMode: 'ignoreStock',
  minPhysicalStock: '0',
  settleDurationMinutes: '1',
  competitorPriceDelta: '0.10',
  pollIntervalMinutes: '5',
  concurrency: '1',
  budgetReservePct: '20',
  enabled: true,
};

describe('PolicyClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true } });

    render(<PolicyClient />);

    expect(await screen.findByText('Politika yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { reject: new Error('network down') } });

    render(<PolicyClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the no-policy-yet banner over the default form', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: { current: null } } });

    render(<PolicyClient />);

    expect(
      await screen.findByText('Bu pazaryeri için henüz kaydedilmiş bir politika yok', { exact: false }),
    ).toBeTruthy();
  });

  it('populated: shows the automation state and a saved field value', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: { current: CURRENT } } });

    render(<PolicyClient />);

    expect(await screen.findByRole('button', { name: 'Açık' })).toBeTruthy();
    expect(screen.getByDisplayValue('10')).toBeTruthy();
  });
});
