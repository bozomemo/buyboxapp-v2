'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PriceChart } from '@/components/price-chart';
import { STICKY_HEAD, TableFrame } from '@/components/table';
import { alignBrandSeries, COMPARISON_COLORS } from '@/lib/brand-comparison';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatMoney, formatNumber, formatPercent } from '@/lib/format';

/**
 * Marka Karşılaştırması (2026-09-03).
 *
 * Modül bugüne kadar tek bir varsayım üzerine kuruluydu: izlenen marka, operatörün sorumlu
 * olduğu markadır. Aynı süpürme ve aynı derin tarama, bir **rakip** markaya çevrildiğinde hiç
 * sorulmamış bir soruyu cevaplar — o marka ne fiyata satılıyor ve bizimki ona göre nerede
 * duruyor. Eksik olan tek şey niyetti (`watched_brands.is_own_brand`) ve bu rapordu.
 *
 * ⚠️ **Bu bir birebir fiyat karşılaştırması değildir ve ekran bunu söyler.** İki marka, bir
 * ürünün iki sürümü değildir: gramajlar farklı, ürün kırılımı farklıdır, ve daha çok üst segment
 * hattı olan bir marka karşılaştırılabilir her üründe daha ucuzken endekste yüksek çıkar. Rakamın
 * dürüstçe izlediği şey **hareket**tir — makas açılıyor mu, kapanıyor mu.
 */

interface BrandOption {
  id: string;
  label: string;
  marketplaceCode: string;
  isOwnBrand: boolean;
}

interface Series extends BrandOption {
  points: { dayMs: number; avgPrice: string | null; sellerCount: number; productsWithOffers: number }[];
  windowAvgPrice: string | null;
}

interface Report {
  window: { sinceMs: number; untilMs: number };
  brands: BrandOption[];
  series: Series[];
  index: {
    baselineBrandId: string;
    baselineLabel: string;
    brands: { id: string; label: string; indexPct: number }[];
  } | null;
  hasCompetitorBrand: boolean;
}

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

