'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Pagination, STICKY_HEAD, TableFrame, usePagedRows } from '@/components/table';
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

export function SellersClient() {
  const [sinceMs, setSinceMs] = useState(daysAgo(30));
  const [marketplaceCode, setMarketplaceCode] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paged = usePagedRows(report?.sellers ?? NO_SELLERS, {
    resetKey: `${sinceMs}|${marketplaceCode}`,
  });

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
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            İzlediğimiz ürünlerde karşımıza çıkan satıcılar, en çok çakışandan başlayarak. Bu
            veriler <strong>tekliflerden</strong> gelir; bir satıcının ürünü kaç kez{' '}
            <em>listelediğini</em> gösterir, kaç adet sattığını değil.
          </p>
        </div>
        <div className="flex items-end gap-3">
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
          <label className="text-sm">
            <span className="mb-1 block text-neutral-500">Pazaryeri</span>
            <select
              className="rounded border border-neutral-300 px-2 py-1"
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

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">{error}</div>}
      {loading && <div className="text-sm text-neutral-500">Yükleniyor…</div>}

      {report && (
        <>
          <CoverageBadge coverage={report.coverage} sinceMs={report.filters.sinceMs} />

          {/* Our own store is in the archive by necessity — a rank means nothing without the
              offers it ranks among — so this screen has to know which offer is ours. When it
              cannot, we sit at the top of the competitor list on 100% of our own listings and
              the report simply looks wrong, with nothing pointing at the cause. */}
          {report.ownSellerUnresolved.length > 0 && (
            <div className="rounded border border-red-400 bg-red-50 p-4 text-sm text-red-900">
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
            <div className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
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
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              Bu dönemde <strong>{formatNumber(report.unidentifiedObservations)}</strong> teklif,
              pazaryerinin satıcı kimliği vermediği için aşağıdaki listede yer almıyor. Bu teklifler
              isme göre eşleştirilmez — aynı isim aynı firma anlamına gelmediği için yanlış satıcıya
              atfetmektense hiç atfetmemek tercih edilir.
            </div>
          )}

          <TableFrame>
            <table className="min-w-full text-sm">
              <thead className={`${STICKY_HEAD} text-left`}>
                <tr>
                  <th className="px-3 py-2">Satıcı</th>
                  <th className="px-3 py-2">Pazaryeri</th>
                  <th className="px-3 py-2 text-right">Ürünümüz</th>
                  <th className="px-3 py-2 text-right">Teklif</th>
                  <th className="px-3 py-2 text-right">Buybox</th>
                  <th className="px-3 py-2 text-right">Ort. sıra</th>
                  <th className="px-3 py-2 text-right">Fiyat aralığı</th>
                  <th className="px-3 py-2">İlk görülme</th>
                  <th className="px-3 py-2">Son görülme</th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((s) => (
                  <tr key={`${s.marketplaceCode}:${s.sellerRef}`} className="border-t border-neutral-100">
                    <td className="px-3 py-2">
                      <Link
                        className="font-medium text-blue-700 hover:underline"
                        href={`/competitors/sellers/${s.marketplaceCode}/${encodeURIComponent(s.sellerRef)}`}
                      >
                        {s.sellerName || s.sellerRef}
                      </Link>
                      {s.groupName && (
                        <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                          {s.groupName}
                        </span>
                      )}
                      {s.operatorNote && (
                        <div className="text-xs text-neutral-500">{s.operatorNote}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">{s.marketplaceCode}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatNumber(s.listingCount)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(s.observationCount)}</td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(s.buyboxCount)}
                      <span className="ml-1 text-xs text-neutral-500">
                        ({formatPercent(s.buyboxRate * 100)})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.avgRank === null ? '—' : s.avgRank.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.minPrice === null
                        ? '—'
                        : `${formatMoney(BigInt(s.minPrice))} – ${formatMoney(BigInt(s.maxPrice ?? s.minPrice))}`}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-neutral-600">
                      ≥ {formatDateTime(s.firstSeenAt)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-neutral-600">
                      {formatDateTime(s.lastSeenAt)}
                    </td>
                  </tr>
                ))}
                {report.sellers.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-neutral-500" colSpan={9}>
                      Bu dönemde kayıtlı rakip teklifi yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableFrame>

          <Pagination state={paged} label="satıcı" />

          <p className="text-xs text-neutral-500">
            &ldquo;İlk görülme&rdquo; bir <em>gözlem</em> tarihidir, satışa başlama tarihi değil:
            satıcı ondan önce de orada olabilir, taramalar arasındaki boşlukta fark edilmemiş
            olabilir. Bu yüzden ≥ ile gösterilir.
          </p>
        </>
      )}
    </div>
  );
}
