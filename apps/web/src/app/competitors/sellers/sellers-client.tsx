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
import { CoverageBadge } from '../coverage-badge';

interface Coverage {
  ok: number;
  parseFailed: number;
  fetchFailed: number;
  firstAt: number | null;
  lastOkAt: number | null;
}

interface Seller {
  marketplaceCode: string;
  sellerRef: string;
  sellerName: string;
  groupId: string | null;
  groupName: string | null;
  operatorNote: string | null;
  listingCount: number;
  observationCount: number;
  buyboxCount: number;
  buyboxRate: number;
  avgRank: number | null;
  minPrice: string | null;
  maxPrice: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
}

interface OwnStore {
  marketplaceCode: string;
  displayName: string;
  sellerRef: string | null;
  listingCount: number;
  observationCount: number;
  buyboxCount: number;
  buyboxRate: number;
}

interface Report {
  filters: { sinceMs: number; untilMs: number; marketplaceCode: string | null };
  sellers: Seller[];
  groups: { id: string; displayName: string; note: string | null }[];
  unidentifiedObservations: number;
  coverage: Coverage;
  ownStores: OwnStore[];
  ownSellerUnresolved: { marketplaceCode: string; displayName: string; configuredRef: string | null }[];
}

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

/** Stable identity for "the report has not arrived yet". */
const NO_SELLERS: never[] = [];

type ColumnId =
  | 'sellerName'
  | 'marketplace'
  | 'listingCount'
  | 'observationCount'
  | 'buyboxCount'
  | 'avgRank'
  | 'priceRange'
  | 'firstSeenAt'
  | 'lastSeenAt';

/** Column customisation (doc 06 §4.1) — same `useColumnPrefs` setup as `/listings`. */
const COLUMN_DEFS: ColumnDef<ColumnId>[] = [
  { id: 'sellerName', label: 'Satıcı', defaultWidth: 220 },
  { id: 'marketplace', label: 'Pazaryeri', defaultWidth: 100 },
  { id: 'listingCount', label: 'Ürünümüz', defaultWidth: 90 },
  { id: 'observationCount', label: 'Teklif', defaultWidth: 90 },
  { id: 'buyboxCount', label: 'Buybox', defaultWidth: 110 },
  { id: 'avgRank', label: 'Ort. sıra', defaultWidth: 80 },
  { id: 'priceRange', label: 'Fiyat aralığı', defaultWidth: 150 },
  { id: 'firstSeenAt', label: 'İlk görülme', defaultWidth: 130 },
  { id: 'lastSeenAt', label: 'Son görülme', defaultWidth: 130 },
];

function renderSellerCell(id: ColumnId, s: Seller): React.ReactNode {
  switch (id) {
    case 'sellerName':
      return (
        <>
          <Link
            className="font-medium text-(--color-accent) hover:underline"
            href={`/competitors/sellers/${s.marketplaceCode}/${encodeURIComponent(s.sellerRef)}`}
          >
            {s.sellerName || s.sellerRef}
          </Link>
          {s.groupName && (
            <span className="ml-2 rounded bg-(--color-chip-bg) px-1.5 py-0.5 text-xs text-(--color-chip-text)">
              {s.groupName}
            </span>
          )}
          {s.operatorNote && <div className="text-xs text-(--color-muted)">{s.operatorNote}</div>}
        </>
      );
    case 'marketplace':
      return s.marketplaceCode;
    case 'listingCount':
      return formatNumber(s.listingCount);
    case 'observationCount':
      return formatNumber(s.observationCount);
    case 'buyboxCount':
      return (
        <>
          {formatNumber(s.buyboxCount)}
          <span className="ml-1 text-xs text-(--color-muted)">({formatPercent(s.buyboxRate * 100)})</span>
        </>
      );
    case 'avgRank':
      return s.avgRank === null ? '—' : s.avgRank.toFixed(1);
    case 'priceRange':
      return s.minPrice === null
        ? '—'
        : `${formatMoney(BigInt(s.minPrice))} – ${formatMoney(BigInt(s.maxPrice ?? s.minPrice))}`;
    case 'firstSeenAt':
      return <>≥ {formatDateTime(s.firstSeenAt)}</>;
    case 'lastSeenAt':
      return formatDateTime(s.lastSeenAt);
  }
}

