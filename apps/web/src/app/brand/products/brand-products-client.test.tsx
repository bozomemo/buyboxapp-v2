import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { BrandProductsClient } from './brand-products-client';

/**
 * Smoke test for `/brand/products`, written before its 2026-11-03 restyle (plan phase 2, Task 9)
 * so the restyle has something to keep passing. Same shape as the other screen tests: one `fetch`
 * stub per case, one stable phrase asserted per case.
 */

afterEach(() => cleanup());

const ROUTE = '/api/brand-products';

describe('BrandProductsClient', () => {
  it('loading: shows the loading message', async () => {
    stubFetch({ [ROUTE]: { pending: true } });
    render(<BrandProductsClient />);
    expect(await screen.findByText('Ürünler yükleniyor…')).toBeTruthy();
  });

  it('error: shows a retry button', async () => {
    stubFetch({ [ROUTE]: { reject: new Error('network down') } });
    render(<BrandProductsClient />);
    expect(await screen.findByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('populated: shows a product row and the breadcrumb', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          products: [
            {
              id: 'bp1',
              name: 'Miyav Gold Somonlu 1,5 kg',
              referencePrice: '42990',
              minPrice: null,
              maxPrice: null,
              upperBound: '42990',
              upperBoundIsReferencePrice: true,
              barcode: '8690000000001',
              source: 'manual',
              referencePriceSource: null,
              cardCount: 2,
              marketplaceCodes: ['trendyol'],
              updatedAt: Date.now(),
            },
          ],
          total: 1,
        },
      },
    });
    render(<BrandProductsClient />);
    expect(await screen.findByText('Miyav Gold Somonlu 1,5 kg')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Konum' })).toBeTruthy();
  });
});
