import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '@/test-utils';
import { StockClient } from './stock-client';

/**
 * Smoke test for `/stock` (doc 15 §6, Phase 2.6). Shape copied from
 * `listings-client.test.tsx`/`tracked-products-client.test.tsx`: one `fetch` stub per case, one
 * stable phrase asserted per case, no snapshots, no assertions on layout or class names.
 *
 * `StockClient` reads no `next/navigation` hooks, so unlike the listings/tracked-products tests
 * there is no router mock here. It fetches three routes on mount: `/api/stock` (the primary load
 * that gates the loading/error split) and, from the two collapsed `<details>` sections that still
 * mount their content even while closed, `/api/product-source/config` (`ImportPanel`) and
 * `/api/stock/bundles` (`BundleEditor`). Both side routes are stubbed in every case.
 */

afterEach(() => cleanup());

const SIDE_ROUTES = {
  '/api/product-source/config': { body: { configured: false } },
  '/api/stock/bundles': { body: { bundles: [] } },
};

describe('StockClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({
      '/api/stock': { pending: true },
      ...SIDE_ROUTES,
    });

    render(<StockClient />);

    expect(await screen.findByText('Stok yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({
      '/api/stock': { reject: new Error('network down') },
      ...SIDE_ROUTES,
    });

    render(<StockClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({
      '/api/stock': { body: { items: [], marketplaces: [] } },
      ...SIDE_ROUTES,
    });

    render(<StockClient />);

    expect(await screen.findByText('Henüz stok kalemi yok.')).toBeTruthy();
  });

  it('populated: shows a stock item row', async () => {
    stubFetch({
      '/api/stock': {
        body: {
          marketplaces: [{ code: 'trendyol', displayName: 'Trendyol' }],
          items: [
            {
              baseStockCode: 'BASE1',
              name: 'Test Ürünü',
              unitCost: '5000',
              unitStock: 10,
              sourceCode: 'manual',
              prefs: { trendyol: { priceMultiplier: 1.1, autoRepriceEnabled: true } },
              offeredStock: { trendyol: 3 },
            },
          ],
        },
      },
      ...SIDE_ROUTES,
    });

    render(<StockClient />);

    expect(await screen.findByText('Test Ürünü')).toBeTruthy();
  });
});

/**
 * The multiplier was a `type="number"` field: in a browser whose locale reads a dot decimal,
 * typing "1,2" — what the guide tells the operator to type — saved 12, a cost twelve times too
 * high; an emptied field saved 0 (2026-11-19 walkthrough).
 */
describe('StockClient multiplier', () => {
  const ROW = {
    '/api/stock': {
      body: {
        marketplaces: [{ code: 'trendyol', displayName: 'Trendyol' }],
        items: [
          {
            baseStockCode: 'BASE1',
            name: 'Test Ürünü',
            unitCost: '5000',
            unitStock: 10,
            sourceCode: 'manual',
            prefs: { trendyol: { priceMultiplier: 1, autoRepriceEnabled: false } },
            offeredStock: {},
          },
        ],
      },
    },
    '/api/stock/prefs': { body: { ok: true } },
    ...SIDE_ROUTES,
  };

  function prefsBodies(): unknown[] {
    return vi
      .mocked(fetch)
      .mock.calls.filter((c) => String(c[0]).startsWith('/api/stock/prefs'))
      .map((c) => JSON.parse(String((c[1] as RequestInit).body)));
  }

  it('reads "1,2" as 1.2', async () => {
    stubFetch(ROW);
    render(<StockClient />);
    const input = await screen.findByLabelText('Test Ürünü için Trendyol fiyat çarpanı');
    fireEvent.change(input, { target: { value: '1,2' } });
    fireEvent.blur(input);
    await waitFor(() => expect(prefsBodies()).toEqual([expect.objectContaining({ priceMultiplier: 1.2 })]));
  });

  it.each([[''], ['0'], ['-1'], ['abc'], ['1,2,3']])('does not save %j and says why', async (typed) => {
    stubFetch(ROW);
    render(<StockClient />);
    const input = await screen.findByLabelText('Test Ürünü için Trendyol fiyat çarpanı');
    fireEvent.change(input, { target: { value: typed } });
    fireEvent.blur(input);
    expect(await screen.findByText(/sıfırdan büyük bir sayı/)).toBeTruthy();
    expect(prefsBodies()).toEqual([]);
  });
});

/**
 * The bundle editor saved a new bundle under `Date.now()` with no field for its code, so the
 * bundle could never match the listing that carries "12345-k2" (doc 01 §6); a refused save was
 * not shown (2026-11-19 walkthrough).
 */
describe('StockClient bundle editor', () => {
  function bundlePosts(): unknown[] {
    return vi
      .mocked(fetch)
      .mock.calls.filter((c) => String(c[0]) === '/api/stock/bundles' && (c[1] as RequestInit | undefined)?.method === 'POST')
      .map((c) => JSON.parse(String((c[1] as RequestInit).body)));
  }

  async function openNewBundle(saveResponse: { status?: number; body: unknown }) {
    stubFetch({
      '/api/stock': { body: { items: [], marketplaces: [] } },
      '/api/product-source/config': { body: { configured: false } },
      '/api/stock/bundles': saveResponse.status ? { status: saveResponse.status, body: saveResponse.body } : { body: { bundles: [] } },
    });
    render(<StockClient />);
    (await screen.findByRole('button', { name: 'Yeni Paket' })).click();
    return screen.findByLabelText('Paket stok kodu');
  }

  it('asks for the bundle stock code and posts it', async () => {
    const code = await openNewBundle({ body: { bundles: [] } });
    fireEvent.change(code, { target: { value: '12345-k2' } });
    fireEvent.change(screen.getByLabelText('Paket adı'), { target: { value: 'Paket' } });
    screen.getByRole('button', { name: 'Üye Ekle' }).click();
    fireEvent.change(await screen.findByLabelText('1. üye stok kodu'), { target: { value: 'TST001' } });
    screen.getByRole('button', { name: 'Kaydet' }).click();
    await waitFor(() =>
      expect(bundlePosts()).toEqual([expect.objectContaining({ bundleStockCode: '12345-k2', name: 'Paket' })]),
    );
  });

  it('shows why the server refused a save and keeps the form open', async () => {
    const code = await openNewBundle({ status: 400, body: { ok: false, error: 'Pakete en az bir üye ekleyin.' } });
    fireEvent.change(code, { target: { value: '12345-k2' } });
    screen.getByRole('button', { name: 'Kaydet' }).click();
    expect(await screen.findByText('Pakete en az bir üye ekleyin.')).toBeTruthy();
    expect(screen.getByLabelText('Paket stok kodu')).toBeTruthy();
  });
});
