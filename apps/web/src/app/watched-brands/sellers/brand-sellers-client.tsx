'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { SellerIdentityPanel } from './seller-identity-panel';

interface Seller {
  marketplaceCode: string;
  sellerRef: string;
  sellerName: string;
  groupId: string | null;
  groupName: string | null;
  operatorNote: string | null;
  productCount: number;
  observationCount: number;
  buyboxCount: number;
  cheapestCount: number;
  buyboxRate: number;
  /** Bu satıcının, markanın **tüm** buybox'ı içindeki payı — kendi maçlarındaki galibiyet oranı değil. */
  buyboxSharePct: number;
  cheapestRate: number;
  avgDeviationPct: number | null;
  /** `null` unless the report is scoped to a single brand — a verdict is per brand. */
  verdict: 'authorised' | 'blocked' | 'undefined' | null;
  minPrice: string | null;
  maxPrice: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
}

interface Report {
  filters: {
    sinceMs: number;
    untilMs: number;
    marketplaceCode: string | null;
    watchedBrandId: string | null;
    groupId: string | null;
  };
  groups: { id: string; name: string }[];
  brands: { id: string; groupId: string; label: string; marketplaceCode: string }[];
  sellers: Seller[];
  unidentifiedCount: number;
  buybox: { totalLooks: number; unidentifiedLooks: number };
}

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

/** Stable identity for "the report has not arrived yet". */
const NO_SELLERS: never[] = [];

/**
 * Below the market by more than this, on average, and the row is called out.
 *
 * A starting point, not a rule — it is the figure a distributor asks about first, and the
 * threshold becomes configurable with the audit findings in Faz 6. Highlighted rather than
 * filtered on, because a seller 12% under the market may be perfectly entitled to be and the
 * screen is not in a position to know.
 */
const DEVIATION_ALERT_PCT = -15;

const VERDICT_LABEL = {
  authorised: 'Yetkili',
  blocked: 'Yasaklı',
  undefined: 'Tanımsız',
} as const;

const VERDICT_CLASS = {
  authorised: 'bg-(--color-success-bg) text-(--color-success)',
  blocked: 'bg-(--color-danger-bg) text-(--color-danger)',
  undefined: 'text-(--color-muted)',
} as const;

type ColumnId =
  | 'sellerName'
  | 'verdict'
  | 'marketplace'
  | 'productCount'
  | 'observationCount'
  | 'buyboxCount'
  | 'cheapestCount'
  | 'deviation'
  | 'priceRange'
  | 'buyboxSharePct'
  | 'firstSeenAt'
  | 'lastSeenAt'
  | 'identity';

const COLUMN_DEFS: ColumnDef<ColumnId>[] = [
  { id: 'sellerName', label: 'Satıcı', defaultWidth: 220 },
  { id: 'verdict', label: 'Politika', defaultWidth: 100 },
  { id: 'marketplace', label: 'Pazaryeri', defaultWidth: 100, hiddenByDefault: true },
  { id: 'productCount', label: 'Ürün', defaultWidth: 80 },
  { id: 'observationCount', label: 'Teklif', defaultWidth: 80, hiddenByDefault: true },
  { id: 'buyboxCount', label: 'Buybox', defaultWidth: 110 },
  { id: 'buyboxSharePct', label: 'Buybox payı', defaultWidth: 110 },
  { id: 'cheapestCount', label: 'En ucuz', defaultWidth: 110 },
  { id: 'deviation', label: 'Piyasa sapması', defaultWidth: 130 },
  { id: 'priceRange', label: 'Fiyat aralığı', defaultWidth: 170 },
  { id: 'firstSeenAt', label: 'İlk görülme', defaultWidth: 130, hiddenByDefault: true },
  { id: 'lastSeenAt', label: 'Son görülme', defaultWidth: 130 },
  { id: 'identity', label: 'Kimlik', defaultWidth: 90 },
];

/**
 * The link into the seller page carries this screen's own scope — the window, and the brand when
 * one is selected. Without it the operator arrived at the seller's whole footprint and had to
 * rebuild the filter that produced the row they clicked.
 */
