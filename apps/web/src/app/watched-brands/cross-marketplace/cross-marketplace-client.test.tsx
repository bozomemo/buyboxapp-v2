import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { CrossMarketplaceClient } from './cross-marketplace-client';

/**
 * Smoke test for `/watched-brands/cross-marketplace` (doc 15 §6, Phase 4.7 — Tier C). Shape
 * copied from `brand-comparison-client.test.tsx`: one `fetch` stub per case, one stable phrase
 * asserted per case, no snapshots, no assertions on layout or class names.
 *
 * `CrossMarketplaceClient` reads no `next/navigation` hooks, so there is no router mock here. It
 * fetches one route on mount, `/api/brand-reports/cross-marketplace` (routes match on pathname
 * only, see `stubFetch`), which gates the loading/error split.
 */

afterEach(() => cleanup());

const ROUTE = '/api/brand-reports/cross-marketplace';

const emptyCoverage = { total: 0, resolved: 0, statedNone: 0, failed: 0, pending: 0 };

describe('CrossMarketplaceClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [ROUTE]: { pending: true } });

    render(<CrossMarketplaceClient />);

    expect(await screen.findByText('Eşleşmeler yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [ROUTE]: { reject: new Error('network down') } });

    render(<CrossMarketplaceClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the no-matches sentence', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          left: { marketplaceCode: 'trendyol', coverage: emptyCoverage },
          right: { marketplaceCode: 'hepsiburada', coverage: emptyCoverage },
          matches: [],
          truncated: false,
        },
      },
    });

    render(<CrossMarketplaceClient />);

    expect(await screen.findByText('Henüz eşleşme yok.')).toBeTruthy();
  });

  it('populated: shows a match row', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          left: {
            marketplaceCode: 'trendyol',
            coverage: { total: 10, resolved: 8, statedNone: 1, failed: 0, pending: 1 },
          },
          right: {
            marketplaceCode: 'hepsiburada',
            coverage: { total: 10, resolved: 6, statedNone: 0, failed: 1, pending: 3 },
          },
          matches: [
            {
              barcode: '8690000000001',
              leftId: 'l1',
              leftProductRef: 'TY-1',
              leftLabel: 'Whiskas 1 Kg',
              leftUrl: 'https://www.trendyol.com/x',
              rightId: 'r1',
              rightProductRef: 'HB-1',
              rightLabel: 'Whiskas 1 Kg',
              rightUrl: 'https://www.hepsiburada.com/x',
            },
          ],
          truncated: false,
        },
      },
    });

    render(<CrossMarketplaceClient />);

    expect(await screen.findByText('8690000000001')).toBeTruthy();
  });
});
