import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '@/test-utils';
import { PolicyQuickDecision } from './policy-quick-decision';

/**
 * Brand roadmap §6.12: a seller with no rule for the brand is decided in one click from the
 * sellers report — the same rule Satıcı Politikası writes, for this brand and this storefront.
 */
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SELLER = { marketplaceCode: 'trendyol', sellerRef: '9001', sellerName: 'Yeni Bayi' };

describe('PolicyQuickDecision', () => {
  it('writes an authorised rule for this brand and this storefront', async () => {
    stubFetch({ '/api/seller-policies': { body: { ok: true } } });
    const onDecided = vi.fn();
    render(<PolicyQuickDecision seller={SELLER} watchedBrandId="wb1" onDecided={onDecided} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yetkili' }));
    await waitFor(() => expect(onDecided).toHaveBeenCalled());
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      watchedBrandId: 'wb1',
      marketplaceCode: 'trendyol',
      sellerRef: '9001',
      status: 'authorised',
    });
  });

  it('says why when the rule is refused', async () => {
    stubFetch({ '/api/seller-policies': { status: 404, body: { error: 'İzlenen marka bulunamadı.' } } });
    render(<PolicyQuickDecision seller={SELLER} watchedBrandId="wb1" onDecided={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yasaklı' }));
    expect(await screen.findByText('İzlenen marka bulunamadı.')).toBeTruthy();
  });
});
