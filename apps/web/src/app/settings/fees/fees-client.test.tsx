import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { FeesClient } from './fees-client';

/**
 * Smoke test for `/settings/fees` (doc 15 §6, Phase 4.3 — Tier C). Shape copied from
 * `competitors-client.test.tsx`: one `fetch` stub per case, one stable phrase asserted per case,
 * no snapshots, no assertions on layout or class names.
 *
 * The screen fetches `/api/settings/fees?marketplaceCode=trendyol` on mount (`trendyol` is the
 * default selection), and needs no `next/navigation` mock — its filter state is local `useState`.
 * "Empty" on a form screen means "no fee settings saved for this marketplace yet" (`current:
 * null`), not an empty list — the form still renders with defaults, so the assertion is the
 * banner that says so.
 */

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/settings/fees';

const CURRENT: Record<string, unknown> = {
  defaultCommissionRate: '15',
  cargoBands: [{ edge: '', amount: '11.00' }],
  expenditureBands: [{ edge: '0', amount: '0' }],
};

describe('FeesClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true } });

    render(<FeesClient />);

    expect(await screen.findByText('Ücret ayarları yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { reject: new Error('network down') } });

    render(<FeesClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the no-settings-yet banner over the default form', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: { current: null, history: [] } } });

    render(<FeesClient />);

    expect(
      await screen.findByText(
        'Bu pazaryeri için henüz kaydedilmiş bir ücret ayarı yok — aşağıda varsayılan değerler',
        {
          exact: false,
        },
      ),
    ).toBeTruthy();
  });

  it('populated: shows the saved commission rate and a history row', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: {
        body: {
          current: CURRENT,
          history: [{ id: 'h1', effectiveFrom: Date.now(), defaultCommissionRate: 15 }],
        },
      },
    });

    render(<FeesClient />);

    expect(await screen.findByDisplayValue('15')).toBeTruthy();
    expect(await screen.findByText('Komisyon: %15')).toBeTruthy();
  });

  it('a band\'s remove button is drawn in danger ink', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: { current: null, history: [] } } });
    render(<FeesClient />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Bant Ekle/ }))[0]!);
    expect(screen.getAllByRole('button', { name: 'Kaldır' })[0]!.className).toContain('text-(--color-danger)');
  });
});
