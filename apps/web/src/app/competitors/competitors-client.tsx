'use client';

import { useEffect, useState } from 'react';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPercent } from '@/lib/format';

interface ListingOption {
  id: string;
  productName: string;
  marketplaceCode: string;
  marketplaceListingId: string;
  baseStockCode: string | null;
}

interface Report {
  filters: { sinceMs: number; untilMs: number };
  truncated: { observations: boolean; scrapeRuns: boolean };
  priceTimeline: {
    buybox: { observedAt: number; buyboxPrice: string | null; rank: number | null }[];
    ourChanges: { at: number; oldPrice: string; newPrice: string }[];
  } | null;
  sellerPresence: {
    listingId: string;
    productName: string;
    marketplaceListingId: string;
    sellerRef: string | null;
    sellerName: string;
    firstSeen: number;
    lastSeen: number;
    observationCount: number;
  }[];
  buyboxShare: { sellerRef: string | null; sellerName: string; count: number; sharePct: number }[];
  sellerProfile: {
    sellerName: string;
    listingCount: number;
    observationCount: number;
    avgRank: number | null;
    promotionCount: number;
    firstSeen: number;
    lastSeen: number;
  } | null;
  observationCoverage: { date: string; ok: number; parseFailed: number; fetchFailed: number }[];
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? '')).join(','));
  }
  return lines.join('\n');
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

