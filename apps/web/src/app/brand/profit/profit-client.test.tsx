import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '@/test-utils';
import { ProfitSettingsClient } from './profit-client';

/** Kâr Ayarları — the default commission field (product owner, 2026-11-23). */

afterEach(() => cleanup());

const SETTINGS = {
  settings: {
    fixedSaleFee: '1250',
    desiBands: [{ maxDesi: null, cargo: '8500', operation: '2500' }],
    defaultCommissionRate: 15.5,
  },
  defaultFixedSaleFee: '1250',
};

function routes(settings: unknown = SETTINGS) {
  stubFetch({
    '/api/brand/profit-settings': { body: settings },
    '/api/brand/commission-tariffs': { body: { periods: [], now: 0 } },
  });
}

describe('ProfitSettingsClient — Varsayılan komisyon', () => {
  it('shows the saved rate with a decimal comma', async () => {
    routes();
    render(<ProfitSettingsClient />);
    const input = await screen.findByLabelText(/Varsayılan komisyon/);
    expect((input as HTMLInputElement).value).toBe('15,5');
  });

  it('is empty when no default was saved', async () => {
    routes({ ...SETTINGS, settings: { ...SETTINGS.settings, defaultCommissionRate: null } });
    render(<ProfitSettingsClient />);
    const input = await screen.findByLabelText(/Varsayılan komisyon/);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('sends what was typed with the rest of the settings', async () => {
    routes();
    render(<ProfitSettingsClient />);
    fireEvent.change(await screen.findByLabelText(/Varsayılan komisyon/), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await screen.findByText(/Kâr ayarları kaydedildi|Kaydedilemedi/);
    const post = vi
      .mocked(fetch)
      .mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({
      fixedSaleFee: '12,50',
      defaultCommissionRate: '12',
    });
  });
});
