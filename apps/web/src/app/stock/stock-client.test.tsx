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