export function CompetitorsClient() {
  const [sinceMs, setSinceMs] = useState(daysAgo(30));
  const [untilMs, setUntilMs] = useState(Date.now());
  const [marketplaceCode, setMarketplaceCode] = useState('');
  const [baseStockCode, setBaseStockCode] = useState('');
  const [sellerRef, setSellerRef] = useState('');
  const [listingQuery, setListingQuery] = useState('');
  const [listingOptions, setListingOptions] = useState<ListingOption[]>([]);
  const [listingId, setListingId] = useState('');
  const [listingLabel, setListingLabel] = useState('');
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    if (!listingQuery) {
      setListingOptions([]);
      return;
    }
    const handle = setTimeout(() => {
      fetch(`/api/competitors/listings?text=${encodeURIComponent(listingQuery)}`)
        .then((r) => r.json())
        .then((d: { rows: ListingOption[] }) => setListingOptions(d.rows));
    }, 250);
    return () => clearTimeout(handle);
  }, [listingQuery]);

  function load() {
    const params = new URLSearchParams();
    params.set('sinceMs', String(sinceMs));
    params.set('untilMs', String(untilMs));
    if (marketplaceCode) params.set('marketplaceCode', marketplaceCode);
    if (baseStockCode) params.set('baseStockCode', baseStockCode);
    if (sellerRef) params.set('sellerRef', sellerRef);
    if (listingId) params.set('listingId', listingId);
    fetch(`/api/competitors?${params.toString()}`)
      .then((r) => r.json())
      .then((d: Report) => setReport(d));
  }

  useEffect(load, [sinceMs, untilMs, marketplaceCode, baseStockCode, sellerRef, listingId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Rakip Geçmişi</h1>

      <div className="flex flex-wrap items-end gap-3 rounded border border-[var(--color-border)] p-3">
        <label className="flex flex-col text-xs">
          Başlangıç
          <input
            type="date"
            value={new Date(sinceMs).toISOString().slice(0, 10)}
            onChange={(e) => setSinceMs(new Date(e.target.value).getTime())}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs">
          Bitiş
          <input
            type="date"
            value={new Date(untilMs).toISOString().slice(0, 10)}
            onChange={(e) => setUntilMs(new Date(e.target.value).getTime())}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs">
          Pazaryeri
          <select
            value={marketplaceCode}
            onChange={(e) => setMarketplaceCode(e.target.value)}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-sm"
          >
            <option value="">Tümü</option>
            <option value="trendyol">Trendyol</option>
            <option value="hepsiburada">Hepsiburada</option>
          </select>
        </label>
        <label className="flex flex-col text-xs">
          Stok Kodu
          <input
            value={baseStockCode}
            onChange={(e) => setBaseStockCode(e.target.value)}
            className="w-32 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs">
          Satıcı (sellerRef)
          <input
            value={sellerRef}
            onChange={(e) => setSellerRef(e.target.value)}
            className="w-32 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
          />
        </label>
        <label className="relative flex flex-col text-xs">
          İlan (fiyat zaman çizelgesi için)
          <input
            value={listingLabel || listingQuery}
            onChange={(e) => {
              setListingLabel('');
              setListingId('');
              setListingQuery(e.target.value);
            }}
            placeholder="Ürün adı ara…"
            className="w-56 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
          />
          {listingOptions.length > 0 && !listingId && (
            <ul className="absolute top-full z-10 mt-1 max-h-48 w-56 overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow">
              {listingOptions.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="block w-full px-2 py-1 text-left text-xs hover:bg-slate-50"
                    onClick={() => {
                      setListingId(o.id);
                      setListingLabel(o.productName);
                      setListingOptions([]);
                    }}
                  >
                    {o.productName} ({o.marketplaceCode})
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>
        {listingId && (
          <button
            type="button"
            onClick={() => {
              setListingId('');
              setListingLabel('');
              setListingQuery('');
            }}
            className="rounded border px-2 py-1 text-xs"
          >
            İlan Filtresini Kaldır
          </button>
        )}
      </div>

      {report?.truncated.observations && (
        <p className="rounded border border-[var(--color-warning)] bg-amber-50 p-2 text-xs">
          Gözlem sayısı 20.000 sınırını aştı — sonuçlar kesildi. Tarih aralığını daraltın.
        </p>
      )}

      {report?.priceTimeline && (
        <section className="rounded border border-[var(--color-border)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-medium">Fiyat Zaman Çizelgesi</h2>
            <button
              type="button"
              onClick={() => downloadCsv('fiyat-zaman-cizelgesi.csv', report.priceTimeline!.buybox)}
              className="rounded border px-2 py-1 text-xs"
            >
              CSV İndir
            </button>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left uppercase text-[var(--color-muted)]">
              <tr>
                <th className="px-2 py-1">Zaman</th>
                <th className="px-2 py-1">Buybox Fiyatı</th>
                <th className="px-2 py-1">Sıra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {report.priceTimeline.buybox.map((h, i) => (
                <tr key={i}>
                  <td className="px-2 py-1">{formatDateTime(h.observedAt)}</td>
                  <td className="px-2 py-1">{formatMoney(h.buyboxPrice ? BigInt(h.buyboxPrice) : null)}</td>
                  <td className="px-2 py-1">{h.rank ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.priceTimeline.ourChanges.length > 0 && (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Fiyat değişikliklerimiz:{' '}
              {report.priceTimeline.ourChanges.map((c, i) => (
                <span key={i} className="mr-2">
                  {formatDateTime(c.at)} {formatMoney(BigInt(c.oldPrice))}→{formatMoney(BigInt(c.newPrice))}
                </span>
              ))}
            </p>
          )}
        </section>
      )}

      <section className="rounded border border-[var(--color-border)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Satıcı Varlığı (Giriş/Çıkış)</h2>
          <button
            type="button"
            onClick={() => report && downloadCsv('satici-varligi.csv', report.sellerPresence)}
            className="rounded border px-2 py-1 text-xs"
          >
            CSV İndir
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left uppercase text-[var(--color-muted)]">
              <tr>
                <th className="px-2 py-1">Ürün</th>
                <th className="px-2 py-1">Satıcı</th>
                <th className="px-2 py-1">İlk Görülme</th>
                <th className="px-2 py-1">Son Görülme</th>
                <th className="px-2 py-1">Gözlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(report?.sellerPresence ?? []).map((p, i) => (
                <tr key={i}>
                  <td className="px-2 py-1">{p.productName}</td>
                  <td className="px-2 py-1">{p.sellerName}</td>
                  <td className="px-2 py-1">{formatDate(p.firstSeen)}</td>
                  <td className="px-2 py-1">{formatDate(p.lastSeen)}</td>
                  <td className="px-2 py-1">{formatNumber(p.observationCount)}</td>
                </tr>
              ))}
              {(report?.sellerPresence.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-[var(--color-muted)]">
                    Filtreyle eşleşen kayıt yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border border-[var(--color-border)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Buybox Payı</h2>
          <button
            type="button"
            onClick={() => report && downloadCsv('buybox-payi.csv', report.buyboxShare)}
            className="rounded border px-2 py-1 text-xs"
          >
            CSV İndir
          </button>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left uppercase text-[var(--color-muted)]">
            <tr>
              <th className="px-2 py-1">Satıcı</th>
              <th className="px-2 py-1">Buybox Anı</th>
              <th className="px-2 py-1">Pay</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {(report?.buyboxShare ?? []).map((s, i) => (
              <tr key={i}>
                <td className="px-2 py-1">{s.sellerName}</td>
                <td className="px-2 py-1">{formatNumber(s.count)}</td>
                <td className="px-2 py-1">{formatPercent(s.sharePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {report?.sellerProfile && (
        <section className="rounded border border-[var(--color-border)] p-4">
          <h2 className="mb-2 text-lg font-medium">Satıcı Profili — {report.sellerProfile.sellerName}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-[var(--color-muted)]">Görüldüğü Ürün</div>
              <div className="text-lg">{formatNumber(report.sellerProfile.listingCount)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted)]">Ortalama Sıra</div>
              <div className="text-lg">{report.sellerProfile.avgRank?.toFixed(2) ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted)]">Kampanyalı Gözlem</div>
              <div className="text-lg">{formatNumber(report.sellerProfile.promotionCount)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted)]">Aktiflik</div>
              <div className="text-sm">
                {formatDate(report.sellerProfile.firstSeen)} – {formatDate(report.sellerProfile.lastSeen)}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="rounded border border-[var(--color-border)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Gözlem Kapsamı</h2>
          <button
            type="button"
            onClick={() => report && downloadCsv('gozlem-kapsami.csv', report.observationCoverage)}
            className="rounded border px-2 py-1 text-xs"
          >
            CSV İndir
          </button>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left uppercase text-[var(--color-muted)]">
            <tr>
              <th className="px-2 py-1">Tarih</th>
              <th className="px-2 py-1">Başarılı</th>
              <th className="px-2 py-1">Ayrıştırma Hatası</th>
              <th className="px-2 py-1">Getirme Hatası</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {(report?.observationCoverage ?? []).map((c) => (
              <tr key={c.date}>
                <td className="px-2 py-1">{c.date}</td>
                <td className="px-2 py-1">{formatNumber(c.ok)}</td>
                <td className="px-2 py-1">
                  {c.parseFailed > 0 ? <span className="row-warning">{formatNumber(c.parseFailed)}</span> : 0}
                </td>
                <td className="px-2 py-1">
                  {c.fetchFailed > 0 ? <span className="row-danger">{formatNumber(c.fetchFailed)}</span> : 0}
                </td>
              </tr>
            ))}
            {(report?.observationCoverage.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-4 text-center text-[var(--color-muted)]">
                  Seçilen aralıkta tarama kaydı yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
