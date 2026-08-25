'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  type ColumnDef,
  ColumnMenu,
  Pagination,
  resizableTableStyle,
  ResizableTh,
  STICKY_HEAD,
  TableFrame,
  useColumnPrefs,
  usePagedRows,
} from '@/components/table';
import { downloadCsv } from '@/lib/csv';
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

type ColumnId =
  | 'productName'
  | 'ourPrice'
  | 'priceRange'
  | 'observationCount'
  | 'buyboxCount'
  | 'avgRank'
  | 'firstSeenAt'
  | 'lastSeenAt';

/** Column customisation (doc 06 §4.1) — same `useColumnPrefs` setup as `/listings`. */
const COLUMN_DEFS: ColumnDef<ColumnId>[] = [
  { id: 'productName', label: 'Ürün', defaultWidth: 260 },
  { id: 'ourPrice', label: 'Bizim fiyatımız', defaultWidth: 130 },
  { id: 'priceRange', label: 'Onun fiyat aralığı', defaultWidth: 150 },
  { id: 'observationCount', label: 'Teklif', defaultWidth: 80 },
  { id: 'buyboxCount', label: 'Buybox', defaultWidth: 80 },
  { id: 'avgRank', label: 'Ort. sıra', defaultWidth: 80 },
  { id: 'firstSeenAt', label: 'İlk görülme', defaultWidth: 130 },
  { id: 'lastSeenAt', label: 'Son görülme', defaultWidth: 130 },
];

const RIGHT_ALIGNED = new Set<ColumnId>(['ourPrice', 'priceRange', 'observationCount', 'buyboxCount', 'avgRank']);

function renderListingCell(id: ColumnId, l: SellerListing): React.ReactNode {
  switch (id) {
    case 'productName':
      return (
        <>
          <Link className="text-(--color-accent) hover:underline" href={`/listings/${l.listingId}`}>
            {l.productName}
          </Link>
          <div className="text-xs text-(--color-muted)">{l.baseStockCode ?? l.marketplaceListingId}</div>
        </>
      );
    case 'ourPrice':
      return formatMoney(BigInt(l.ourPrice));
    case 'priceRange':
      return l.minPrice === null
        ? '—'
        : `${formatMoney(BigInt(l.minPrice))} – ${formatMoney(BigInt(l.maxPrice ?? l.minPrice))}`;
    case 'observationCount':
      return formatNumber(l.observationCount);
    case 'buyboxCount':
      return formatNumber(l.buyboxCount);
    case 'avgRank':
      return l.avgRank === null ? '—' : l.avgRank.toFixed(1);
    case 'firstSeenAt':
      return <>≥ {formatDateTime(l.firstSeenAt)}</>;
    case 'lastSeenAt':
      return formatDateTime(l.lastSeenAt);
  }
}

