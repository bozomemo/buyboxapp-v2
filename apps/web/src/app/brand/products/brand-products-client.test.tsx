import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '@/test-utils';
import { BrandProductsClient } from './brand-products-client';

/**
 * Smoke test for `/brand/products`, written before its 2026-11-03 restyle (plan phase 2, Task 9)
 * so the restyle has something to keep passing. Same shape as the other screen tests: one `fetch`
 * stub per case, one stable phrase asserted per case.
 */

afterEach(() => cleanup());

const ROUTE = '/api/brand-products';

const PRODUCT = {
  id: 'bp1',
  name: 'Miyav Gold Somonlu 1,5 kg',
  referencePrice: '42990',
  minPrice: null,
  maxPrice: null,
  upperBound: '42990',
  upperBoundIsReferencePrice: true,
  barcode: '8690000000001',
  unitPrice: '32500',
  desi: 1.5,
  source: 'manual',
  referencePriceSource: null,
  cardCount: 2,
  marketplaceCodes: ['trendyol'],
  updatedAt: Date.now(),
};

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
            PRODUCT,
          ],
          total: 1,
        },
      },
    });
    render(<BrandProductsClient />);
    expect(await screen.findByText('Miyav Gold Somonlu 1,5 kg')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Konum' })).toBeTruthy();
  });

  // A server error answers with JSON too; reading it as a product list blanked the screen instead
  // of offering the retry a network failure gets.
  it('server error: shows a retry button', async () => {
    stubFetch({ [ROUTE]: { status: 500, body: { error: 'internal' } } });
    render(<BrandProductsClient />);
    expect(await screen.findByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
    expect(screen.getByText(/HTTP 500/)).toBeTruthy();
  });

  it('failed delete does not report the product deleted', async () => {
    stubFetch({
      [ROUTE]: { body: { products: [PRODUCT], total: 1 } },
      '/api/brand-products/bp1': { status: 409, body: { error: 'Ürün silinemedi: kartları var' } },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BrandProductsClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sil' }));
    expect(await screen.findByText(/Ürün silinemedi/)).toBeTruthy();
    expect(screen.queryByText(/Ürün silindi/)).toBeNull();
  });
});