export function BrandComparisonClient() {
  const [sinceMs, setSinceMs] = useState(daysAgo(30));
  const [selected, setSelected] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ sinceMs: String(sinceMs) });
    for (const id of selected) params.append('watchedBrandId', id);
    fetch(`/api/brand-reports/comparison?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Karşılaştırma yüklenemedi.'))))
      .then((data: Report) => setReport(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sinceMs, selected]);

  useEffect(load, [load]);

  const aligned = alignBrandSeries(report?.series ?? []);
  const indexByBrand = new Map((report?.index?.brands ?? []).map((b) => [b.id, b.indexPct]));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Marka Karşılaştırması</h1>
        <p className="mt-1 max-w-3xl text-sm text-(--color-muted)">
          İzlenen markaların dönem içindeki ortalama piyasa fiyatı. Bir markayı{' '}
          <Link className="underline" href="/watched-brands">
            İzlenen Markalar
          </Link>{' '}
          ekranından <em>rakip marka</em> olarak işaretlediğinizde denetim dışında kalır ve burada
          karşılaştırma tabanı olur.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded border border-(--color-border) p-3 text-sm">
        <label className="flex flex-col text-xs">
          Dönem
          <select
            value={String(sinceMs)}
            onChange={(e) => setSinceMs(Number(e.target.value))}
            className="rounded border border-(--color-border) px-2 py-1 text-sm"
          >
            <option value={String(daysAgo(7))}>Son 7 gün</option>
            <option value={String(daysAgo(30))}>Son 30 gün</option>
            <option value={String(daysAgo(90))}>Son 90 gün</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {(report?.brands ?? []).map((brand) => {
            const on = selected.length === 0 || selected.includes(brand.id);
            return (
              <button
                key={brand.id}
                type="button"
                onClick={() =>
                  setSelected((current) =>
                    current.includes(brand.id)
                      ? current.filter((id) => id !== brand.id)
                      : [...current, brand.id],
                  )
                }
                className={`rounded border px-2 py-1 text-xs ${
                  on
                    ? 'border-(--color-accent) text-(--color-accent)'
                    : 'border-(--color-border) text-(--color-muted)'
                }`}
              >
                {brand.label}
                <span className="ml-1 text-(--color-muted)">{brand.isOwnBrand ? 'bizim' : 'rakip'}</span>
              </button>
            );
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected([])}
              className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
            >
              Tümü
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-(--color-danger)">{error}</p>}
      {loading && <p className="text-sm text-(--color-muted)">Yükleniyor…</p>}

      {report && !report.hasCompetitorBrand && (
        <div className="rounded border border-(--color-border) p-3 text-sm text-(--color-muted)">
          Hiç <strong>rakip marka</strong> izlenmiyor, bu yüzden endeks hesaplanmıyor. Rakip bir markayı da
          izlemeye almak, aynı süpürmenin sizin markanız için zaten yaptığı işi onun için de yapar — ve
          denetim bulguları üretilmez, çünkü &quot;yetkili satıcı&quot; bizim markamız hakkında bir ifadedir.
        </div>
      )}

      {report && report.index && (
        <div className="rounded border border-(--color-border) p-4">
          <div className="mb-2 text-sm">
            <strong>{report.index.baselineLabel}</strong> tabanına göre fiyat endeksi
          </div>
          <div className="flex flex-wrap gap-4">
            {report.index.brands.map((b) => (
              <div key={b.id} className="rounded border border-(--color-border) px-3 py-2">
                <div className="text-xs text-(--color-muted)">{b.label}</div>
                <div className="text-xl font-bold tabular-nums">{b.indexPct.toFixed(1)}</div>
                <div className="text-xs text-(--color-muted)">
                  {b.indexPct > 100
                    ? `%${(b.indexPct - 100).toFixed(1)} üstünde`
                    : `%${(100 - b.indexPct).toFixed(1)} altında`}
                </div>
              </div>
            ))}
          </div>
          {/* Yanlış okunması en kolay rakam bu; uyarı sayfadan ayrı düşmesin diye tam yanında. */}
          <p className="mt-2 max-w-3xl text-xs text-(--color-muted)">
            Birebir ürün karşılaştırması <em>değildir</em>: gramaj ve ürün kırılımı farklıdır, üst segment
            hattı ağır basan bir marka her üründe daha ucuzken endekste yüksek çıkabilir. Anlamlı olan
            seviyenin kendisi değil, zaman içindeki <strong>hareketidir</strong>.
          </p>
        </div>
      )}

      {aligned.timestamps.length > 1 && (
        <div className="rounded border border-(--color-border) p-4">
          <div className="mb-2 text-xs text-(--color-muted)">Ortalama piyasa fiyatı — günlük</div>
          <PriceChart
            timestamps={[...aligned.timestamps]}
            series={aligned.brands.map((brand, i) => ({
              key: brand.id,
              label: brand.label,
              color: COMPARISON_COLORS[i % COMPARISON_COLORS.length]!,
              values: [...brand.values],
            }))}
          />
        </div>
      )}

      <section className="rounded border border-(--color-border) p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Dönem özeti</h2>
          <button
            type="button"
            disabled={(report?.series.length ?? 0) === 0}
            onClick={() =>
              downloadCsv(
                'marka-karsilastirmasi.csv',
                (report?.series ?? []).map((s) => ({
                  Marka: s.label,
                  Pazaryeri: s.marketplaceCode,
                  Tür: s.isOwnBrand ? 'bizim' : 'rakip',
                  'Ortalama Fiyat': s.windowAvgPrice ? (Number(s.windowAvgPrice) / 100).toFixed(2) : '',
                  Endeks: indexByBrand.get(s.id)?.toFixed(1) ?? '',
                  'Veri Günü': s.points.length,
                })),
              )
            }
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-40"
          >
            Excel&apos;e Aktar
          </button>
        </div>
        <TableFrame maxHeight="50vh">
          <table className="w-full text-sm">
            <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-(--color-muted)`}>
              <tr>
                <th className="px-2 py-1">Marka</th>
                <th className="px-2 py-1">Tür</th>
                <th className="px-2 py-1">Ort. fiyat</th>
                <th className="px-2 py-1">Endeks</th>
                <th className="px-2 py-1">Veri günü</th>
                <th className="px-2 py-1">Son gün</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {(report?.series ?? []).map((s) => {
                const last = s.points[s.points.length - 1];
                return (
                  <tr key={s.id}>
                    <td className="px-2 py-1">
                      <Link
                        href={`/tracked-products?watchedBrandId=${encodeURIComponent(s.id)}`}
                        className="text-(--color-accent) hover:underline"
                      >
                        {s.label}
                      </Link>
                    </td>
                    <td className="px-2 py-1 text-xs text-(--color-muted)">
                      {s.isOwnBrand ? 'bizim' : 'rakip'}
                    </td>
                    <td className="px-2 py-1">
                      {formatMoney(s.windowAvgPrice ? BigInt(s.windowAvgPrice) : null)}
                    </td>
                    <td className="px-2 py-1 tabular-nums">
                      {indexByBrand.has(s.id) ? formatPercent(indexByBrand.get(s.id)!) : '—'}
                    </td>
                    {/* Kaç günün verisi var — ortalamanın ne kadar üstüne bastığını söyler.
                        İki günlük veriden çıkan bir endeks, otuz günlükle aynı görünmemeli. */}
                    <td className="px-2 py-1 tabular-nums">{formatNumber(s.points.length)}</td>
                    <td className="px-2 py-1">{last ? formatDateTime(last.dayMs) : '—'}</td>
                  </tr>
                );
              })}
              {(report?.series ?? []).length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-(--color-muted)">
                    Bu dönemde hiçbir marka için kayıtlı bakış yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableFrame>
      </section>
    </div>
  );
}