export function SellerDetailClient({ marketplace, sellerRef }: { marketplace: string; sellerRef: string }) {
  const [sinceMs, setSinceMs] = useState(daysAgo(30));
  const [detail, setDetail] = useState<Detail | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const paged = usePagedRows(detail?.listings ?? NO_LISTINGS, { resetKey: String(sinceMs) });
  const columns = useColumnPrefs('competitor-seller-detail-columns-v1', COLUMN_DEFS);

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
      <div className="p-6 text-sm text-(--color-muted)">
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
          <Link className="text-sm text-(--color-accent) hover:underline" href="/competitors/sellers">
            ← Rakip satıcılar
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">
            {detail.seller.sellerName || detail.seller.sellerRef}
          </h1>
          <p className="text-sm text-(--color-muted)">
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
          <span className="mb-1 block text-(--color-muted)">Dönem</span>
          <select
            className="rounded border border-(--color-border) px-2 py-1"
            value={String(sinceMs)}
            onChange={(e) => setSinceMs(Number(e.target.value))}
          >
            <option value={String(daysAgo(7))}>Son 7 gün</option>
            <option value={String(daysAgo(30))}>Son 30 gün</option>
            <option value={String(daysAgo(90))}>Son 90 gün</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="rounded border border-(--color-danger-border) bg-(--color-danger-bg) p-3 text-sm">
          {error}
        </div>
      )}

      <CoverageBadge coverage={detail.coverage} sinceMs={detail.filters.sinceMs} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded border border-(--color-border) p-3">
          <div className="text-xs text-(--color-muted)">Çakıştığımız ürün</div>
          <div className="text-xl font-semibold">{formatNumber(detail.listings.length)}</div>
        </div>
        <div className="rounded border border-(--color-border) p-3">
          <div className="text-xs text-(--color-muted)">Kayıtlı teklif</div>
          <div className="text-xl font-semibold">{formatNumber(totalObservations)}</div>
        </div>
        <div className="rounded border border-(--color-border) p-3">
          <div className="text-xs text-(--color-muted)">Buybox&apos;ta görüldüğü</div>
          <div className="text-xl font-semibold">
            {formatNumber(totalBuybox)}
            <span className="ml-2 text-sm font-normal text-(--color-muted)">
              {totalObservations > 0 ? formatPercent((totalBuybox / totalObservations) * 100) : '—'}
            </span>
          </div>
        </div>
      </div>

      <section className="rounded border border-(--color-border) p-4">
        <h2 className="text-lg font-medium">Kimlik eşleme</h2>
        <p className="mt-1 max-w-3xl text-sm text-(--color-muted)">
          Pazaryerleri kendi kimlik numaralarını verir; Trendyol&apos;daki bir numara ile
          Hepsiburada&apos;daki aynı numara ilgisizdir. İki kimliğin aynı firma olduğunu yalnızca
          siz bilebilirsiniz — sistem bunu isim benzerliğinden <strong>asla</strong> tahmin etmez,
          çünkü yanlış birleştirme alarmın yanlış firmada çalışmasına yol açar ve bu dışarıdan
          doğru görünür.
        </p>

        {!detail.seller.isKnown ? (
          <p className="mt-3 rounded border border-(--color-warning-border) bg-(--color-warning-bg) p-3 text-sm">
            Bu satıcı henüz kalıcı olarak kaydedilmemiş — aşağıdaki rakamlar geçmiş tekliflerden
            geliyor. Bir tarama çalıştıktan sonra gruplama ve not ekleyebilirsiniz.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-(--color-muted)">Grup</span>
              <select
                className="rounded border border-(--color-border) px-2 py-1"
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
              <span className="mb-1 block text-(--color-muted)">Yeni grup oluştur</span>
              <input
                className="rounded border border-(--color-border) px-2 py-1"
                placeholder="ör. Olympus Grup"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </label>
            <button
              className="rounded bg-(--color-strong-bg) px-3 py-1.5 text-sm text-(--color-strong-ink) disabled:opacity-50"
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

      <div className="flex items-center justify-end gap-2">
        <ColumnMenu defs={COLUMN_DEFS} prefs={columns} />
        <button
          type="button"
          disabled={detail.listings.length === 0}
          onClick={() =>
            downloadCsv(
              `rakip-satici-${detail.seller.sellerRef}.csv`,
              detail.listings.map((l) => ({
                Ürün: l.productName,
                'Stok Kodu': l.baseStockCode ?? l.marketplaceListingId,
                'Bizim Fiyatımız': (Number(l.ourPrice) / 100).toFixed(2),
                'Min Fiyat': l.minPrice ? (Number(l.minPrice) / 100).toFixed(2) : '',
                'Max Fiyat': l.maxPrice ? (Number(l.maxPrice) / 100).toFixed(2) : '',
                Teklif: l.observationCount,
                Buybox: l.buyboxCount,
                'Ort. Sıra': l.avgRank ?? '',
                'İlk Görülme': formatDateTime(l.firstSeenAt),
                'Son Görülme': formatDateTime(l.lastSeenAt),
              })),
            )
          }
          className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-40"
        >
          Excel&apos;e Aktar
        </button>
      </div>

      <TableFrame>
        <table className="text-sm" style={resizableTableStyle(COLUMN_DEFS, columns)}>
          <thead className={`${STICKY_HEAD} text-left`}>
            <tr>
              {COLUMN_DEFS.filter((d) => columns.isVisible(d.id)).map((d) => (
                <ResizableTh key={d.id} id={d.id} prefs={columns} className="px-3 py-2">
                  {d.label}
                </ResizableTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((l) => (
              <tr key={l.listingId} className="border-t border-(--color-border)">
                {COLUMN_DEFS.filter((d) => columns.isVisible(d.id)).map((d) => (
                  <td key={d.id} className={`px-3 py-2 ${RIGHT_ALIGNED.has(d.id) ? 'text-right' : ''}`}>
                    {renderListingCell(d.id, l)}
                  </td>
                ))}
              </tr>
            ))}
            {detail.listings.length === 0 && (
              <tr>
                <td
                  className="px-3 py-6 text-center text-(--color-muted)"
                  colSpan={COLUMN_DEFS.filter((d) => columns.isVisible(d.id)).length}
                >
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