export function SellersClient() {
  const [sinceMs, setSinceMs] = useState(daysAgo(30));
  const [marketplaceCode, setMarketplaceCode] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paged = usePagedRows(report?.sellers ?? NO_SELLERS, {
    resetKey: `${sinceMs}|${marketplaceCode}`,
  });
  const columns = useColumnPrefs('competitor-sellers-columns-v1', COLUMN_DEFS);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ sinceMs: String(sinceMs) });
    if (marketplaceCode) params.set('marketplaceCode', marketplaceCode);
    fetch(`/api/competitors/sellers?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Rapor yüklenemedi.'))))
      .then((data: Report) => setReport(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sinceMs, marketplaceCode]);

  useEffect(load, [load]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Rakip Satıcılar</h1>
          <p className="mt-1 max-w-3xl text-sm text-(--color-muted)">
            İzlediğimiz ürünlerde karşımıza çıkan satıcılar, en çok çakışandan başlayarak. Bu
            veriler <strong>tekliflerden</strong> gelir; bir satıcının ürünü kaç kez{' '}
            <em>listelediğini</em> gösterir, kaç adet sattığını değil.
          </p>
        </div>
        <div className="flex items-end gap-3">
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
          <label className="text-sm">
            <span className="mb-1 block text-(--color-muted)">Pazaryeri</span>
            <select
              className="rounded border border-(--color-border) px-2 py-1"
              value={marketplaceCode}
              onChange={(e) => setMarketplaceCode(e.target.value)}
            >
              <option value="">Tümü</option>
              <option value="trendyol">Trendyol</option>
              <option value="hepsiburada">Hepsiburada</option>
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded border border-(--color-danger-border) bg-(--color-danger-bg) p-3 text-sm">
          {error}
        </div>
      )}
      {loading && <div className="text-sm text-(--color-muted)">Yükleniyor…</div>}

      {report && (
        <>
          <CoverageBadge coverage={report.coverage} sinceMs={report.filters.sinceMs} />

          {/* Our own store is in the archive by necessity — a rank means nothing without the
              offers it ranks among — so this screen has to know which offer is ours. When it
              cannot, we sit at the top of the competitor list on 100% of our own listings and
              the report simply looks wrong, with nothing pointing at the cause. */}
          {report.ownSellerUnresolved.length > 0 && (
            <div className="rounded border border-(--color-danger-border) bg-(--color-danger-bg) p-4 text-sm text-(--color-danger)">
              <strong className="block">Kendi mağazanız bu listede rakip olarak görünüyor.</strong>
              <ul className="mt-2 space-y-1">
                {report.ownSellerUnresolved.map((m) => (
                  <li key={m.marketplaceCode}>
                    <strong>{m.displayName}</strong>:{' '}
                    {m.configuredRef === null
                      ? 'satıcı referansı tanımlı değil'
                      : `tanımlı satıcı referansı (${m.configuredRef}) bu pazaryerinin tekliflerinde hiç görülmedi`}
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                Kendi teklifimizi ayırt edebilmek için pazaryerindeki satıcı kimliğimiz gerekir; isme
                göre eşleştirme yapılmaz.{' '}
                <Link className="underline" href="/settings/marketplaces">
                  Pazaryerleri
                </Link>{' '}
                ekranından &ldquo;Satıcı Referansı&rdquo; alanını düzeltin — aşağıdaki tüm sayılar
                o zaman yalnızca rakipleri sayar.
              </p>
            </div>
          )}

          {report.ownStores.length > 0 && (
            <div className="rounded border border-(--color-border) bg-(--color-hover) p-3 text-sm">
              <span className="font-medium">Kendi mağazamız</span> (rakip listesinden çıkarıldı):{' '}
              {report.ownStores.map((o, i) => (
                <span key={o.marketplaceCode}>
                  {i > 0 && ' · '}
                  {o.displayName} — {formatNumber(o.listingCount)} üründe,{' '}
                  {formatNumber(o.buyboxCount)} kez buybox ({formatPercent(o.buyboxRate * 100)})
                </span>
              ))}
            </div>
          )}

          {report.unidentifiedObservations > 0 && (
            <div className="rounded border border-(--color-warning-border) bg-(--color-warning-bg) p-3 text-sm">
              Bu dönemde <strong>{formatNumber(report.unidentifiedObservations)}</strong> teklif,
              pazaryerinin satıcı kimliği vermediği için aşağıdaki listede yer almıyor. Bu teklifler
              isme göre eşleştirilmez — aynı isim aynı firma anlamına gelmediği için yanlış satıcıya
              atfetmektense hiç atfetmemek tercih edilir.
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <ColumnMenu defs={COLUMN_DEFS} prefs={columns} />
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  'rakip-saticilar.csv',
                  report.sellers.map((s) => ({
                    Satıcı: s.sellerName,
                    Pazaryeri: s.marketplaceCode,
                    Grup: s.groupName ?? '',
                    Ürünümüz: s.listingCount,
                    Teklif: s.observationCount,
                    Buybox: s.buyboxCount,
                    'Buybox %': (s.buyboxRate * 100).toFixed(1),
                    'Ort. Sıra': s.avgRank ?? '',
                    'Min Fiyat': s.minPrice ? (Number(s.minPrice) / 100).toFixed(2) : '',
                    'Max Fiyat': s.maxPrice ? (Number(s.maxPrice) / 100).toFixed(2) : '',
                    'İlk Görülme': formatDateTime(s.firstSeenAt),
                    'Son Görülme': formatDateTime(s.lastSeenAt),
                  })),
                )
              }
              className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
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
                {paged.rows.map((s) => (
                  <tr key={`${s.marketplaceCode}:${s.sellerRef}`} className="border-t border-(--color-border)">
                    {COLUMN_DEFS.filter((d) => columns.isVisible(d.id)).map((d) => (
                      <td
                        key={d.id}
                        className={`px-3 py-2 ${
                          d.id === 'listingCount' || d.id === 'observationCount' || d.id === 'buyboxCount' ||
                          d.id === 'avgRank' || d.id === 'priceRange'
                            ? 'text-right'
                            : ''
                        } ${d.id === 'listingCount' ? 'font-medium' : ''}`}
                      >
                        {renderSellerCell(d.id, s)}
                      </td>
                    ))}
                  </tr>
                ))}
                {report.sellers.length === 0 && (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-(--color-muted)"
                      colSpan={COLUMN_DEFS.filter((d) => columns.isVisible(d.id)).length}
                    >
                      Bu dönemde kayıtlı rakip teklifi yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableFrame>

          <Pagination state={paged} label="satıcı" />

          <p className="text-xs text-(--color-muted)">
            &ldquo;İlk görülme&rdquo; bir <em>gözlem</em> tarihidir, satışa başlama tarihi değil:
            satıcı ondan önce de orada olabilir, taramalar arasındaki boşlukta fark edilmemiş
            olabilir. Bu yüzden ≥ ile gösterilir.
          </p>
        </>
      )}
    </div>
  );
}
