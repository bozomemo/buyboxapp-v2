import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockNavigation, stubFetch } from '@/test-utils';
import { BrandsClient } from './brands-client';

/**
 * Smoke test for `/brands` (doc 15 §6, Phase 5 — Tier D).
 *
 * The row link is a `next/link`, which needs `usePathname` mocked the same way `nav-shell` does
 * elsewhere in this app — `next/navigation` throws outside a router (doc 15 §6, Phase 1c trap 3).
 */

vi.mock('next/navigation', () => ({
  usePathname: () => mockNavigation.pathname,
  useSearchParams: () => mockNavigation.searchParams,
  useRouter: () => mockNavigation.router,
}));

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/brands';

describe('BrandsClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true } });

    render(<BrandsClient />);

    expect(await screen.findByText('Markalar yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { reject: new Error('network down') } });

    render(<BrandsClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the no-brands-yet sentence', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: { brands: [] } } });

    render(<BrandsClient />);

    expect(await screen.findByText('Henüz marka bilgisi yok.')).toBeTruthy();
  });

  it('populated: shows a brand row with its translated marketplace label', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: {
        body: { brands: [{ id: 'b1', marketplaceCode: 'trendyol', name: 'Acme', listingCount: 12 }] },
      },
    });

    render(<BrandsClient />);

    expect(await screen.findByText('Acme')).toBeTruthy();
    // The raw enum ('trendyol') must not reach the screen as its own word.
    expect(screen.getByText('Trendyol')).toBeTruthy();
  });
});
