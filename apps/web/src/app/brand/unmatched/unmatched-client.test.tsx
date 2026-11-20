import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '@/test-utils';
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
