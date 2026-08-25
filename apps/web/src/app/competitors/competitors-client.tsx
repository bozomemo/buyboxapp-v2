'use client';

import { useEffect, useState } from 'react';
import { Pagination, STICKY_HEAD, TableFrame, usePagedRows } from '@/components/table';
import { downloadCsv } from '@/lib/csv';
import { formatDate, formatDateTime, formatDuration, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { CoverageBadge, type Coverage } from './coverage-badge';

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
  timeWeightedBuyboxShare: {
    sellerRef: string | null;
    sellerName: string;
    heldMs: number;
    sharePct: number;
  }[];
  uncoveredMs: number;
  coverage: Coverage;
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

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

/** Stable identity for "the report has not arrived yet", shared by every table on the screen. */
const NO_ROWS: never[] = [];

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

  // Every table here is paged against the same filter set, so they share one reset key: changing
  // the window or the product starts all of them at page 1.
  const filterKey = [sinceMs, untilMs, marketplaceCode, baseStockCode, sellerRef, listingId].join('|');
  const pagedTimeline = usePagedRows(report?.priceTimeline?.buybox ?? NO_ROWS, { resetKey: filterKey });
  const pagedPresence = usePagedRows(report?.sellerPresence ?? NO_ROWS, { resetKey: filterKey });
  const pagedTimeShare = usePagedRows(report?.timeWeightedBuyboxShare ?? NO_ROWS, {
    pageSize: 25,
    resetKey: filterKey,
  });
  const pagedCountShare = usePagedRows(report?.buyboxShare ?? NO_ROWS, {
    pageSize: 25,
    resetKey: filterKey,
  });
  const pagedCoverage = usePagedRows(report?.observationCoverage ?? NO_ROWS, {
    pageSize: 25,
    resetKey: filterKey,
  });

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

      <div className="flex flex-wrap items-end gap-3 rounded border border-(--color-border) p-3">
        <label className="flex flex-col text-xs">
          Başlangıç
          <input
            type="date"
            value={new Date(sinceMs).toISOString().slice(0, 10)}
            onChange={(e) => setSinceMs(new Date(e.target.value).getTime())}
            className="rounded border border-(--color-border) px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs">
          Bitiş
          <input
            type="date"
            value={new Date(untilMs).toISOString().slice(0, 10)}
            onChange={(e) => setUntilMs(new Date(e.target.value).getTime())}
            className="rounded border border-(--color-border) px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs">
          Pazaryeri
          <select
            value={marketplaceCode}
            onChange={(e) => setMarketplaceCode(e.target.value)}
            className="rounded border border-(--color-border) px-2 py-1 text-sm"
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
            className="w-32 rounded border border-(--color-border) px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs">
          Satıcı (sellerRef)
          <input
            value={sellerRef}
            onChange={(e) => setSellerRef(e.target.value)}
            className="w-32 rounded border border-(--color-border) px-2 py-1 text-sm"
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
            className="w-56 rounded border border-(--color-border) px-2 py-1 text-sm"
          />
          {listingOptions.length > 0 && !listingId && (
            <ul className="absolute top-full z-10 mt-1 max-h-48 w-56 overflow-y-auto rounded border border-(--color-border) bg-(--color-surface) shadow">
              {listingOptions.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="block w-full px-2 py-1 text-left text-xs hover:bg-(--color-hover)"
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
        <p className="rounded border border-(--color-warning) bg-(--color-warning-bg) p-2 text-xs">
          Gözlem sayısı 20.000 sınırını aştı — sonuçlar kesildi. Tarih aralığını daraltın.
        </p>
      )}

      {report?.priceTimeline && (
        <section className="rounded border border-(--color-border) p-4">
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
          <TableFrame maxHeight="50vh">
            <table className="w-full text-xs">
              <thead className={`${STICKY_HEAD} text-left uppercase text-(--color-muted)`}>
                <tr>
                  <th className="px-2 py-1">Zaman</th>
                  <th className="px-2 py-1">Buybox Fiyatı</th>
                  <th className="px-2 py-1">Sıra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {pagedTimeline.rows.map((h, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1">{formatDateTime(h.observedAt)}</td>
                    <td className="px-2 py-1">{formatMoney(h.buyboxPrice ? BigInt(h.buyboxPrice) : null)}</td>
                    <td className="px-2 py-1">{h.rank ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
          <div className="mt-2">
            <Pagination state={pagedTimeline} label="gözlem" />
          </div>
          {report.priceTimeline.ourChanges.length > 0 && (
            <p className="mt-2 text-xs text-(--color-muted)">
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

      {report && <CoverageBadge coverage={report.coverage} sinceMs={report.filters.sinceMs} />}

      <section className="rounded border border-(--color-border) p-4">
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
        <TableFrame maxHeight="50vh">
          <table className="w-full text-xs">
            <thead className={`${STICKY_HEAD} text-left uppercase text-(--color-muted)`}>
              <tr>
                <th className="px-2 py-1">Ürün</th>
                <th className="px-2 py-1">Satıcı</th>
                <th className="px-2 py-1">İlk Görülme (≥)</th>
                <th className="px-2 py-1">Son Görülme</th>
                <th className="px-2 py-1">Gözlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {pagedPresence.rows.map((p, i) => (
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
                  <td colSpan={5} className="px-2 py-4 text-center text-(--color-muted)">
                    Filtreyle eşleşen kayıt yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableFrame>
        <div className="mt-2">
          <Pagination state={pagedPresence} label="satıcı-ürün kaydı" />
        </div>
      </section>

      <section className="rounded border border-(--color-border) p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Buybox Payı</h2>
          <button
            type="button"
            onClick={() =>
              report &&
              downloadCsv(
                'buybox-payi.csv',
                listingId ? report.timeWeightedBuyboxShare : report.buyboxShare,
              )
            }
            className="rounded border px-2 py-1 text-xs"
          >
            CSV İndir
          </button>
        </div>
        {listingId ? (
          <>
            <p className="mb-2 text-xs text-(--color-muted)">
              Zaman ağırlıklı: her gözlem, bir sonraki gözleme kadar geçen süre kadar sayılır.
              Tarama yapılmayan boşluklar paydaya <strong>dahil edilmez</strong> — o aralıkta
              buybox&apos;ı kimin tuttuğunu bilmiyoruz.
            </p>
            <TableFrame maxHeight="50vh">
              <table className="w-full text-xs">
                <thead className={`${STICKY_HEAD} text-left uppercase text-(--color-muted)`}>
                  <tr>
                    <th className="px-2 py-1">Satıcı</th>
                    <th className="px-2 py-1">Tuttuğu Süre</th>
                    <th className="px-2 py-1">Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border)">
                  {pagedTimeShare.rows.map((s, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1">{s.sellerName}</td>
                      <td className="px-2 py-1">{formatDuration(s.heldMs)}</td>
                      <td className="px-2 py-1">{formatPercent(s.sharePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrame>
            <div className="mt-2">
              <Pagination state={pagedTimeShare} label="satıcı" />
            </div>
            {report && report.uncoveredMs > 0 && (
              <p className="mt-2 text-xs text-(--color-muted)">
                Bu dönemin <strong>{formatDuration(report.uncoveredMs)}</strong> kadarında hiç
                gözlem yok; yukarıdaki yüzdeler yalnızca gözlenen süreye aittir.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-(--color-muted)">
              Bu tabloda her satıcının kaç <em>gözlemde</em> buybox&apos;ta olduğu sayılır, ne
              kadar <em>süre</em> tuttuğu değil. Süreye göre pay için tek bir ilan seçin.
            </p>
            <TableFrame maxHeight="50vh">
              <table className="w-full text-xs">
                <thead className={`${STICKY_HEAD} text-left uppercase text-(--color-muted)`}>
                  <tr>
                    <th className="px-2 py-1">Satıcı</th>
                    <th className="px-2 py-1">Buybox Anı</th>
                    <th className="px-2 py-1">Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border)">
                  {pagedCountShare.rows.map((s, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1">{s.sellerName}</td>
                      <td className="px-2 py-1">{formatNumber(s.count)}</td>
                      <td className="px-2 py-1">{formatPercent(s.sharePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrame>
            <div className="mt-2">
              <Pagination state={pagedCountShare} label="satıcı" />
            </div>
          </>
        )}
      </section>

      {report?.sellerProfile && (
        <section className="rounded border border-(--color-border) p-4">
          <h2 className="mb-2 text-lg font-medium">Satıcı Profili — {report.sellerProfile.sellerName}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-(--color-muted)">Görüldüğü Ürün</div>
              <div className="text-lg">{formatNumber(report.sellerProfile.listingCount)}</div>
            </div>
            <div>
              <div className="text-xs text-(--color-muted)">Ortalama Sıra</div>
              <div className="text-lg">{report.sellerProfile.avgRank?.toFixed(2) ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-(--color-muted)">Kampanyalı Gözlem</div>
              <div className="text-lg">{formatNumber(report.sellerProfile.promotionCount)}</div>
            </div>
            <div>
              <div className="text-xs text-(--color-muted)">Aktiflik</div>
              <div className="text-sm">
                {formatDate(report.sellerProfile.firstSeen)} – {formatDate(report.sellerProfile.lastSeen)}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="rounded border border-(--color-border) p-4">
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
        <TableFrame maxHeight="50vh">
        <table className="w-full text-xs">
          <thead className={`${STICKY_HEAD} text-left uppercase text-(--color-muted)`}>
            <tr>
              <th className="px-2 py-1">Tarih</th>
              <th className="px-2 py-1">Başarılı</th>
              <th className="px-2 py-1">Ayrıştırma Hatası</th>
              <th className="px-2 py-1">Getirme Hatası</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {pagedCoverage.rows.map((c) => (
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
                <td colSpan={4} className="px-2 py-4 text-center text-(--color-muted)">
                  Seçilen aralıkta tarama kaydı yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </TableFrame>
        <div className="mt-2">
          <Pagination state={pagedCoverage} label="gün" />
        </div>
      </section>
    </div>
  );
}
