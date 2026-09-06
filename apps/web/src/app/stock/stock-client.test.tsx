import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
