'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  type ColumnDef,
  ColumnMenu,
  DEFAULT_PAGE_SIZE,
  Pagination,
  resizableTableStyle,
  ResizableTh,
  STICKY_HEAD,
  TableFrame,
  useColumnPrefs,
} from '@/components/table';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';

interface Row {
  id: string;
  marketplaceCode: string;
  marketplaceListingId: string;
  sellerStockCode: string;
  baseStockCode: string | null;
  productName: string;
  price: string;
  offeredStock: number;
  commissionRate: number | null;
  vatRate: number | null;
  isSalable: boolean;
  isLocked: boolean;
  isSuspended: boolean;
  isBlacklisted: boolean;
  repriceEnabled: boolean;
  observationEnabled: boolean;
  minPrice: string | null;
  maxPrice: string | null;
  allowIncrease: boolean;
  allowDecrease: boolean;
  phase: string | null;
  optimumPrice: string | null;
  lastSeenAt: number;
  floorPrice: string | null;
  buyboxPrice: string | null;
  secondPrice: string | null;
  thirdPrice: string | null;
  rank: number | null;
  /** Reporting only (competitor_observations, not the pricing-path buybox_observations). */
  buyboxSellerName: string | null;
}

/** `/api/brands` row — the brand filter's option list. */
interface Brand {
  id: string;
  marketplaceCode: string;
  name: string;
  listingCount: number;
}

const PHASES = ['SEEKING', 'CLIMBING', 'REFINING', 'OPTIMUM', 'BLOCKED'] as const;

/** Mirrors `CSV_EXPORT_LIMIT` in `api/listings/route.ts` — shown in the export button's title. */
const CSV_EXPORT_ROW_CAP = 5000;

/** The select-all checkbox column: not operator-resizable, but `table-layout: fixed` still needs
 * its width counted in the table's total (see `resizableTableStyle`). */
const SELECT_COLUMN_PX = 36;

type ColumnId =
  | 'marketplace'
  | 'productName'
  | 'stockCode'
  | 'floorPrice'
  | 'price'
  | 'rank'
  | 'buyboxPrice'
  | 'buyboxSeller'
  | 'phase'
  | 'offeredStock'
  | 'minMax'
  | 'autoBB'
  | 'observation';

/** Server-sortable columns — the `sort` values `/api/listings` accepts (doc 06 §4.1). Every
 * other column is display-only; expanding this list means expanding the API's `sort` union. */
const SORTABLE: Partial<Record<ColumnId, 'lastSeenAt' | 'productName' | 'price'>> = {
  productName: 'productName',
  price: 'price',
};

/** The reference column-customisation setup (doc 06 §4.1) — see `useColumnPrefs`'s doc comment
 * for why this is the pattern other grids should copy rather than reinvent. */
const COLUMN_DEFS: ColumnDef<ColumnId>[] = [
  { id: 'marketplace', label: 'Pazaryeri', defaultWidth: 90 },
  { id: 'productName', label: 'Ürün Adı', defaultWidth: 260 },
  { id: 'stockCode', label: 'Stok Kodu', defaultWidth: 100 },
  { id: 'floorPrice', label: 'Dip Fiyat', defaultWidth: 90 },
  { id: 'price', label: 'Satış Fiyatı', defaultWidth: 140 },
  { id: 'rank', label: 'Sıra', defaultWidth: 60 },
  { id: 'buyboxPrice', label: 'Buybox Fiyatı', defaultWidth: 100 },
  { id: 'buyboxSeller', label: 'Buybox Mağaza', defaultWidth: 140 },
  { id: 'phase', label: 'Faz', defaultWidth: 90 },
  { id: 'offeredStock', label: 'Satış Stok', defaultWidth: 80 },
  { id: 'minMax', label: 'Min/Max', defaultWidth: 130 },
  { id: 'autoBB', label: 'Oto BB', defaultWidth: 60 },
  { id: 'observation', label: 'Gözlem', defaultWidth: 60 },
];

