'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Pagination, STICKY_HEAD, TableFrame, usePagedRows } from '@/components/table';
import { formatDateTime, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { CoverageBadge, type Coverage } from '../../../coverage-badge';

interface SellerListing {
  listingId: string;
  marketplaceListingId: string;
  productName: string;
  baseStockCode: string | null;
  ourPrice: string;
  observationCount: number;
  buyboxCount: number;
  avgRank: number | null;
  minPrice: string | null;
  maxPrice: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
}

interface Detail {
  filters: { sinceMs: number; untilMs: number };
  seller: {
    marketplaceCode: string;
    sellerRef: string;
    sellerName: string | null;
    operatorNote: string | null;
    isKnown: boolean;
  };
  group: { id: string; displayName: string; note: string | null } | null;
  groupMembers: { marketplaceCode: string; sellerRef: string }[];
  listings: SellerListing[];
  coverage: Coverage;
}

interface GroupOption {
  id: string;
  displayName: string;
}

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

/** Stable identity for "the detail has not arrived yet". */
const NO_LISTINGS: never[] = [];

export function SellerDetailClient({ marketplace, sellerRef }: { marketplace: string; sellerRef: string }) {
  const [sinceMs, setSinceMs] = useState(daysAgo(30));
  const [detail, setDetail] = useState<Detail | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const paged = usePagedRows(detail?.listings ?? NO_LISTINGS, { resetKey: String(sinceMs) });

  const load = useCallback(() => {
    setError(null);
    const params = new URLSearchParams({ sinceMs: String(sinceMs) });
    fetch(`/api/competitors/sellers/${marketplace}/${encodeURIComponent(sellerRef)}?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Satıcı yüklenemedi.'))))
      .then((data: Detail) => setDetail(data))
      .catch((e: Error) => setError(e.message));
    fetch('/api/competitors/sellers')
      .then((res) => (res.ok ? res.json() : undefined))
      .then((data: { groups: GroupOption[] } | undefined) => data && setGroups(data.groups))
      .catch(() => undefined);
  }, [marketplace, sellerRef, sinceMs]);

  useEffect(load, [load]);

  async function post(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/competitors/sellers/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'İşlem başarısız.');
      }
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <div className="p-6 text-sm text-neutral-500">
        {error ?? 'Yükleniyor…'}
      </div>
    );
  }

  const totalObservations = detail.listings.reduce((n, l) => n + l.observationCount, 0);
  const totalBuybox = detail.listings.reduce((n, l) => n + l.buyboxCount, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link className="text-sm text-blue-700 hover:underline" href="/competitors/sellers">
            ← Rakip satıcılar
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">
            {detail.seller.sellerName || detail.seller.sellerRef}
          </h1>
          <p className="text-sm text-neutral-500">
            {detail.seller.marketplaceCode} · {detail.seller.sellerRef}
            {detail.group && (
              <>
                {' '}
                · Grup: <strong>{detail.group.displayName}</strong> (
                {detail.groupMembers.length} pazaryeri kimliği)
              </>
            )}
          </p>
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-neutral-500">Dönem</span>
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={String(sinceMs)}
            onChange={(e) => setSinceMs(Number(e.target.value))}
          >
            <option value={String(daysAgo(7))}>Son 7 gün</option>
            <option value={String(daysAgo(30))}>Son 30 gün</option>
            <option value={String(daysAgo(90))}>Son 90 gün</option>
          </select>
        </label>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">{error}</div>}

      <CoverageBadge coverage={detail.coverage} sinceMs={detail.filters.sinceMs} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500">Çakıştığımız ürün</div>
          <div className="text-xl font-semibold">{formatNumber(detail.listings.length)}</div>
        </div>
        <div className="rounded border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500">Kayıtlı teklif</div>
          <div className="text-xl font-semibold">{formatNumber(totalObservations)}</div>
        </div>
        <div className="rounded border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500">Buybox&apos;ta görüldüğü</div>
          <div className="text-xl font-semibold">
            {formatNumber(totalBuybox)}
            <span className="ml-2 text-sm font-normal text-neutral-500">
              {totalObservations > 0 ? formatPercent((totalBuybox / totalObservations) * 100) : '—'}
            </span>
          </div>
        </div>
      </div>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="text-lg font-medium">Kimlik eşleme</h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">
          Pazaryerleri kendi kimlik numaralarını verir; Trendyol&apos;daki bir numara ile
          Hepsiburada&apos;daki aynı numara ilgisizdir. İki kimliğin aynı firma olduğunu yalnızca
          siz bilebilirsiniz — sistem bunu isim benzerliğinden <strong>asla</strong> tahmin etmez,
          çünkü yanlış birleştirme alarmın yanlış firmada çalışmasına yol açar ve bu dışarıdan
          doğru görünür.
        </p>

        {!detail.seller.isKnown ? (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
            Bu satıcı henüz kalıcı olarak kaydedilmemiş — aşağıdaki rakamlar geçmiş tekliflerden
            geliyor. Bir tarama çalıştıktan sonra gruplama ve not ekleyebilirsiniz.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-neutral-500">Grup</span>
              <select
                className="rounded border border-neutral-300 px-2 py-1"
                disabled={busy}
                value={detail.group?.id ?? ''}
                onChange={(e) =>
                  post({
                    action: 'assign',
                    marketplaceCode: marketplace,
                    sellerRef,
                    groupId: e.target.value || null,
                  })
                }
              >
                <option value="">— gruplanmamış —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-neutral-500">Yeni grup oluştur</span>
              <input
                className="rounded border border-neutral-300 px-2 py-1"
                placeholder="ör. Olympus Grup"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </label>
            <button
              className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              disabled={busy || newGroupName.trim() === ''}
              onClick={async () => {
                await post({ action: 'createGroup', displayName: newGroupName.trim() });
                setNewGroupName('');
              }}
            >
              Oluştur
            </button>
          </div>
        )}
      </section>

      <TableFrame>
        <table className="min-w-full text-sm">
          <thead className={`${STICKY_HEAD} text-left`}>
            <tr>
              <th className="px-3 py-2">Ürün</th>
              <th className="px-3 py-2 text-right">Bizim fiyatımız</th>
              <th className="px-3 py-2 text-right">Onun fiyat aralığı</th>
              <th className="px-3 py-2 text-right">Teklif</th>
              <th className="px-3 py-2 text-right">Buybox</th>
              <th className="px-3 py-2 text-right">Ort. sıra</th>
              <th className="px-3 py-2">İlk görülme</th>
              <th className="px-3 py-2">Son görülme</th>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((l) => (
              <tr key={l.listingId} className="border-t border-neutral-100">
                <td className="px-3 py-2">
                  <Link className="text-blue-700 hover:underline" href={`/listings/${l.listingId}`}>
                    {l.productName}
                  </Link>
                  <div className="text-xs text-neutral-500">
                    {l.baseStockCode ?? l.marketplaceListingId}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">{formatMoney(BigInt(l.ourPrice))}</td>
                <td className="px-3 py-2 text-right">
                  {l.minPrice === null
                    ? '—'
                    : `${formatMoney(BigInt(l.minPrice))} – ${formatMoney(BigInt(l.maxPrice ?? l.minPrice))}`}
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(l.observationCount)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(l.buyboxCount)}</td>
                <td className="px-3 py-2 text-right">
                  {l.avgRank === null ? '—' : l.avgRank.toFixed(1)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-neutral-600">
                  ≥ {formatDateTime(l.firstSeenAt)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-neutral-600">
                  {formatDateTime(l.lastSeenAt)}
                </td>
              </tr>
            ))}
            {detail.listings.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-neutral-500" colSpan={8}>
                  Bu dönemde bu satıcıya ait teklif kaydı yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableFrame>

      <Pagination state={paged} label="ürün" />
    </div>
  );
}
