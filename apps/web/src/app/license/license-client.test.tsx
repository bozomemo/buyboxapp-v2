import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { LicenseClient } from './license-client';

/**
 * Smoke test for `/license` (doc 15 §6, Phase 5 — Tier D).
 *
 * "Empty" means the install has no licence key at all (`state: 'missing'`) — the natural
 * "nothing here yet" state for this screen. "Populated" means a valid, active licence.
 */

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/license';

describe('LicenseClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true } });

    render(<LicenseClient />);

    expect(await screen.findByText('Lisans durumu yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { reject: new Error('network down') } });

    render(<LicenseClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the no-licence-yet message', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: { body: { status: { state: 'missing' }, managedByEnvironment: false } },
    });

    render(<LicenseClient />);

    expect(await screen.findByText('Lisans bulunamadı')).toBeTruthy();
  });

  it('populated: shows the active licence and its customer', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: {
        body: {
          status: { state: 'valid', claims: { customer: 'Acme A.Ş.' }, daysRemaining: 42 },
          managedByEnvironment: false,
        },
      },
    });

    render(<LicenseClient />);

    expect(await screen.findByText('Lisans etkin')).toBeTruthy();
    expect(screen.getByText('Acme A.Ş. — 42 gün kaldı.')).toBeTruthy();
  });
});
