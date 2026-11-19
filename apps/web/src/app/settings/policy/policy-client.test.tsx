import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  // "Sabit tutar" showed no amount field and every route saved the amount as 0, so the coarse
  // climb added nothing and prices never rose (user-guide review 2026-11-18; doc 03 §3).
  it('fixed-amount step: asks for the amount in ₺ and saves it', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: { body: { current: CURRENT } },
      '/api/settings/policy/save': { body: { ok: true } },
    });
    render(<PolicyClient />);

    const mode = await screen.findByLabelText('Kaba Adım Türü');
    expect(screen.queryByLabelText('Kaba Adım (₺)')).toBeNull();
    fireEvent.change(mode, { target: { value: 'absolute' } });
    expect(screen.queryByLabelText('Kaba Adım (%)')).toBeNull();
    fireEvent.change(screen.getByLabelText('Kaba Adım (₺)'), { target: { value: '2,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Politika kaydedildi.')).toBeTruthy();
    const call = vi.mocked(fetch).mock.calls.find((c) => String(c[0]) === '/api/settings/policy/save');
    const sent = JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
    expect(sent.coarseStepMode).toBe('absolute');
    expect(sent.coarseStepAbsolute).toBe('2,50');
  });

  it('fixed-amount step: shows the saved amount', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: { body: { current: { ...CURRENT, coarseStepMode: 'absolute', coarseStepAbsolute: '3.00' } } },
    });
    render(<PolicyClient />);

    const amount = await screen.findByLabelText('Kaba Adım (₺)');
    expect((amount as HTMLInputElement).value).toBe('3,00');
  });

  it('fixed-amount step: refuses to save without an amount', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: { body: { current: CURRENT } },
      '/api/settings/policy/save': { body: { ok: true } },
    });
    render(<PolicyClient />);

    fireEvent.change(await screen.findByLabelText('Kaba Adım Türü'), { target: { value: 'absolute' } });
    fireEvent.change(screen.getByLabelText('Kaba Adım (₺)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Kaba adım tutarı sıfırdan büyük olmalı.', { exact: false })).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.some((c) => String(c[0]) === '/api/settings/policy/save')).toBe(false);
  });
});

/** A refused save said only "Kaydedilemedi (HTTP 400)", not why (2026-11-19). */
describe('PolicyClient refused save', () => {
  it('shows the server’s reason', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: { body: { current: CURRENT } },
      '/api/settings/policy/save': { status: 400, body: { error: '"abc" geçerli bir tutar değil. Örnek: 1.250,50' } },
    });
    render(<PolicyClient />);
    (await screen.findByRole('button', { name: 'Kaydet' })).click();
    expect(await screen.findByText('"abc" geçerli bir tutar değil. Örnek: 1.250,50')).toBeTruthy();
  });
});
