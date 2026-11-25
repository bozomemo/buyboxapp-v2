import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as csvModule from '@/lib/csv';
import { lastRequestParam, stubFetch } from '@/test-utils';
import { BrandSellersClient } from './brand-sellers-client';

/**
 * Smoke test for `/watched-brands/sellers` (doc 15 §6, Phase 3.3). Shape copied from
 * `policy-client.test.tsx`/`seller-detail-client.test.tsx`: one `fetch` stub per case, one stable
 * phrase asserted per case, no snapshots, no assertions on layout or class names.
 *
 * `BrandSellersClient` reads no `next/navigation` hooks, so there is no router mock here. It
 * fetches one route on mount, `/api/brand-reports/sellers` (with or without query parameters —
 * routes match on pathname only, see `stubFetch`), which gates the loading/error split. The
 * seller-identity panel (`seller-identity-panel.tsx`) is opened only on a row click and fetches
 * its own route, so it never runs in these four cases.
 */

afterEach(() => cleanup());

const ROUTE = '/api/brand-reports/sellers';

describe('BrandSellersClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [ROUTE]: { pending: true } });

    render(<BrandSellersClient />);

    expect(await screen.findByText('Rapor yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [ROUTE]: { reject: new Error('network down') } });

    render(<BrandSellersClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence when there is no offer record yet', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          filters: { sinceMs: 0, untilMs: 1, marketplaceCode: null, watchedBrandId: null, groupId: null },
          groups: [],
          brands: [],
          sellers: [],
          unidentifiedCount: 0,
          buybox: { totalLooks: 0, unidentifiedLooks: 0 },
        },
      },
    });

    const { container } = render(<BrandSellersClient />);

    // The sentence is interrupted mid-run by an inline element (the job's name), so
    // no single node's own text equals it exactly — assert on the rendered text as a whole rather
    // than one element's `textContent`.
    await screen.findByRole('table');
    expect(container.textContent).toContain('Bu dönemde hiç teklif kaydı yok.');
  });

  it('populated: shows a seller row', async () => {
    stubFetch({
      [ROUTE]: {
        body: {
          filters: { sinceMs: 0, untilMs: 1, marketplaceCode: null, watchedBrandId: null, groupId: null },
          groups: [{ id: 'g1', name: 'Mars' }],
          brands: [{ id: 'b1', groupId: 'g1', label: 'Whiskas', marketplaceCode: 'trendyol' }],
          sellers: [
            {
              marketplaceCode: 'trendyol',
              sellerRef: 'S1',
              sellerName: 'Test Satıcı',
              groupId: null,
              groupName: null,
              operatorNote: null,
              productCount: 5,
              observationCount: 20,
              buyboxCount: 4,
              cheapestCount: 6,
              buyboxRate: 0.2,
              buyboxSharePct: 12,
              cheapestRate: 0.3,
              avgDeviationPct: null,
              verdict: null,
              minPrice: null,
              maxPrice: null,
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
            },
          ],
          unidentifiedCount: 0,
          buybox: { totalLooks: 4, unidentifiedLooks: 0 },
        },
      },
    });

    render(<BrandSellersClient />);

    expect(await screen.findByText('Test Satıcı')).toBeTruthy();
  });

  describe('redesign (plan 2026-11-03 phase 2, Task 5)', () => {
    const EMPTY = {
      filters: { sinceMs: 0, untilMs: 1, marketplaceCode: null, watchedBrandId: null, groupId: null },
      groups: [],
      brands: [],
      sellers: [],
      unidentifiedCount: 0,
      buybox: { totalLooks: 0, unidentifiedLooks: 0 },
    };

    it('title survives as h1 with a breadcrumb', async () => {
      stubFetch({ [ROUTE]: { body: EMPTY } });
      render(<BrandSellersClient />);
      expect(await screen.findByRole('heading', { level: 1, name: 'Markalarımı Kimler Satıyor' })).toBeTruthy();
      expect(screen.getByRole('navigation', { name: 'Konum' })).toBeTruthy();
    });

    it('period and marketplace are segmented filters that show their selection', async () => {
      // A clock that moves on every read, so an option value recomputed per render can never
      // equal the stored selection by luck.
      let t = 1_800_000_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => (t += 1000));
      stubFetch({ [ROUTE]: { body: EMPTY } });
      render(<BrandSellersClient />);
      await screen.findByRole('region', { name: 'Satıcılar' });
      expect(within(screen.getByRole('group', { name: 'Dönem' })).getByRole('button', { name: 'Son 30 gün' }).getAttribute('aria-pressed')).toBe('true');
      vi.restoreAllMocks();
      expect(within(screen.getByRole('group', { name: 'Pazaryeri' })).getByRole('button', { name: 'Hepsiburada' })).toBeTruthy();
    });

    it('choosing a period re-fetches from that many days ago and keeps it pressed', async () => {
      // A 7/30/90 option is a day count; storing it as the start instant asked for data since
      // 1970 and left "Son 30 gün" pressed (user-guide review 2026-11-18).
      const NOW = 1_800_000_000_000;
      const spy = vi.spyOn(Date, 'now').mockReturnValue(NOW);
      try {
        stubFetch({ [ROUTE]: { body: EMPTY } });
        render(<BrandSellersClient />);
        const group = await screen.findByRole('group', { name: 'Dönem' });
        fireEvent.click(within(group).getByRole('button', { name: 'Son 7 gün' }));
        await waitFor(() => expect(Number(lastRequestParam(ROUTE, 'sinceMs'))).toBe(NOW - 7 * 24 * 60 * 60 * 1000));
        expect(within(group).getByRole('button', { name: 'Son 7 gün' }).getAttribute('aria-pressed')).toBe('true');
        expect(within(group).getByRole('button', { name: 'Son 30 gün' }).getAttribute('aria-pressed')).toBe('false');
      } finally {
        spy.mockRestore();
      }
    });
  });
  /**
   * _Seçilenlerin kimliğini çöz_ and _Kimlikleri Excel'e aktar_ (2026-11-25, product owner).
   */
  describe('identities in bulk', () => {
    const seller = (sellerRef: string, sellerName: string) => ({
      marketplaceCode: 'trendyol',
      sellerRef,
      sellerName,
      groupId: null,
      groupName: null,
      operatorNote: null,
      productCount: 1,
      observationCount: 1,
      buyboxCount: 0,
      cheapestCount: 0,
      buyboxRate: 0,
      buyboxSharePct: 0,
      cheapestRate: 0,
      avgDeviationPct: null,
      verdict: null,
      minPrice: null,
      maxPrice: null,
      firstSeenAt: 0,
      lastSeenAt: 0,
    });
    const REPORT = {
      filters: { sinceMs: 0, untilMs: 1, marketplaceCode: null, watchedBrandId: null, groupId: null },
      groups: [],
      brands: [],
      sellers: [seller('111', 'Birinci'), seller('222', 'İkinci')],
      unidentifiedCount: 0,
      buybox: { totalLooks: 0, unidentifiedLooks: 0 },
    };

    function postedBody(path: string): unknown {
      const call = vi
        .mocked(fetch)
        .mock.calls.find((c) => String(c[0]).startsWith(path) && (c[1] as RequestInit | undefined)?.method === 'POST');
      return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined;
    }

    it('ticked sellers are sent to the bulk route, and the screen says how many were queued', async () => {
      stubFetch({
        [ROUTE]: { body: REPORT },
        '/api/competitors/sellers/identity/bulk': {
          body: { ok: true, jobIds: ['j1'], queued: 1, alreadyResolved: 1, missing: 0 },
        },
      });
      render(<BrandSellersClient />);

      fireEvent.click(await screen.findByRole('checkbox', { name: 'Birinci seç' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'İkinci seç' }));
      expect(screen.getByText('2 satıcı seçildi')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Seçilenlerin kimliğini çöz' }));

      expect(await screen.findByText(/1 satıcının kimliği kuyruğa alındı/)).toBeTruthy();
      expect(screen.getByText(/1 satıcının kimliği zaten çözülmüştü/)).toBeTruthy();
      expect(postedBody('/api/competitors/sellers/identity/bulk')).toEqual({
        sellers: [
          { marketplaceCode: 'trendyol', sellerRef: '111' },
          { marketplaceCode: 'trendyol', sellerRef: '222' },
        ],
      });
    });

    // Review 2026-11-25 O9: nothing in the table said which sellers were already resolved.
    it('marks a seller whose identity is already resolved, naming the firm', async () => {
      stubFetch({
        [ROUTE]: {
          body: {
            ...REPORT,
            sellers: [
              { ...seller('111', 'Birinci'), identity: { officialName: 'BİRİNCİ TİCARET A.Ş.', resolvedAt: 1 } },
              seller('222', 'İkinci'),
            ],
          },
        },
      });
      render(<BrandSellersClient />);
      const resolved = await screen.findByRole('button', { name: '✓ Kimlik' });
      expect(resolved.getAttribute('title')).toContain('BİRİNCİ TİCARET A.Ş.');
      expect(screen.getAllByRole('button', { name: 'Kimlik' })).toHaveLength(1);
    });

    it('speaks of brands, plural, when no single brand is chosen', async () => {
      stubFetch({ [ROUTE]: { body: { ...REPORT, buybox: { totalLooks: 193, unidentifiedLooks: 0 } } } });
      render(<BrandSellersClient />);
      expect(await screen.findByText(/izlenen markaların/)).toBeTruthy();
    });

    it('the header box ticks every seller on this page', async () => {
      stubFetch({ [ROUTE]: { body: REPORT } });
      render(<BrandSellersClient />);

      fireEvent.click(await screen.findByRole('checkbox', { name: 'Bu sayfadaki satıcıları seç' }));

      expect(screen.getByText('2 satıcı seçildi')).toBeTruthy();
    });

    it('a refused selection shows the route’s own message', async () => {
      stubFetch({
        [ROUTE]: { body: REPORT },
        '/api/competitors/sellers/identity/bulk': {
          status: 409,
          body: { error: 'Seçili satıcılar için bir kimlik çözümü zaten kuyrukta veya çalışıyor.' },
        },
      });
      render(<BrandSellersClient />);

      fireEvent.click(await screen.findByRole('checkbox', { name: 'Birinci seç' }));
      fireEvent.click(screen.getByRole('button', { name: 'Seçilenlerin kimliğini çöz' }));

      expect(await screen.findByText(/zaten kuyrukta veya çalışıyor/)).toBeTruthy();
    });

    it('no identity resolved yet: says so instead of downloading an empty file', async () => {
      const csv = vi.spyOn(csvModule, 'downloadCsv').mockImplementation(() => undefined);
      stubFetch({
        [ROUTE]: { body: REPORT },
        '/api/competitors/sellers/identity/export': { body: { identities: [] } },
      });
      render(<BrandSellersClient />);

      fireEvent.click(await screen.findByRole('button', { name: "Kimlikleri Excel'e aktar" }));

      expect(await screen.findByText(/Henüz kimliği çözülmüş satıcı yok/)).toBeTruthy();
      expect(csv).not.toHaveBeenCalled();
      csv.mockRestore();
    });

    it('exports the stored identities as a CSV with Turkish headers', async () => {
      const csv = vi.spyOn(csvModule, 'downloadCsv').mockImplementation(() => undefined);
      stubFetch({
        [ROUTE]: { body: REPORT },
        '/api/competitors/sellers/identity/export': {
          body: {
            identities: [
              {
                marketplaceCode: 'trendyol',
                sellerRef: '111',
                sellerName: 'Birinci',
                officialName: 'Birinci Ticaret Ltd. Şti.',
                taxNumber: '1234567890',
                taxOffice: 'Kadıköy',
                registeredEmailAddress: 'birinci@hs01.kep.tr',
                address: 'Moda Cd. 1',
                cityName: 'İstanbul',
                countryName: 'Türkiye',
                sourceUrl: 'https://www.trendyol.com/x',
                resolvedAt: 0,
              },
            ],
          },
        },
      });
      render(<BrandSellersClient />);

      fireEvent.click(await screen.findByRole('button', { name: "Kimlikleri Excel'e aktar" }));

      await waitFor(() => expect(csv).toHaveBeenCalled());
      const [filename, rows] = csv.mock.calls[0]!;
      expect(filename).toBe('satici-kimlikleri.csv');
      expect(rows[0]).toMatchObject({
        Satıcı: 'Birinci',
        'Satıcı Kodu': '111',
        'Ticari Unvan': 'Birinci Ticaret Ltd. Şti.',
        'Vergi / TC No': '1234567890',
        'Vergi Dairesi': 'Kadıköy',
        'KEP Adresi': 'birinci@hs01.kep.tr',
        Şehir: 'İstanbul',
      });
      csv.mockRestore();
    });
  });
});
