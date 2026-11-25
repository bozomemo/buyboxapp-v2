import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '@/test-utils';
import { PolicyClient } from './policy-client';

/**
 * Smoke test for `/watched-brands/policy` (doc 15 §6, Phase 3.2). Shape copied from
 * `watched-brands-client.test.tsx`/`seller-detail-client.test.tsx`: one `fetch` stub per case, one
 * stable phrase asserted per case, no snapshots, no assertions on layout or class names.
 *
 * `PolicyClient` reads no `next/navigation` hooks, so there is no router mock here. It fetches one
 * route on mount, `/api/seller-policies` (with or without a `watchedBrandId` query string — routes
 * match on pathname only, see `stubFetch`), which gates the loading/error split.
 */

afterEach(() => cleanup());

const ROUTE = '/api/seller-policies';

describe('PolicyClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [ROUTE]: { pending: true } });

    render(<PolicyClient />);

    expect(await screen.findByText('Politika yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [ROUTE]: { reject: new Error('network down') } });

    render(<PolicyClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence when no brand is watched yet', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          filters: { sinceMs: 0, untilMs: 1, watchedBrandId: null },
          groups: [],
          brands: [],
          policies: [],
          sellers: [],
        },
      },
    });

    render(<PolicyClient />);

    expect(await screen.findByText('Henüz izlenen marka yok.')).toBeTruthy();
  });

  it('populated: shows a seller row with its verdict', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          filters: { sinceMs: 0, untilMs: 1, watchedBrandId: 'b1' },
          groups: [{ id: 'g1', name: 'Mars' }],
          brands: [{ id: 'b1', groupId: 'g1', label: 'Whiskas', marketplaceCode: 'trendyol' }],
          policies: [],
          sellers: [
            {
              marketplaceCode: 'trendyol',
              sellerRef: 'S1',
              sellerName: 'Test Satıcı',
              taxNumber: null,
              productCount: 5,
              avgDeviationPct: null,
              lastSeenAt: Date.now(),
              verdict: 'undefined',
              ruleId: null,
              fromGroupDefault: false,
              note: null,
              overriddenRuleIds: [],
            },
          ],
        },
      },
    });

    render(<PolicyClient />);

    expect(await screen.findByText('Test Satıcı')).toBeTruthy();
  });

  describe('redesign (plan 2026-11-03 phase 2, Task 7)', () => {
    it('header and sections keep their landmarks', async () => {
      stubFetch({
        [ROUTE]: {
          body: {
            filters: { sinceMs: 0, untilMs: 1, watchedBrandId: 'b1' },
            groups: [{ id: 'g1', name: 'Mars' }],
            brands: [{ id: 'b1', groupId: 'g1', label: 'Whiskas', marketplaceCode: 'trendyol' }],
            policies: [],
            sellers: [],
          },
        },
      });
      render(<PolicyClient />);
      expect(await screen.findByRole('heading', { level: 1, name: 'Satıcı Politikası' })).toBeTruthy();
      expect(screen.getByRole('navigation', { name: 'Konum' })).toBeTruthy();
      expect(screen.getByRole('region', { name: 'Elle ekle' })).toBeTruthy();
      expect(screen.getByRole('region', { name: "Excel'den içe aktar" })).toBeTruthy();
      expect(screen.getByRole('region', { name: 'Satıcılar' })).toBeTruthy();
      expect(screen.getByRole('textbox', { name: 'Satıcı kodu' })).toBeTruthy();
    });
  });
});

/**
 * A rule that matches nobody — a mistyped seller code, a tax number no storefront carries — was
 * only counted ("1 kural şu an kimseyi etkilemiyor"), with no way to see or delete it
 * (product owner, 2026-11-19: it should not stay that way).
 */
describe('PolicyClient dormant rules', () => {
  const DORMANT = {
    id: 'rule-1',
    watchedBrandGroupId: 'g1',
    watchedBrandId: 'b1',
    marketplaceCode: 'trendyol',
    sellerRef: '123456',
    taxNumber: null,
    status: 'blocked',
    note: 'yanlış yazılmış olabilir',
    createdAt: 0,
    updatedAt: 0,
    dormant: true,
  };
  const BODY = {
    filters: { sinceMs: 0, untilMs: 1, watchedBrandId: 'b1' },
    groups: [{ id: 'g1', name: 'Mars' }],
    brands: [{ id: 'b1', groupId: 'g1', label: 'Whiskas', marketplaceCode: 'trendyol' }],
    policies: [DORMANT],
    sellers: [],
  };

  it('lists a dormant rule with what it names', async () => {
    stubFetch({ [ROUTE]: { body: BODY } });
    render(<PolicyClient />);
    expect(await screen.findByText(/Etkisiz kurallar \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Trendyol · satıcı kodu 123456/)).toBeTruthy();
    expect(screen.getByText('yanlış yazılmış olabilir')).toBeTruthy();
  });

  it('deletes it after confirmation', async () => {
    stubFetch({ [ROUTE]: { body: BODY } });
    render(<PolicyClient />);
    (await screen.findByRole('button', { name: 'Kuralı sil' })).click();
    (await screen.findByRole('button', { name: 'Onayla' })).click();
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(
          (c) => String(c[0]) === '/api/seller-policies?id=rule-1' && (c[1] as RequestInit)?.method === 'DELETE',
        ),
      ).toBe(true),
    );
  });
});

// Review 2026-11-25 Y10, O6.
describe('Elle ekle', () => {
  const BODY = {
    filters: { sinceMs: 0, untilMs: 1, watchedBrandId: 'b1' },
    groups: [{ id: 'g1', name: 'Mars' }],
    brands: [{ id: 'b1', groupId: 'g1', label: 'Whiskas', marketplaceCode: 'trendyol' }],
    policies: [],
    sellers: [],
  };

  function posted(): boolean {
    return vi.mocked(fetch).mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
  }

  async function openForm() {
    stubFetch({ [ROUTE]: { body: BODY } });
    render(<PolicyClient />);
    const heading = await screen.findByRole('heading', { name: 'Elle ekle' });
    return heading.closest('section') as HTMLElement;
  }

  it('starts with no status chosen, and asks for one rather than writing an authorised rule', async () => {
    const form = await openForm();
    const statuses = within(form).getByRole('group', { name: 'Durum' });
    expect(within(statuses).queryByRole('button', { pressed: true })).toBeNull();
    fireEvent.change(within(form).getByRole('textbox', { name: 'Satıcı kodu' }), { target: { value: '123' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Ekle' }));
    expect(await within(form).findByText(/Durumu seçin/)).toBeTruthy();
    expect(posted()).toBe(false);
  });

  it('refuses a tax number that is not 10 or 11 digits, beside the form', async () => {
    const form = await openForm();
    fireEvent.click(within(form).getByLabelText('Vergi numarası', { selector: 'input[type=radio]' }));
    fireEvent.change(within(form).getByLabelText('Vergi numarası', { selector: 'input[type=text], input:not([type])' }), {
      target: { value: '12345' },
    });
    fireEvent.click(within(within(form).getByRole('group', { name: 'Durum' })).getByRole('button', { name: 'Yasaklı' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Ekle' }));
    expect(await within(form).findByText(/10 haneli/)).toBeTruthy();
    expect(posted()).toBe(false);
  });
});