interface Filters {
  marketplaceCode: string;
  phases: string[];
  text: string;
  isSalable?: boolean;
  isLocked?: boolean;
  repriceEnabled?: boolean;
  observationEnabled?: boolean;
}

/** Row highlighting (doc 06 §4.2). */
function rowClass(row: Row): string {
  if (row.floorPrice && BigInt(row.price) < BigInt(row.floorPrice)) return 'row-danger'; // selling at a loss
  if (row.isLocked || row.isSuspended) return 'row-muted';
  if (row.phase === 'BLOCKED') return 'row-warning';
  if (
    row.buyboxPrice &&
    row.floorPrice &&
    BigInt(row.floorPrice) < BigInt(row.buyboxPrice) &&
    row.rank !== 1
  ) {
    return 'row-success'; // canWinBuybox: floor below buybox price and we're not in it
  }
  return '';
}

function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-xs">
      {label}
      <select
        value={value === undefined ? 'any' : String(value)}
        onChange={(e) => onChange(e.target.value === 'any' ? undefined : e.target.value === 'true')}
        className="rounded border border-(--color-border) px-1 py-0.5"
      >
        <option value="any">herhangi</option>
        <option value="true">evet</option>
        <option value="false">hayır</option>
      </select>
    </label>
  );
}

function ManualPriceCell({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/listings/${row.id}/manual-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPrice: value }),
      });
      if (res.ok) {
        setEditing(false);
        setConfirming(false);
        onChanged();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Gönderilemedi.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="hover:underline"
        onClick={() => {
          setEditing(true);
          setValue('');
        }}
      >
        {formatMoney(BigInt(row.price))}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Yeni fiyat"
          className="w-20 rounded border border-(--color-border) px-1 py-0.5 text-xs"
        />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!value}
          className="text-xs text-(--color-accent)"
        >
          Gönder
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-(--color-muted)">
          İptal
        </button>
      </div>
      {confirming && (
        <div className="rounded border border-(--color-warning) bg-(--color-warning-bg) p-2 text-xs">
          <p>
            {formatMoney(BigInt(row.price))} → ₺{value} olarak gönderilsin mi? Bu, bu ilan için otomasyonu
            geçici olarak duraklatır.
          </p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded bg-(--color-accent) px-2 py-0.5 text-(--color-accent-ink)"
            >
              Onayla
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded border px-2 py-0.5">
              Vazgeç
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-(--color-danger)">{error}</p>}
    </div>
  );
}

function MinMaxCell({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const [min, setMin] = useState(row.minPrice ? (Number(row.minPrice) / 100).toFixed(2) : '');
  const [max, setMax] = useState(row.maxPrice ? (Number(row.maxPrice) / 100).toFixed(2) : '');

  async function save() {
    await fetch('/api/listings/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'setMinMax',
        ids: [row.id],
        minPrice: min || null,
        maxPrice: max || null,
      }),
    });
    onChanged();
  }

  return (
    <div className="flex items-center gap-1">
      <input
        value={min}
        onChange={(e) => setMin(e.target.value)}
        onBlur={() => void save()}
        placeholder="min"
        className="w-14 rounded border border-(--color-border) px-1 py-0.5 text-xs"
      />
      <input
        value={max}
        onChange={(e) => setMax(e.target.value)}
        onBlur={() => void save()}
        placeholder="max"
        className="w-14 rounded border border-(--color-border) px-1 py-0.5 text-xs"
      />
    </div>
  );
}

/** One cell per column id — kept in one place so `COLUMN_DEFS` stays the single source of
 * truth for both the header row and the body row rather than two parallel lists drifting apart. */
