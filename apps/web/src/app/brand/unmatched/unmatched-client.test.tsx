import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastRequestParam, stubFetch } from '@/test-utils';
import { UnmatchedCardsClient } from './unmatched-client';

/**
 * Smoke test for `/brand/unmatched` (brand roadmap §6.9): the usual four states, the barcode
 * suggestion, and "Bizim değil" posting the dismissal.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tp1',
    marketplaceCode: 'hepsiburada',
    productRef: 'HBC1',
    productUrl: '/x-p-HBC1',
    label: 'Whiskas Ton 85g',
    brandName: 'Whiskas',
    barcode: '8690000000017',
    ratingCount: 1250,
    hasSellers: true,
    addedAt: Date.now() - 86_400_000,
    lastScrapedAt: null,
    isFavourite: false,
    queueDismissedAt: null,
    watchedBrandId: 'own',
    watchedBrandLabel: 'Whiskas',
    suggestions: [],
    ...overrides,
  };
}

function body(cards: unknown[], extra: Record<string, unknown> = {}) {
  return { total: cards.length, newCount: 1, newWindowMs: 7 * 86_400_000, limit: 50, offset: 0, cards, ...extra };
}

const ME = { '/api/auth/me': { body: { user: { permissions: ['view', 'catalogue.manage'] } } } };

describe('UnmatchedCardsClient', () => {
  it('loading', async () => {
    stubFetch({ ...ME, '/api/brand/unmatched': { pending: true } });
    render(<UnmatchedCardsClient />);
    expect(await screen.findByText('Kartlar yükleniyor…')).toBeTruthy();
  });

  it('error', async () => {
    stubFetch({ ...ME, '/api/brand/unmatched': { reject: new Error('network down') } });
    render(<UnmatchedCardsClient />);
    expect(await screen.findByText('network down')).toBeTruthy();
  });

  it('empty: says every own-brand card is claimed', async () => {
    stubFetch({ ...ME, '/api/brand/unmatched': { body: body([], { newCount: 0 }) } });
    render(<UnmatchedCardsClient />);
    expect(await screen.findByText('Eşleşmemiş kart yok.')).toBeTruthy();
  });

  it('populated: shows the card, the new count and a barcode suggestion', async () => {
    stubFetch({
      ...ME,
      '/api/brand/unmatched': { body: body([card({ suggestions: [{ id: 'bp1', name: 'Ton Balıklı 85g' }] })]) },
    });
    render(<UnmatchedCardsClient />);
    expect(await screen.findByText('Whiskas Ton 85g')).toBeTruthy();
    expect(screen.getByText(/Son 7 günde 1 yeni kart/)).toBeTruthy();
    expect(screen.getByText('Ton Balıklı 85g')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bağla' })).toBeTruthy();
  });

  it('"Bizim değil" posts the dismissal', async () => {
    stubFetch({
      ...ME,
      '/api/brand/unmatched': { body: body([card()]) },
    });
    render(<UnmatchedCardsClient />);
    await screen.findByText('Whiskas Ton 85g');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bizim değil' }).matches(':disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Bizim değil' }));
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(
          ([url, init]) =>
            String(url).startsWith('/api/brand/unmatched') &&
            (init as RequestInit | undefined)?.method === 'POST' &&
            String((init as RequestInit).body).includes('"dismissed":true'),
        ),
      ).toBe(true),
    );
  });
});

// Review 2026-11-25 O4, O5.
describe('working the queue', () => {
  const BRANDS = [
    { id: 'own', label: 'Whiskas' },
    { id: 'own2', label: 'Felicia' },
  ];
  const PRODUCTS = [{ id: 'bp1', name: 'Ton Balıklı 85g' }];

  function posts(url: string): RequestInit[] {
    return vi
      .mocked(fetch)
      .mock.calls.filter(([u, init]) => String(u).startsWith(url) && (init as RequestInit | undefined)?.method === 'POST')
      .map(([, init]) => init as RequestInit);
  }

  function setup(cards = [card()]) {
    stubFetch({
      ...ME,
      '/api/brand/unmatched': { body: body(cards, { brands: BRANDS, products: PRODUCTS }) },
      '/api/brand-products/bp1/cards': { body: { ok: true } },
    });
    render(<UnmatchedCardsClient />);
  }

  it('searches the queue by text, and narrows it to one brand', async () => {
    setup();
    await screen.findByText('Whiskas Ton 85g');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Kartlarda ara' }), { target: { value: 'ton' } });
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() => expect(lastRequestParam('/api/brand/unmatched', 'text')).toBe('ton'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Marka' }), { target: { value: 'own2' } });
    await waitFor(() => expect(lastRequestParam('/api/brand/unmatched', 'watchedBrandId')).toBe('own2'));
  });

  it('offers to undo "Bizim değil"', async () => {
    setup();
    await screen.findByText('Whiskas Ton 85g');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bizim değil' }).matches(':disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Bizim değil' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    await waitFor(() =>
      expect(posts('/api/brand/unmatched').some((init) => String(init.body).includes('"dismissed":false'))).toBe(true),
    );
  });

  it('links a card to a chosen stock product without leaving the queue', async () => {
    setup();
    await screen.findByText('Whiskas Ton 85g');
    fireEvent.change(screen.getByRole('combobox', { name: 'Stok ürünü' }), { target: { value: 'bp1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Adet çarpanı' }), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ürüne bağla' }));
    await waitFor(() => expect(posts('/api/brand-products/bp1/cards')).toHaveLength(1));
    expect(JSON.parse(String(posts('/api/brand-products/bp1/cards')[0]!.body))).toMatchObject({
      trackedProductId: 'tp1',
      unitMultiplier: 3,
    });
  });

  it('sets several cards aside at once', async () => {
    setup([card(), card({ id: 'tp2', label: 'Whiskas Somon 85g' })]);
    await screen.findByText('Whiskas Somon 85g');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Whiskas Ton 85g seç' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Whiskas Somon 85g seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seçilen 2 kart bizim değil' }));
    await waitFor(() =>
      expect(posts('/api/brand/unmatched').some((init) => String(init.body).includes('"ids":["tp1","tp2"]'))).toBe(true),
    );
  });

  it('names the two lists apart', async () => {
    setup();
    await screen.findByText('Whiskas Ton 85g');
    expect(screen.queryByRole('button', { name: 'Kuyruğa dön' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Kenara alınanlar' })).toBeTruthy();
  });
});
