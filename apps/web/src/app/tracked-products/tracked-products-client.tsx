'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ColumnMenu,
  DEFAULT_PAGE_SIZE,
  Pagination,
  ResizableTh,
  STICKY_HEAD,
  TableFrame,
  resizableTableStyle,
  useColumnPrefs,
  useFilterPresets,
  type ColumnDef,
} from '@/components/table';
import { formatDateTime, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { marketSnapshot } from '@/lib/market-stats';
import { marketplaceProductUrl } from '@/lib/product-url';
import { discoveryLabel, isBrandNameOnly } from '@/lib/tracked-product-discovery';

interface Observation {
  status: 'ok' | 'parseFailed' | 'fetchFailed';
  rank: number | null;
  sellerName: string | null;
  price: string | null;
  finalPrice: string | null;
  observedAt: number;
}

interface TrackedProduct {
  id: string;
  marketplaceCode: string;
  productRef: string;
  productUrl: string;
  label: string;
  isActive: boolean;
  addedAt: number;
  watchedBrandId: string | null;
  brandName: string | null;
  categoryRef: string | null;
  categoryName: string | null;
  ratingCount: number | null;
  ratingAverage: number | null;
  lastSweptAt: number | null;
  /** When the scrape last looked — not when it last stored a look; see the route's comment. */
  lastScrapedAt: number | null;
  viaBrandRef: boolean;
  viaSearchTerm: boolean;
  latest: Observation[];
  period: PeriodStats | null;
}

/** The window's price band, aggregated server-side over every look in it. */
interface PeriodStats {
  minPrice: string | null;
  maxPrice: string | null;
  sellerCount: number;
  changeCount: number;
}

interface WatchedBrandOption {
  id: string;
  label: string;
}

interface CategoryOption {
  ref: string;
  name: string;
  productCount: number;
}

type Sort = 'label' | 'ratingCount' | 'categoryName' | 'lastSweptAt' | 'addedAt';

/** Everything the filter bar holds — the unit a saved preset stores and restores. */
interface Filters {
  text: string;
  brandId: string;
  categoryRef: string;
  active: string;
  searchTermOnly: boolean;
  unratedOnly: boolean;
  minRatingCount: string;
}

const EMPTY_FILTERS: Filters = {
  text: '',
  brandId: '',
  categoryRef: '',
  active: '',
  searchTermOnly: false,
  unratedOnly: false,
  minRatingCount: '',
};

/** Mirrors `CSV_EXPORT_LIMIT` in `api/tracked-products/route.ts` — shown in the button's title. */
const CSV_EXPORT_ROW_CAP = 5000;

type ColumnId =
  | 'label'
  | 'brand'
  | 'category'
  | 'marketplace'
  | 'productRef'
  | 'rating'
  | 'sellerCount'
  | 'medianPrice'
  | 'spreadPct'
  | 'buyboxPrice'
  | 'buyboxSeller'
  | 'periodMinPrice'
  | 'periodMaxPrice'
  | 'periodSellerCount'
  | 'discovery'
  | 'lastSwept'
  | 'lastScraped'
  | 'addedAt';

/**
 * Columns most operators need are visible; the identifiers and provenance ones are one click
 * away. `hiddenByDefault` is not "less important" — `discovery` is the brand-misuse signal — it
 * is "already shown another way": a search-term-only row carries a badge in the Ürün column, so
 * the column is redundant until someone wants to sort or export by it.
 *
 * Two families of price column sit here and they answer different questions. **Satıcı, Medyan,
 * Makas, Buybox** describe the latest look — the market right now. **Dönem …** describe the
 * whole window, so they are the ones that catch a seller who dropped under the market for two
 * days and came back up. Only the period family survives an export (see
 * `tracked-product-columns.ts` for why), which is also why Makas is the visible one of the
 * current family: it is the figure worth scanning a page for.
 */
const COLUMN_DEFS: readonly ColumnDef<ColumnId>[] = [
  { id: 'label', label: 'Ürün', defaultWidth: 320 },
  { id: 'brand', label: 'Marka', defaultWidth: 120, hiddenByDefault: true },
  { id: 'category', label: 'Kategori', defaultWidth: 180 },
  { id: 'marketplace', label: 'Pazaryeri', defaultWidth: 110, hiddenByDefault: true },
  { id: 'productRef', label: 'Ürün Kodu', defaultWidth: 120, hiddenByDefault: true },
  { id: 'rating', label: 'Değerlendirme', defaultWidth: 130 },
  { id: 'sellerCount', label: 'Satıcı', defaultWidth: 80 },
  { id: 'medianPrice', label: 'Medyan', defaultWidth: 110, hiddenByDefault: true },
  { id: 'spreadPct', label: 'Makas', defaultWidth: 90 },
  { id: 'buyboxPrice', label: 'Buybox Fiyat', defaultWidth: 120 },
  { id: 'buyboxSeller', label: 'Buybox Satıcı', defaultWidth: 160 },
  { id: 'periodMinPrice', label: 'Dönem En Düşük', defaultWidth: 130, hiddenByDefault: true },
  { id: 'periodMaxPrice', label: 'Dönem En Yüksek', defaultWidth: 130, hiddenByDefault: true },
  { id: 'periodSellerCount', label: 'Dönem Satıcı', defaultWidth: 110, hiddenByDefault: true },
  { id: 'discovery', label: 'Bulunma', defaultWidth: 130, hiddenByDefault: true },
  { id: 'lastSwept', label: 'Son Tarama', defaultWidth: 150 },
  { id: 'lastScraped', label: 'Son Bakış', defaultWidth: 150, hiddenByDefault: true },
  { id: 'addedAt', label: 'Eklenme', defaultWidth: 150, hiddenByDefault: true },
];

/** Which sort a column drives, or `undefined` for a column the server cannot order by. */
const SORT_FOR_COLUMN: Partial<Record<ColumnId, Sort>> = {
  label: 'label',
  category: 'categoryName',
  rating: 'ratingCount',
  lastSwept: 'lastSweptAt',
  addedAt: 'addedAt',
};

/** Kuruş string → the grid's money cell, empty-dashed when there is nothing to show. */
function moneyCell(value: string | null | undefined) {
  return <span className="tabular-nums">{value ? formatMoney(BigInt(value)) : '—'}</span>;
}

/**
 * Takip edilen ürünler — hem link ile eklenen tekil ürünler hem marka taramasının bulduğu
 * ürünler (doc 06 §12.2, api-references §1.7).
 *
 * Sunucu tarafında sayfalanır, filtrelenir ve sıralanır. Bir marka taraması bu tabloya binlerce
 * satır koyar (Whiskas 887, Royal Canin 4.863) — hepsini tarayıcıya indirmek ilk sürümün
 * yapabildiği ama bu ölçekte yapılamayacak bir şey.
 *
 * Reprice/ObserveBuybox bu ekranın verisini hiç görmez — ayrı bir tablo (`tracked_products`),
 * listings değil.
 */
export function TrackedProductsClient() {
  const [products, setProducts] = useState<TrackedProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [brands, setBrands] = useState<WatchedBrandOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  const [filters, setFiltersState] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<Sort>('label');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [link, setLink] = useState('');
  const [label, setLabel] = useState('');
  const [presetName, setPresetName] = useState('');

  const columns = useColumnPrefs<ColumnId>('trackedProducts.columns', COLUMN_DEFS);
  const presets = useFilterPresets<Filters>('trackedProducts.filterPresets');

  /** Any filter change goes back to page 1 — page 7 of the previous result set means nothing. */
  function setFilters(next: Filters) {
    setPage(0);
    setFiltersState(next);
  }

  /** Shared by the fetch and the CSV link, so a filtered export matches the filtered grid. */
  const filterParams = useCallback(() => {
    const p = new URLSearchParams({ sort, sortDir });
    if (filters.text.trim()) p.set('text', filters.text.trim());
    if (filters.brandId) p.set('watchedBrandId', filters.brandId);
    if (filters.categoryRef) p.set('categoryRef', filters.categoryRef);
    if (filters.active) p.set('isActive', filters.active);
    if (filters.searchTermOnly) p.set('searchTermOnly', 'true');
    if (filters.unratedOnly) p.set('unratedOnly', 'true');
    if (filters.minRatingCount.trim()) p.set('minRatingCount', filters.minRatingCount.trim());
    return p;
  }, [filters, sort, sortDir]);

  const load = useCallback(() => {
    setLoading(true);
    const p = filterParams();
    p.set('limit', String(pageSize));
    p.set('offset', String(page * pageSize));
    fetch(`/api/tracked-products?${p.toString()}`)
      .then((r) => r.json())
      .then((d: { products: TrackedProduct[]; total: number }) => {
        setProducts(d.products);
        setTotal(d.total);
      })
      .finally(() => setLoading(false));
  }, [filterParams, page, pageSize]);

  useEffect(load, [load]);

  useEffect(() => {
    fetch('/api/watched-brands')
      .then((r) => r.json())
      .then((d: { groups: { brands: WatchedBrandOption[] }[] }) =>
        setBrands(d.groups.flatMap((g) => g.brands)),
      );
  }, []);

  useEffect(() => {
    const q = filters.brandId ? `?watchedBrandId=${encodeURIComponent(filters.brandId)}` : '';
    fetch(`/api/tracked-products/categories${q}`)
      .then((r) => r.json())
      .then((d: { categories: CategoryOption[] }) => setCategories(d.categories));
  }, [filters.brandId]);

  function onSort(column: ColumnId) {
    const next = SORT_FOR_COLUMN[column];
    if (!next) return;
    setPage(0);
    if (next === sort) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(next);
      setSortDir('asc');
    }
  }

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tracked-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link, label }),
      });
      if (res.ok) {
        setLink('');
        setLabel('');
        load();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Eklenemedi.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Bu ürünü takipten çıkar?')) return;
    await fetch(`/api/tracked-products?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  }

  async function setActive(id: string, isActive: boolean) {
    await fetch('/api/tracked-products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], isActive }),
    });
    load();
  }

  const visibleColumns = useMemo(
    () => columns.order.filter((id) => columns.isVisible(id)),
    [columns],
  );

  function renderCell(id: ColumnId, p: TrackedProduct) {
    // One reduction of the latest look, shared by every current-market cell — so Satıcı, Medyan,
    // Makas and Buybox cannot disagree with each other about the same row.
    const market = marketSnapshot(p.latest);
    switch (id) {
      case 'label':
        return (
          <>
            <Link href={`/tracked-products/${p.id}`} className="text-(--color-accent) hover:underline">
              {p.label}
            </Link>
            {(() => {
              const pageUrl = marketplaceProductUrl(p.marketplaceCode, p.productUrl);
              return pageUrl ? (
                <a
                  href={pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Pazaryerindeki ürün sayfası"
                  className="ml-1 text-(--color-muted) hover:text-(--color-accent)"
                >
                  ↗
                </a>
              ) : null;
            })()}
            {/* Marka adını taşıyor ama pazaryeri markaya atfetmiyor — denetim sinyali. */}
            {isBrandNameOnly(p) && (
              <span
                className="ml-1 rounded bg-(--color-warning-bg) px-1 text-xs text-(--color-warning)"
                title="Bu ürün marka adıyla arandığında çıkıyor ama pazaryeri onu bu markaya atfetmiyor."
              >
                sadece arama
              </span>
            )}
          </>
        );
      case 'brand':
        return p.brandName ?? '—';
      case 'category':
        return p.categoryName ?? '—';
      case 'marketplace':
        return p.marketplaceCode;
      case 'productRef':
        return <span className="font-mono text-xs">{p.productRef}</span>;
      case 'rating':
        return p.ratingCount === null ? (
          <span className="text-(--color-muted)" title="Değerlendirme okunamadı">
            —
          </span>
        ) : (
          <span className="tabular-nums">
            {formatNumber(p.ratingCount)}
            {p.ratingAverage !== null && (
              <span className="ml-1 text-xs text-(--color-muted)">({p.ratingAverage.toFixed(1)})</span>
            )}
          </span>
        );
      case 'sellerCount':
        return <span className="tabular-nums">{formatNumber(market.sellerCount)}</span>;
      case 'medianPrice':
        return moneyCell(market.medianPrice?.toString() ?? null);
      case 'spreadPct':
        // A wide spread on one product is where an audit starts: the same item, the same day,
        // and a gap between the cheapest and the dearest seller that the market does not explain.
        return market.spreadPct === null ? (
          <span className="text-(--color-muted)" title="Tek satıcı — makas yok">
            —
          </span>
        ) : (
          <span className={`tabular-nums${market.spreadPct >= 30 ? ' text-(--color-warning)' : ''}`}>
            {formatPercent(market.spreadPct)}
          </span>
        );
      case 'buyboxPrice':
        return moneyCell(market.buyboxPrice?.toString() ?? null);
      case 'buyboxSeller':
        return market.buyboxSeller ?? '—';
      case 'periodMinPrice':
        return moneyCell(p.period?.minPrice);
      case 'periodMaxPrice':
        return moneyCell(p.period?.maxPrice);
      case 'periodSellerCount':
        return (
          <span className="tabular-nums">
            {p.period ? formatNumber(p.period.sellerCount) : '—'}
          </span>
        );
      case 'discovery':
        return <span className="text-xs">{discoveryLabel(p)}</span>;
      case 'lastSwept':
        return p.lastSweptAt ? formatDateTime(p.lastSweptAt) : 'henüz taranmadı';
      case 'lastScraped':
        // "Son Tarama" is the catalogue sweep, "Son Bakış" is the per-product price scrape.
        // Two different jobs at two different cadences, so two columns rather than one.
        return p.lastScrapedAt ? formatDateTime(p.lastScrapedAt) : 'hiç bakılmadı';
      case 'addedAt':
        return formatDateTime(p.addedAt);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Takip Edilen Ürünler</h1>
        <div className="flex items-center gap-2">
          <ColumnMenu defs={COLUMN_DEFS} prefs={columns} />
          <a
            href={`/api/tracked-products?${(() => {
              const p = filterParams();
              p.set('format', 'csv');
              // What the grid is showing, in the order it is showing it — the export honours the
              // operator's column choices, not a second list living in the route.
              p.set('columns', visibleColumns.join(','));
              return p.toString();
            })()}`}
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
            title={`Geçerli filtreyle eşleşen ilk ${CSV_EXPORT_ROW_CAP.toLocaleString('tr-TR')} ürünü indirir — ekrandaki sayfayı değil`}
          >
            Excel&apos;e Aktar
          </a>
        </div>
      </div>

      <p className="max-w-3xl text-sm text-(--color-muted)">
        Satmadığımız ürünlerin fiyat, satıcı ve değerlendirme bilgisi. Buraya iki yoldan ürün gelir:
        tek tek link yapıştırarak, veya{' '}
        <Link href="/watched-brands" className="text-(--color-accent) hover:underline">
          izlenen bir markanın
        </Link>{' '}
        taramasıyla. Bu liste <strong>raporlamadır</strong> — hiçbir fiyat kararını etkilemez.
      </p>

      {/* ---- filtreler ---- */}
      <div className="space-y-2 rounded border border-(--color-border) p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs">
            Ara
            <input
              value={filters.text}
              onChange={(e) => setFilters({ ...filters, text: e.target.value })}
              placeholder="Ürün adı veya kodu"
              className="w-56 rounded border border-(--color-border) px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col text-xs">
            Marka
            <select
              value={filters.brandId}
              onChange={(e) => setFilters({ ...filters, brandId: e.target.value, categoryRef: '' })}
              className="w-40 rounded border border-(--color-border) px-2 py-1 text-sm"
            >
              <option value="">Tümü</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs">
            Kategori
            <select
              value={filters.categoryRef}
              onChange={(e) => setFilters({ ...filters, categoryRef: e.target.value })}
              className="w-52 rounded border border-(--color-border) px-2 py-1 text-sm"
            >
              <option value="">Tümü</option>
              {categories.map((c) => (
                <option key={c.ref} value={c.ref}>
                  {c.name} ({c.productCount})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs">
            Durum
            <select
              value={filters.active}
              onChange={(e) => setFilters({ ...filters, active: e.target.value })}
              className="w-32 rounded border border-(--color-border) px-2 py-1 text-sm"
            >
              <option value="">Tümü</option>
              <option value="true">Aktif</option>
              <option value="false">Duraklatıldı</option>
            </select>
          </label>
          <label className="flex flex-col text-xs">
            En az değerlendirme
            <input
              type="number"
              min={0}
              value={filters.minRatingCount}
              onChange={(e) => setFilters({ ...filters, minRatingCount: e.target.value })}
              placeholder="0"
              className="w-28 rounded border border-(--color-border) px-2 py-1 text-sm"
            />
          </label>
          <label
            className="flex items-center gap-1 text-xs"
            title="Marka adını taşıyan ama pazaryerinin markaya atfetmediği ürünler"
          >
            <input
              type="checkbox"
              checked={filters.searchTermOnly}
              onChange={(e) => setFilters({ ...filters, searchTermOnly: e.target.checked })}
            />
            Sadece aramada çıkanlar
          </label>
          <label
            className="flex items-center gap-1 text-xs"
            title="Pazaryerinin hiç değerlendirme kaydetmediği ürünler"
          >
            <input
              type="checkbox"
              checked={filters.unratedOnly}
              onChange={(e) => setFilters({ ...filters, unratedOnly: e.target.checked })}
            />
            Değerlendirmesi olmayanlar
          </label>
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
          >
            Temizle
          </button>
        </div>

        {/* ---- kayıtlı filtreler ---- */}
        <div className="flex flex-wrap items-center gap-2 border-t border-(--color-border) pt-2 text-xs">
          <span className="text-(--color-muted)">Kayıtlı filtreler:</span>
          {presets.presets.length === 0 && <span className="text-(--color-muted)">yok</span>}
          {presets.presets.map((preset) => (
            <span key={preset.name} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilters({ ...EMPTY_FILTERS, ...preset.value })}
                className="rounded border border-(--color-border) px-2 py-0.5 hover:bg-(--color-hover)"
              >
                {preset.name}
              </button>
              <button
                type="button"
                title="Bu kaydı sil"
                onClick={() => presets.remove(preset.name)}
                className="text-(--color-muted) hover:text-(--color-danger)"
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Yeni kayıt adı"
            className="ml-auto w-40 rounded border border-(--color-border) px-2 py-0.5"
          />
          <button
            type="button"
            disabled={!presetName.trim()}
            onClick={() => {
              presets.save(presetName, filters);
              setPresetName('');
            }}
            className="rounded border border-(--color-border) px-2 py-0.5 hover:bg-(--color-hover) disabled:opacity-40"
          >
            Filtreyi kaydet
          </button>
        </div>
      </div>

      {/* ---- link ile ekle ---- */}
      <div className="flex flex-wrap items-end gap-2 rounded border border-(--color-border) p-3">
        <label className="flex flex-col text-xs">
          Ürün linki
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.trendyol.com/... veya https://www.hepsiburada.com/..."
            className="w-96 rounded border border-(--color-border) px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs">
          Etiket (opsiyonel)
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Kolay tanımak için bir isim"
            className="w-48 rounded border border-(--color-border) px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy || !link.trim()}
          onClick={() => void add()}
          className="rounded bg-(--color-accent) px-3 py-1.5 text-sm text-(--color-accent-ink) disabled:opacity-40"
        >
          Ekle
        </button>
      </div>
      {error && <p className="text-sm text-(--color-danger)">{error}</p>}

      <Pagination
        state={{ page, pageSize, total, setPage, setPageSize }}
        label="ürün"
      />

      <TableFrame>
        <table className="text-sm" style={resizableTableStyle(COLUMN_DEFS, columns, 90)}>
          <thead
            className={`${STICKY_HEAD} bg-(--color-hover) text-left text-xs uppercase text-(--color-muted)`}
          >
            <tr>
              {visibleColumns.map((id) => {
                const def = COLUMN_DEFS.find((d) => d.id === id)!;
                const sortable = SORT_FOR_COLUMN[id];
                const active = sortable === sort;
                return (
                  <ResizableTh key={id} id={id} prefs={columns} className="px-2 py-2">
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort(id)}
                        className={`flex items-center gap-1 uppercase ${active ? 'text-(--color-fg)' : ''}`}
                      >
                        {def.label}
                        {active && <span aria-hidden>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </button>
                    ) : (
                      def.label
                    )}
                  </ResizableTh>
                );
              })}
              <th className="px-2 py-2" style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {products.map((p) => (
              <tr key={p.id} className={p.isActive ? undefined : 'opacity-50'}>
                {visibleColumns.map((id) => (
                  <td key={id} className="truncate px-2 py-1">
                    {renderCell(id, p)}
                  </td>
                ))}
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => void setActive(p.id, !p.isActive)}
                    title={p.isActive ? 'Taramayı bu ürün için durdur' : 'Taramayı sürdür'}
                    className="mr-2 text-xs text-(--color-muted) hover:text-(--color-accent)"
                  >
                    {p.isActive ? 'Duraklat' : 'Sürdür'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(p.id)}
                    className="text-xs text-(--color-muted) hover:text-(--color-danger)"
                  >
                    Kaldır
                  </button>
                </td>
              </tr>
            ))}
            {products.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={visibleColumns.length + 1}
                  className="px-2 py-6 text-center text-(--color-muted)"
                >
                  Bu filtrelerle ürün bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableFrame>
    </div>
  );
}