function renderCell(id: ColumnId, row: Row, onChanged: () => void): React.ReactNode {
  switch (id) {
    case 'marketplace':
      return row.marketplaceCode;
    case 'productName':
      return (
        <Link href={`/listings/${row.id}`} className="text-(--color-accent) hover:underline">
          {row.productName}
        </Link>
      );
    case 'stockCode':
      return row.baseStockCode ?? '—';
    case 'floorPrice':
      return row.floorPrice ? formatMoney(BigInt(row.floorPrice)) : '—';
    case 'price':
      return <ManualPriceCell row={row} onChanged={onChanged} />;
    case 'rank':
      return row.rank ?? '—';
    case 'buyboxPrice':
      return row.buyboxPrice ? formatMoney(BigInt(row.buyboxPrice)) : '—';
    case 'buyboxSeller':
      return row.buyboxSellerName ?? '—';
    case 'phase':
      return row.phase ?? '—';
    case 'offeredStock':
      return formatNumber(row.offeredStock);
    case 'minMax':
      return <MinMaxCell row={row} onChanged={onChanged} />;
    case 'autoBB':
      return (
        <input
          type="checkbox"
          checked={row.repriceEnabled}
          onChange={(e) => {
            void fetch('/api/listings/bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: e.target.checked ? 'enableAutomation' : 'disableAutomation',
                ids: [row.id],
              }),
            }).then(onChanged);
          }}
        />
      );
    case 'observation':
      return (
        <input
          type="checkbox"
          checked={row.observationEnabled}
          onChange={(e) => {
            void fetch('/api/listings/bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: e.target.checked ? 'enableObservation' : 'disableObservation',
                ids: [row.id],
              }),
            }).then(onChanged);
          }}
        />
      );
  }
}