function sellerHref(s: Seller, sinceMs: number, watchedBrandId: string | null): string {
  const params = new URLSearchParams({ sinceMs: String(sinceMs) });
  if (watchedBrandId) params.set('watchedBrandId', watchedBrandId);
  return `/competitors/sellers/${s.marketplaceCode}/${encodeURIComponent(s.sellerRef)}?${params}`;
}

function renderSellerCell(
  id: ColumnId,
  s: Seller,
  onResolveIdentity: (s: Seller) => void,
  sinceMs: number,
  watchedBrandId: string | null,
): React.ReactNode {
  switch (id) {
    case 'sellerName':
      return (
        <>
          {/* The same seller-detail page the competitor screens link to. One company, one page —
              the identity is shared, and since 2026-08-29 that page carries *both* reports, so a
              seller we share no product with no longer lands on an empty table. */}
          <Link
            className="font-medium text-(--color-accent) hover:underline"
            href={sellerHref(s, sinceMs, watchedBrandId)}
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
    case 'verdict':
      // `undefined` renders muted, not as a warning: it is the state almost every seller is in,
      // and colouring it as a problem trains the operator to ignore the colour that matters.
      if (s.verdict === null) {
        return (
          <span
            className="text-xs text-(--color-muted)"
            title="Politika markaya özeldir — kapsamdan bir marka seçin"
          >
            marka seçin
          </span>
        );
      }
      return (
        <span className={`rounded px-1.5 py-0.5 text-xs ${VERDICT_CLASS[s.verdict]}`}>
          {VERDICT_LABEL[s.verdict]}
        </span>
      );
    case 'marketplace':
      return s.marketplaceCode;
    case 'productCount':
      return <span className="tabular-nums">{formatNumber(s.productCount)}</span>;
    case 'observationCount':
      return <span className="tabular-nums">{formatNumber(s.observationCount)}</span>;
    case 'buyboxCount':
      return (
        <span className="tabular-nums">
          {formatNumber(s.buyboxCount)}
          <span className="ml-1 text-xs text-(--color-muted)">({formatPercent(s.buyboxRate * 100)})</span>
        </span>
      );
    case 'buyboxSharePct':
      // The market-level figure, beside the seller-level one. A seller can win 90% of their own
      // appearances and hold 2% of the brand; the two columns exist to make that visible.
      return (
        <span
          className={`tabular-nums${s.buyboxSharePct >= 50 ? ' text-(--color-warning)' : ''}`}
          title="Markanın kayıtlı bütün buybox anları içindeki payı"
        >
          {formatPercent(s.buyboxSharePct)}
        </span>
      );
    case 'cheapestCount':
      return (
        <span className="tabular-nums">
          {formatNumber(s.cheapestCount)}
          <span className="ml-1 text-xs text-(--color-muted)">({formatPercent(s.cheapestRate * 100)})</span>
        </span>
      );
    case 'deviation':
      if (s.avgDeviationPct === null) return '—';
      return (
        <span
          className={`tabular-nums${s.avgDeviationPct <= DEVIATION_ALERT_PCT ? ' font-medium text-(--color-warning)' : ''}`}
          title="Bulunduğu her listelemedeki ortalama fiyatla arasındaki fark"
        >
          {s.avgDeviationPct > 0 ? '+' : ''}
          {formatPercent(s.avgDeviationPct)}
        </span>
      );
    case 'priceRange':
      return s.minPrice === null ? (
        '—'
      ) : (
        <span className="tabular-nums">
          {formatMoney(BigInt(s.minPrice))} – {formatMoney(BigInt(s.maxPrice ?? s.minPrice))}
        </span>
      );
    case 'firstSeenAt':
      // `≥`: the archive starts where it starts. A seller "first seen" on the window's opening
      // day may well have been there for a year before we looked.
      return <>≥ {formatDateTime(s.firstSeenAt)}</>;
    case 'lastSeenAt':
      return formatDateTime(s.lastSeenAt);
    case 'identity':
      // Per row rather than a bulk action, deliberately: each resolution is a real page request
      // to the marketplace, and the sellers worth identifying are the ones somebody intends to
      // write to.
      return (
        <button
          type="button"
          onClick={() => onResolveIdentity(s)}
          className="rounded border border-(--color-border) px-1.5 py-0.5 text-xs hover:bg-(--color-hover)"
        >
          Kimlik
        </button>
      );
  }
}

/**
 * Markalarımı kimler satıyor — marka sahibinin denetim ekranı (doc 06 §12.4).
 *
 * `/competitors/sellers` ekranının marka tarafındaki karşılığı: o ekran "sattığımız ürünlerde
 * kiminle rekabet ediyoruz" sorusunu `listings` üzerinden yanıtlar, bu ekran "sahibi olduğumuz
 * markayı kim satıyor" sorusunu `tracked_products` üzerinden yanıtlar. Marka sahibinin o
 * pazaryerinde hiç listelemesi olmayabilir; iki soru bu yüzden ayrı.
 *
 * Satıcı kimliği ikisinde de aynı kayıttan gelir (`competitor_sellers`), yani bir operatörün
 * elle kurduğu bağ, grup ve not iki ekranda da aynı firmayı gösterir.
 *
 * Sayılar **tekliflerden** gelir: bir satıcının ürünü kaç kez listelediğini gösterir, kaç adet
 * sattığını değil. Hiçbir pazaryeri satış adedini vermez.
 */
export function BrandSellersClient() {
  const [sinceMs, setSinceMs] = useState(daysAgo(30));
  const [marketplaceCode, setMarketplaceCode] = useState('');
  const [scope, setScope] = useState(''); // '' | `group:<id>` | `brand:<id>`
  const [report, setReport] = useState<Report | null>(null);
  /** The seller whose identity panel is open, or `null`. One at a time — see the panel. */
  const [identitySeller, setIdentitySeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paged = usePagedRows(report?.sellers ?? NO_SELLERS, {
    resetKey: `${sinceMs}|${marketplaceCode}|${scope}`,
  });
  const columns = useColumnPrefs<ColumnId>('brandSellers.columns', COLUMN_DEFS);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ sinceMs: String(sinceMs) });
    if (marketplaceCode) params.set('marketplaceCode', marketplaceCode);
    if (scope.startsWith('group:')) params.set('groupId', scope.slice('group:'.length));
    if (scope.startsWith('brand:')) params.set('watchedBrandId', scope.slice('brand:'.length));
    fetch(`/api/brand-reports/sellers?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Rapor yüklenemedi.'))))
      .then((data: Report) => setReport(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sinceMs, marketplaceCode, scope]);

  useEffect(load, [load]);

  const visibleColumns = useMemo(() => columns.order.filter((id) => columns.isVisible(id)), [columns]);

  /** Sellers averaging well under the market — the line a distributor reads first. */
  const belowMarket = (report?.sellers ?? []).filter(
    (s) => s.avgDeviationPct !== null && s.avgDeviationPct <= DEVIATION_ALERT_PCT,
  );
  /** Blocked *and* under the market — the pairing the audit is actually looking for. */
  const blockedAndCheap = belowMarket.filter((s) => s.verdict === 'blocked');

  /**
   * The seller holding the largest slice of the brand's buybox, named in the summary line.
   *
   * `null` when nobody holds a majority worth naming — under a fifth is a normal, fragmented
   * market, and calling out its leader would invent a finding out of an ordinary distribution.
   */
  const topShare = (report?.sellers ?? []).reduce<Seller | null>(
    (best, s) =>
      s.buyboxSharePct >= 20 && (best === null || s.buyboxSharePct > best.buyboxSharePct) ? s : best,
    null,
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Markalarımı Kimler Satıyor</h1>
          <p className="mt-1 max-w-3xl text-sm text-(--color-muted)">
            İzlenen markaların ürünlerinde görülen satıcılar, markanın en çok ürününde görülenden başlayarak.
            Sayılar <strong>tekliflerden</strong> gelir: bir satıcının ürünü kaç kez <em>listelediğini</em>{' '}
            gösterir, kaç adet sattığını değil.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-(--color-muted)">Kapsam</span>
            <select
              className="rounded border border-(--color-border) px-2 py-1"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="">Tüm markalar</option>
              {(report?.groups ?? []).map((g) => (
                <optgroup key={g.id} label={g.name}>
                  <option value={`group:${g.id}`}>{g.name} — tümü</option>
                  {(report?.brands ?? [])
                    .filter((b) => b.groupId === g.id)
                    .map((b) => (
                      <option key={b.id} value={`brand:${b.id}`}>
                        {b.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
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
          {report.sellers.length === 0 && !loading && (
            <div className="rounded border border-(--color-border) p-4 text-sm text-(--color-muted)">
              Bu dönemde hiç teklif kaydı yok. Marka taraması ürünleri bulur ama fiyatları getirmez — satıcı
              ve fiyat verisi için ürün başına derin tarama (<code>ScrapeCompetitors</code>) çalışmalıdır.{' '}
              <Link className="underline" href="/jobs">
                İşler
              </Link>{' '}
              ekranından durumunu görebilirsiniz.
            </div>
          )}

          {blockedAndCheap.length > 0 && (
            <div className="rounded border border-(--color-danger-border) bg-(--color-danger-bg) p-3 text-sm">
              <strong>
                {formatNumber(blockedAndCheap.length)} yasaklı satıcı piyasanın belirgin altında satıyor.
              </strong>{' '}
              {blockedAndCheap
                .slice(0, 5)
                .map((s) => `${s.sellerName || s.sellerRef} (${formatPercent(s.avgDeviationPct!)})`)
                .join(' · ')}
              {blockedAndCheap.length > 5 && ' …'}
              {/* İki sütunu gözle çaprazlamak 80 satırda kaçırılır; ekran eşleşmeyi kendisi
                  söylüyor. Yeni bir olgu değil, aranan olgu. */}
            </div>
          )}

          {/*
            Markanın buybox'ı ne kadar tek elde toplanmış — bir marka sorumlusunun ilk sorduğu
            sayı. Payın neyin payı olduğu ve kimliksiz dilim burada açıkça yazılıyor: yoksa
            sütunlar %100'e tamamlanmıyor ve sayfada bunun bir açıklaması olmuyor.
          */}
          {report.buybox && report.buybox.totalLooks > 0 && (
            <div className="rounded border border-(--color-border) p-3 text-sm">
              Bu dönemde markanın <strong>{formatNumber(report.buybox.totalLooks)}</strong> kayıtlı buybox anı
              var
              {topShare && (
                <>
                  {' '}
                  ve bunun <strong>{formatPercent(topShare.buyboxSharePct)}</strong> kadarı tek bir satıcıda:{' '}
                  <strong>{topShare.sellerName || topShare.sellerRef}</strong>
                </>
              )}
              .
              {report.buybox.unidentifiedLooks > 0 && (
                <>
                  {' '}
                  {formatNumber(report.buybox.unidentifiedLooks)} anın buybox sahibi
                  <em> kimliksizdi</em> ve hiçbir satırın payına yazılmadı.
                </>
              )}
              <div className="mt-1 text-xs text-(--color-muted)">
                Pay, <em>kayıtlı bakışlar</em> üzerindendir — süre değil. Teklif seti değişmedikçe yeni bakış
                saklanmadığı için, fiyatı sık oynayan ürünler bu sayıda daha ağır basar. Süreye göre ağırlıklı
                pay tek ürün ekranında hesaplanır.
              </div>
            </div>
          )}

          {belowMarket.length > 0 && (
            <div className="rounded border border-(--color-warning-border) bg-(--color-warning-bg) p-3 text-sm">
              <strong>{formatNumber(belowMarket.length)}</strong> satıcı bulunduğu listelemelerde ortalama
              olarak piyasanın %{Math.abs(DEVIATION_ALERT_PCT)} veya daha altında fiyat veriyor:{' '}
              {belowMarket
                .slice(0, 5)
                .map((s) => `${s.sellerName || s.sellerRef} (${formatPercent(s.avgDeviationPct!)})`)
                .join(' · ')}
              {belowMarket.length > 5 && ' …'}
              {/* Bir tespit değil, bakılacak yer. Bir satıcının piyasanın altında olması tek
                  başına bir ihlal değildir; yetkili olup olmadığı bilgisi Faz 5'te gelir. */}
              <div className="mt-1 text-xs text-(--color-muted)">
                Bu tek başına bir ihlal değildir — yalnızca bakılacak yeri gösterir.
              </div>
            </div>
          )}

          {report.unidentifiedCount > 0 && (
            <div className="rounded border border-(--color-warning-border) bg-(--color-warning-bg) p-3 text-sm">
              Bu dönemde <strong>{formatNumber(report.unidentifiedCount)}</strong> teklif, pazaryeri satıcı
              kimliği vermediği için aşağıdaki listede yer almıyor. Bu teklifler isme göre eşleştirilmez —
              aynı isim aynı firma anlamına gelmediği için yanlış satıcıya atfetmektense hiç atfetmemek tercih
              edilir.
            </div>
          )}

          {identitySeller && (
            <SellerIdentityPanel
              key={`${identitySeller.marketplaceCode}::${identitySeller.sellerRef}`}
              marketplaceCode={identitySeller.marketplaceCode}
              sellerRef={identitySeller.sellerRef}
              sellerName={identitySeller.sellerName}
              onClose={() => setIdentitySeller(null)}
            />
          )}

          <div className="flex items-center justify-end gap-2">
            <ColumnMenu defs={COLUMN_DEFS} prefs={columns} />
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  'marka-saticilari.csv',
                  report.sellers.map((s) => ({
                    Satıcı: s.sellerName,
                    'Satıcı Kodu': s.sellerRef,
                    Pazaryeri: s.marketplaceCode,
                    Grup: s.groupName ?? '',
                    Ürün: s.productCount,
                    Teklif: s.observationCount,
                    Buybox: s.buyboxCount,
                    'Buybox %': (s.buyboxRate * 100).toFixed(1),
                    'Buybox Payı %': s.buyboxSharePct.toFixed(1),
                    'En Ucuz': s.cheapestCount,
                    'En Ucuz %': (s.cheapestRate * 100).toFixed(1),
                    'Piyasa Sapması %': s.avgDeviationPct?.toFixed(2) ?? '',
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
                  {visibleColumns.map((id) => (
                    <ResizableTh key={id} id={id} prefs={columns}>
                      {COLUMN_DEFS.find((c) => c.id === id)!.label}
                    </ResizableTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((s) => (
                  <tr
                    key={`${s.marketplaceCode}::${s.sellerRef}`}
                    className="border-t border-(--color-border)"
                  >
                    {visibleColumns.map((id) => (
                      <td key={id} className="px-2 py-1">
                        {renderSellerCell(
                          id,
                          s,
                          setIdentitySeller,
                          sinceMs,
                          scope.startsWith('brand:') ? scope.slice('brand:'.length) : null,
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>

          <Pagination state={paged} label="satıcı" />

          <p className="text-xs text-(--color-muted)">
            &ldquo;İlk görülme&rdquo; bir <em>gözlem</em> tarihidir, satışa başlama tarihi değil: satıcı ondan
            önce de orada olabilir, taramalar arasındaki boşlukta fark edilmemiş olabilir. Bu yüzden ≥ ile
            gösterilir. &ldquo;Piyasa sapması&rdquo; satıcının bulunduğu her listelemedeki <em>ortalama</em>{' '}
            fiyata göre farkıdır; medyana göre değil — nedeni <code>brand-reports.ts</code> içinde yazılı.
          </p>
        </>
      )}
    </div>
  );
}
