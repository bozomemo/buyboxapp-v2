import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { ProductSourcesClient } from './product-sources-client';

/**
 * Smoke test for `/settings/product-sources` (doc 15 §6, Phase 5 — Tier D).
 *
 * "Empty" means no product source has been configured yet (`configured: false`) — the form still
 * renders with the `manual` default, so the assertion is the "not configured yet" sentence.
 * "Populated" means a source is already configured (`configured: true`).
 */

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/product-source/config';

describe('ProductSourcesClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true } });

    render(<ProductSourcesClient />);

    expect(await screen.findByText('Ürün kaynağı ayarları yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { reject: new Error('network down') } });

    render(<ProductSourcesClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the not-configured-yet sentence', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: { configured: false } } });

    render(<ProductSourcesClient />);

    expect(await screen.findByText('Henüz bir ürün kaynağı yapılandırılmadı.')).toBeTruthy();
  });

  it('populated: shows the configured-source sentence with the saved source selected', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: { configured: true, sourceCode: 'excel' } } });

    render(<ProductSourcesClient />);

    expect(await screen.findByText('Şu anda yapılandırılmış bir kaynak var.')).toBeTruthy();
    expect(await screen.findByDisplayValue('Excel')).toBeTruthy();
  });
});