export function ListingsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filters, setFilters] = useState<Filters>({ marketplaceCode: '', phases: [], text: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ key: ColumnId; dir: 'asc' | 'desc' } | null>(null);
  const columns = useColumnPrefs('listings-columns-v1', COLUMN_DEFS);

  // The brand filter is one piece of state with two ways in: the dropdown in the filter bar
  // below, and cross-navigation from /brands (doc 06 §12.1, §4.5's stock-code pattern applied
  // to brand), which arrives as `?brandId=` and seeds the dropdown's initial value. Keeping
  // them on the same state is what stops an arrived-by-link filter and the visible control
  // from disagreeing about what the grid is showing.
  const searchParams = useSearchParams();
  const [brandFilter, setBrandFilter] = useState<{ id: string; name: string } | null>(() => {
    const id = searchParams.get('brandId');
    const name = searchParams.get('brandName');
    return id ? { id, name: name ?? id } : null;
  });
  const [brands, setBrands] = useState<Brand[]>([]);

  // Fetched once, not per filter change: /api/brands is the whole (unpaged) brand list, which
  // its own route comment records as tens to low hundreds of rows even at catalogue scale.
  useEffect(() => {
    fetch('/api/brands')
      .then((r) => r.json())
      .then((d: { brands: Brand[] }) => setBrands(d.brands))
      .catch(() => setBrands([]));
  }, []);

  // Brands are per-marketplace rows, so the options narrow with the marketplace filter. Today
  // only Trendyol carries them — Hepsiburada's listing service returns no brand (doc 06 §12.1).
  // Re-sorted by name: /api/brands orders by listing count, which is what the /brands table
  // wants and the opposite of what a long dropdown wants — `tr` collation so İ/ı/Ş/Ğ/Ö/Ç land
  // where a Turkish operator looks for them.
  const brandOptions = (
    filters.marketplaceCode ? brands.filter((b) => b.marketplaceCode === filters.marketplaceCode) : brands
  )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  /** Shared with the CSV export link below, so a filtered export matches the filtered grid. */
  function filterParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.marketplaceCode) params.set('marketplaceCode', filters.marketplaceCode);
    if (filters.phases.length > 0) params.set('phases', filters.phases.join(','));
    if (filters.text) params.set('text', filters.text);
    if (filters.isSalable !== undefined) params.set('isSalable', String(filters.isSalable));
    if (filters.isLocked !== undefined) params.set('isLocked', String(filters.isLocked));
    if (filters.repriceEnabled !== undefined) params.set('repriceEnabled', String(filters.repriceEnabled));
    if (filters.observationEnabled !== undefined) {
      params.set('observationEnabled', String(filters.observationEnabled));
    }
    if (brandFilter) params.set('brandId', brandFilter.id);
    if (sort) {
      params.set('sort', SORTABLE[sort.key]!);
      params.set('sortDir', sort.dir);
    }
    return params;
  }

  function load() {
    setLoading(true);
    const params = filterParams();
    params.set('limit', String(pageSize));
    params.set('offset', String(page * pageSize));
    fetch(`/api/listings?${params.toString()}`)
      .then((r) => r.json())
      .then((d: { rows: Row[]; total: number }) => {
        setRows(d.rows);
        setTotal(d.total);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [filters, page, pageSize, sort, brandFilter]);

  /** Header click for the columns `SORTABLE` covers: none → asc → desc → none. */
  function toggleSort(columnId: ColumnId) {
    if (!SORTABLE[columnId]) return;
    setPage(0);
    setSort((prev) => {
      if (prev?.key !== columnId) return { key: columnId, dir: 'asc' };
      if (prev.dir === 'asc') return { key: columnId, dir: 'desc' };
      return null;
    });
  }

  function togglePhase(phase: string) {
    setPage(0);
    setFilters((f) => ({
      ...f,
      phases: f.phases.includes(phase) ? f.phases.filter((p) => p !== phase) : [...f.phases, phase],
    }));
  }

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkAction(
    action:
      | 'enableAutomation'
      | 'disableAutomation'
      | 'enableObservation'
      | 'disableObservation'
      | 'forceReoptimize',
  ) {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} ilan için bu işlem uygulanacak. Onaylıyor musunuz?`)) return;
    await fetch('/api/listings/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids: [...selected] }),
    });
    setSelected(new Set());
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">İlanlar</h1>
        <div className="flex items-center gap-2">
          <ColumnMenu defs={COLUMN_DEFS} prefs={columns} />
          <a
            href={`/api/listings?${(() => {
              const p = filterParams();
              p.set('format', 'csv');
              return p.toString();
            })()}`}
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
            title={`Geçerli filtreyle eşleşen ilk ${CSV_EXPORT_ROW_CAP.toLocaleString('tr-TR')} ilanı indirir`}
          >
            Excel&apos;e Aktar
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded border border-(--color-border) p-3">
        <label className="flex flex-col text-xs">
          Pazaryeri
          <select
            value={filters.marketplaceCode}
            onChange={(e) => {
              const code = e.target.value;
              setPage(0);
              setFilters((f) => ({ ...f, marketplaceCode: code }));
              // A brand belongs to one marketplace; keeping it selected under another would
              // filter the grid to nothing with no visible reason why.
              setBrandFilter((b) =>
                b && code && !brands.some((x) => x.id === b.id && x.marketplaceCode === code) ? null : b,
              );
            }}
            className="rounded border border-(--color-border) px-2 py-1 text-sm"
          >
            <option value="">Tümü</option>
            <option value="trendyol">Trendyol</option>
            <option value="hepsiburada">Hepsiburada</option>
          </select>
        </label>
        <label className="flex flex-col text-xs">
          Marka
          <select
            value={brandFilter?.id ?? ''}
            onChange={(e) => {
              const id = e.target.value;
              setPage(0);
              const picked = brands.find((b) => b.id === id);
              setBrandFilter(id ? { id, name: picked?.name ?? id } : null);
            }}
            className="w-48 rounded border border-(--color-border) px-2 py-1 text-sm"
          >
            <option value="">Tümü</option>
            {/* A brand arriving by link is listed even if the fetch has not landed yet, so the
                control never shows "Tümü" while the grid is in fact filtered. */}
            {brandFilter && !brandOptions.some((b) => b.id === brandFilter.id) && (
              <option value={brandFilter.id}>{brandFilter.name}</option>
            )}
            {brandOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.listingCount})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          Ara (ürün adı / stok kodu / SKU)
          <input
            value={filters.text}
            onChange={(e) => {
              setPage(0);
              setFilters((f) => ({ ...f, text: e.target.value }));
            }}
            className="w-56 rounded border border-(--color-border) px-2 py-1 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {PHASES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePhase(p)}
              className={`rounded px-2 py-1 text-xs ${
                filters.phases.includes(p)
                  ? 'bg-(--color-accent) text-(--color-accent-ink)'
                  : 'border border-(--color-border)'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <TriState
          label="Satılabilir"
          value={filters.isSalable}
          onChange={(v) => {
            setPage(0);
            setFilters((f) => ({ ...f, isSalable: v }));
          }}
        />
        <TriState
          label="Kilitli"
          value={filters.isLocked}
          onChange={(v) => {
            setPage(0);
            setFilters((f) => ({ ...f, isLocked: v }));
          }}
        />
        <TriState
          label="Otomasyon"
          value={filters.repriceEnabled}
          onChange={(v) => {
            setPage(0);
            setFilters((f) => ({ ...f, repriceEnabled: v }));
          }}
        />
        <TriState
          label="Gözlem"
          value={filters.observationEnabled}
          onChange={(v) => {
            setPage(0);
            setFilters((f) => ({ ...f, observationEnabled: v }));
          }}
        />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded border border-(--color-accent) bg-(--color-accent-bg) px-3 py-2 text-sm">
          <span>{selected.size} ilan seçildi</span>
          <button
            type="button"
            onClick={() => void bulkAction('enableAutomation')}
            className="rounded border px-2 py-1"
          >
            Otomasyonu Aç
          </button>
          <button
            type="button"
            onClick={() => void bulkAction('disableAutomation')}
            className="rounded border px-2 py-1"
          >
            Otomasyonu Kapat / Hariç Tut
          </button>
          <button
            type="button"
            onClick={() => void bulkAction('enableObservation')}
            className="rounded border px-2 py-1"
          >
            Gözlemi Aç
          </button>
          <button
            type="button"
            onClick={() => void bulkAction('disableObservation')}
            className="rounded border px-2 py-1"
          >
            Gözlemi Kapat
          </button>
          <button
            type="button"
            onClick={() => void bulkAction('forceReoptimize')}
            className="rounded border px-2 py-1"
          >
            Yeniden Optimize Et
          </button>
        </div>
      )}

      <TableFrame>
        <table className="text-xs" style={resizableTableStyle(COLUMN_DEFS, columns, SELECT_COLUMN_PX)}>
          <thead className={`${STICKY_HEAD} bg-(--color-hover) text-left uppercase text-(--color-muted)`}>
            <tr>
              <th className="px-2 py-2" style={{ width: SELECT_COLUMN_PX }}>
                <input
                  type="checkbox"
                  checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              {COLUMN_DEFS.filter((d) => columns.isVisible(d.id)).map((d) => (
                <ResizableTh key={d.id} id={d.id} prefs={columns} className="px-2 py-2">
                  {SORTABLE[d.id] ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(d.id)}
                      className="flex items-center gap-1 hover:text-(--color-text)"
                    >
                      {d.label}
                      {sort?.key === d.id && <span>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                    </button>
                  ) : (
                    d.label
                  )}
                </ResizableTh>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {rows.map((row) => (
              <tr key={row.id} className={rowClass(row)} style={{ contentVisibility: 'auto' }}>
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleSelected(row.id)}
                  />
                </td>
                {COLUMN_DEFS.filter((d) => columns.isVisible(d.id)).map((d) => (
                  <td
                    key={d.id}
                    className={`px-2 py-1 ${d.id === 'rank' && row.rank === 1 ? 'row-success' : ''}`}
                  >
                    {renderCell(d.id, row, load)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={1 + COLUMN_DEFS.filter((d) => columns.isVisible(d.id)).length}
                  className="px-2 py-6 text-center text-(--color-muted)"
                >
                  Filtreyle eşleşen ilan yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableFrame>

      <Pagination state={{ page, pageSize, total, setPage, setPageSize }} label="ilan">
        {rows.length > 0 && <> — son görülme: {formatDateTime(rows[0]?.lastSeenAt)}</>}
      </Pagination>
    </div>
  );
}
