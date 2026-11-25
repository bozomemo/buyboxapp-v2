import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '@/test-utils';
import { BrandProductDetailClient } from './brand-product-detail-client';

/**
 * `/brand/products/[id]` — the cases the 2026-11-25 review found broken.
 */

afterEach(() => cleanup());

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    trackedProductId: 'tp1',
    marketplaceCode: 'trendyol',
    label: 'Felicia Kedi Maması 2 kg',
    productRef: '266709809',
    productUrl: '/felicia/kedi-mamasi-p-266709809?boutiqueId=61&merchantId=107493',
    unitMultiplier: 1,
    isPrimary: true,
    linkSource: 'manual',
    isActive: true,
    barcode: null,
    lastScrapedAt: null,
    hasSellers: null,
    cardReferencePrice: '49000',
    cardMinPrice: null,
    cardUpperBound: '49000',
    ...overrides,
  };
}

function detail(cards: unknown[]) {
  return {
    product: {
      id: 'bp1',
      name: 'Gece Testi Kedi Maması 1 kg',
      referencePrice: '49000',
      minPrice: null,
      maxPrice: null,
      upperBound: '49000',
      upperBoundIsReferencePrice: true,
      barcode: '8690000000001',
      unitPrice: null,
      desi: null,
      source: 'manual',
      referencePriceSource: null,
      updatedAt: 1_750_000_000_000,
    },
    cards,
    suggestions: [],
  };
}

describe('BrandProductDetailClient', () => {
  // Review 2026-11-25 Y4: a card found by the brand sweep stores a site-relative path, which the
  // browser resolved against the app and opened its own 404 — and the link was pinned to one
  // seller through `merchantId`.
  it('links a swept card to the marketplace, not to the app, and to the product rather than one seller', async () => {
    stubFetch({ '/api/brand-products/bp1': { body: detail([card()]) } });
    render(<BrandProductDetailClient id="bp1" />);
    const link = await screen.findByRole('link', { name: 'Felicia Kedi Maması 2 kg' });
    expect(link.getAttribute('href')).toBe(
      'https://www.trendyol.com/felicia/kedi-mamasi-p-266709809?boutiqueId=61',
    );
  });

  // Review 2026-11-25 O7. The multiplier stays asked, never defaulted (doc 17 §2.4) — but the
  // refusal has to say what to write, not only that the empty field is wrong.
  it('explains what the multiplier is when it is left empty', async () => {
    stubFetch({ '/api/brand-products/bp1': { body: detail([]) } });
    render(<BrandProductDetailClient id="bp1" />);
    const linkField = await screen.findByLabelText(/Ürün linki/);
    fireEvent.change(linkField, { target: { value: 'https://www.trendyol.com/x-p-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bağla' }));
    expect(await screen.findByText(/Tek ürünse 1/)).toBeTruthy();
  });
});

// Review 2026-11-25: the product itself could be neither edited nor deleted from its own page.
describe('product actions', () => {
  it('links to editing it on Stok', async () => {
    stubFetch({ '/api/brand-products/bp1': { body: detail([]) } });
    render(<BrandProductDetailClient id="bp1" />);
    const edit = await screen.findByRole('link', { name: 'Düzenle' });
    expect(edit.getAttribute('href')).toBe('/brand/products?edit=bp1');
  });

  it('deletes it after confirmation', async () => {
    stubFetch({ '/api/brand-products/bp1': { body: detail([]) } });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<BrandProductDetailClient id="bp1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ürünü sil' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Onayla' }));
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(
          ([u, init]) => String(u) === '/api/brand-products/bp1' && (init as RequestInit | undefined)?.method === 'DELETE',
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/brand/products'));
    vi.unstubAllGlobals();
  });
});
