import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('offers the whole catalogue as a file to fill in and upload back', async () => {
    stubFetch({ [ROUTE]: { body: { products: [PRODUCT], total: 1 } } });
    render(<BrandProductsClient />);
    const link = await screen.findByRole('link', { name: 'Mevcut ürünleri indir' });
    expect(link.getAttribute('href')).toBe('/api/brand-products/export');
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

    render(<BrandProductsClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sil' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText(/Ürün silinemedi/)).toBeTruthy();
    expect(screen.queryByText(/Ürün silindi/)).toBeNull();
  });
});

// Review 2026-11-25 O6 and the Stok low findings.
describe('the product form', () => {
  function openNew() {
    stubFetch({
      [ROUTE]: { body: { products: [PRODUCT], total: 1 } },
    });
    render(<BrandProductsClient />);
  }

  it('shows a save error inside the form, beside its fields', async () => {
    openNew();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Ürün' }));
    stubFetch({
      [ROUTE]: { status: 400, body: { error: 'PSF okunamadı.' } },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
    const form = screen.getByRole('group', { name: 'Yeni ürün' });
    expect(await within(form).findByText('PSF okunamadı.')).toBeTruthy();
  });

  it('has one way to close it', async () => {
    openNew();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Ürün' }));
    expect(screen.queryByRole('button', { name: 'Vazgeç' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Kapat' })).toHaveLength(1);
  });

  it('names the product being edited', async () => {
    openNew();
    fireEvent.click(await screen.findByRole('button', { name: 'Düzenle' }));
    expect(screen.getByRole('group', { name: 'Düzenleniyor: Miyav Gold Somonlu 1,5 kg' })).toBeTruthy();
  });

  it('warns about a barcode that is not an EAN while it is typed, before saving', async () => {
    openNew();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Ürün' }));
    fireEvent.change(screen.getByLabelText(/Barkod/), { target: { value: '8690000000002' } });
    expect(screen.getByText(/geçerli bir EAN\/GTIN değil/)).toBeTruthy();
  });

  it('marks example values as examples', async () => {
    openNew();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Ürün' }));
    expect(screen.getByLabelText(/PSF \(birim\)/).getAttribute('placeholder')).toBe('örn. 1.249,90');
    expect(screen.getByLabelText(/Desi/).getAttribute('placeholder')).toBe('örn. 4,5');
  });
});

// Review 2026-11-25: "Düzenle" on a product's own page opens its form here.
describe('opening the edit form from a link', () => {
  it('opens the form for ?edit=<id>', async () => {
    window.history.pushState({}, '', '/brand/products?edit=bp1');
    stubFetch({
      [ROUTE]: { body: { products: [PRODUCT], total: 1 } },
      '/api/brand-products/bp1': { body: { product: PRODUCT, cards: [], suggestions: [] } },
    });
    render(<BrandProductsClient />);
    expect(await screen.findByRole('group', { name: 'Düzenleniyor: Miyav Gold Somonlu 1,5 kg' })).toBeTruthy();
    window.history.pushState({}, '', '/');
  });
});
