import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { ModulesClient } from './modules-client';

/** Smoke test for `/settings/modules` (doc 17 §1.3). */

afterEach(() => cleanup());

const ROUTE = '/api/modules';
const BOTH = { modules: { seller: true, brand: true }, awaitingConfirmation: 0, priceSwitchEngaged: true };

describe('ModulesClient', () => {
  it('loading: shows the loading message', async () => {
    stubFetch({ [ROUTE]: { pending: true } });
    render(<ModulesClient redirectedFrom={null} />);
    expect(await screen.findByText('Modüller yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure and a retry button', async () => {
    stubFetch({ [ROUTE]: { reject: new Error('network down') } });
    render(<ModulesClient redirectedFrom={null} />);
    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('warns before the seller module is turned off, naming the price switch', async () => {
    stubFetch({ [ROUTE]: { body: BOTH } });
    render(<ModulesClient redirectedFrom={null} />);
    const seller = await screen.findByRole('checkbox', { name: /Pazaryeri satıcısı/ });
    expect(screen.queryByText(/fiyat gönderim anahtarını devreye alır/)).toBeNull();
    fireEvent.click(seller);
    expect(screen.getByText(/fiyat gönderim anahtarını devreye alır/)).toBeTruthy();
  });

  it('refuses to save with nothing selected', async () => {
    stubFetch({ [ROUTE]: { body: BOTH } });
    render(<ModulesClient redirectedFrom={null} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Pazaryeri satıcısı/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Marka ürün yöneticisi/ }));
    expect(screen.getByText('En az bir modül açık kalmalı.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('explains a redirect from a disabled module, and the confirmations still draining', async () => {
    stubFetch({
      [ROUTE]: {
        body: { modules: { seller: false, brand: true }, awaitingConfirmation: 3, priceSwitchEngaged: true },
      },
    });
    render(<ModulesClient redirectedFrom="seller" />);
    expect(await screen.findByText(/"Pazaryeri satıcısı" modülüne ait ve bu modül kapalı/)).toBeTruthy();
    expect(screen.getByText(/3 fiyat gönderimi pazaryeri onayı bekliyor/)).toBeTruthy();
  });
});
