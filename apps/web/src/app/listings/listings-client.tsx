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
  useFilterPresets,
} from '@/components/table';
import {
  Ago,
  Button,
  Chip,
  ConfirmButton,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Select,
  TextInput,
} from '@/components/ui';
import { formatMoney, formatNumber } from '@/lib/format';
import { NO_PERMISSION_TITLE, useCan } from '@/lib/permissions';
import { labelOf, PHASE_LABELS } from '@/lib/labels';

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
  isBlacklisted?: boolean;
}

const EMPTY_FILTERS: Filters = {
  marketplaceCode: '',
  phases: [],
  text: '',
  isSalable: undefined,
  isLocked: undefined,
  repriceEnabled: undefined,
  observationEnabled: undefined,
  isBlacklisted: undefined,
};

/** Row highlighting (doc 06 §4.2). Cost-unknown reuses `row-danger` — it never overlaps with the
 * selling-at-loss case above it (that needs a floor price to compare against in the first place)
 * — rather than inventing a fourth colour for "this row also has a problem". */
function rowClass(row: Row): string {
  if (row.floorPrice && BigInt(row.price) < BigInt(row.floorPrice)) return 'row-danger'; // selling at a loss
  if (row.baseStockCode && !row.floorPrice) return 'row-danger'; // cost unknown — floor could not be computed
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
  const canEdit = useCan()('prices.manage');

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

  // Read-only for a role without `prices.manage` (doc 06 §10.5): the price, not a button to a
  // form whose submit would be refused.
  if (!canEdit) return <span>{formatMoney(BigInt(row.price))}</span>;

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
          disabled={busy}
          className="w-20 rounded border border-(--color-border) px-1 py-0.5 text-xs"
        />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!value || busy}
          className="text-xs text-(--color-accent)"
        >
          Gönder
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={busy}
          className="text-xs text-(--color-muted)"
        >
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
              {busy ? 'Gönderiliyor…' : 'Onayla'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="rounded border px-2 py-0.5"
            >
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const canEdit = useCan()('prices.manage');

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      const res = await fetch('/api/listings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setMinMax',
          ids: [row.id],
          minPrice: min || null,
          maxPrice: max || null,
        }),
      });
      if (res.ok) {
        onChanged();
      } else {
        setError('Kaydedilemedi.');
      }
    } catch {
      setError('Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <input
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onBlur={() => void save()}
          placeholder="min"
          disabled={saving || !canEdit}
          {...(canEdit ? {} : { title: NO_PERMISSION_TITLE })}
          className="w-14 rounded border border-(--color-border) px-1 py-0.5 text-xs"
        />
        <input
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={() => void save()}
          placeholder="max"
          disabled={saving || !canEdit}
          {...(canEdit ? {} : { title: NO_PERMISSION_TITLE })}
          className="w-14 rounded border border-(--color-border) px-1 py-0.5 text-xs"
        />
      </div>
      {saving && <span className="text-(--color-muted)">Kaydediliyor…</span>}
      {error && <span className="text-(--color-danger)">{error}</span>}
    </div>
  );
}

/**
 * Per-row automation/observation switch. Was a bare `<input type="checkbox">` firing a request
 * and forgetting it (`.then(onChanged)`, no `.catch`) — a request that fails left the checkbox
 * showing a state the server never accepted, with nothing said about it (§3.2 "Busy": never
 * fire-and-forget). Disabled for the round trip and reports a failure inline instead.
 */
function ToggleCell({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: (next: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const canEdit = useCan()('prices.manage');

  async function handleChange(next: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      await onToggle(next);
    } catch {
      setError('Değişmedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <input
        type="checkbox"
        checked={checked}
        disabled={busy || !canEdit}
        {...(canEdit ? {} : { title: NO_PERMISSION_TITLE })}
        aria-label={label}
        onChange={(e) => void handleChange(e.target.checked)}
      />
      {error && (
        <span className="text-(--color-danger)" title={error}>
          !
        </span>
      )}
    </div>
  );
}

async function postBulk(action: string, ids: string[]): Promise<void> {
  const res = await fetch('/api/listings/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ids }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      if (row.floorPrice) return formatMoney(BigInt(row.floorPrice));
      if (row.baseStockCode) {
        // A stock code is linked but the floor still could not be computed — the operator needs
        // to know this is a data gap, not "there is simply no floor to show" (doc 06 §4.2).
        return (
          <Chip tone="danger" title="Maliyet ya da ücret ayarları eksik — dip fiyat hesaplanamadı.">
            Maliyet yok
          </Chip>
        );
      }
      return '—';
    case 'price':
      return <ManualPriceCell row={row} onChanged={onChanged} />;
    case 'rank':
      return row.rank ?? '—';
    case 'buyboxPrice':
      return row.buyboxPrice ? formatMoney(BigInt(row.buyboxPrice)) : '—';
    case 'buyboxSeller':
      return row.buyboxSellerName ?? '—';
    case 'phase':
      return labelOf(PHASE_LABELS, row.phase);
    case 'offeredStock':
      return formatNumber(row.offeredStock);
    case 'minMax':
      return <MinMaxCell row={row} onChanged={onChanged} />;
    case 'autoBB':
      return (
        <ToggleCell
          checked={row.repriceEnabled}
          label={`${row.productName} için otomasyon`}
          onToggle={(next) =>
            postBulk(next ? 'enableAutomation' : 'disableAutomation', [row.id]).then(onChanged)
          }
        />
      );
    case 'observation':
      return (
        <ToggleCell
          checked={row.observationEnabled}
          label={`${row.productName} için gözlem`}
          onToggle={(next) =>
            postBulk(next ? 'enableObservation' : 'disableObservation', [row.id]).then(onChanged)
          }
        />
      );
  }
}

export function ListingsClient() {
  const canBulk = useCan()('prices.manage');
  // Read before the state below so an arrived-by-link filter is the grid's *first* query rather
  // than a second one after an unfiltered flash. See the brand filter's comment further down for
  // why cross-navigation seeds the visible control instead of filtering behind its back.
  const searchParams = useSearchParams();
  /** `null` until the first successful load — distinct from "loaded, zero rows" (doc 15 §3.2's
   * six-state contract). An empty array here would make a failed first load indistinguishable
   * from a filter that genuinely matches nothing. */
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filters, setFiltersState] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    // `?phases=BLOCKED` — the dashboard's phase tiles (doc 06 §2) link straight to the listings
    // this count is about; without it "12 Bloke" was a number with no way to reach the twelve.
    // Filtered against the known phases so a hand-typed or stale value cannot produce a filter
    // the phase buttons below can never clear.
    phases: (searchParams.get('phases') ?? '')
      .split(',')
      .filter((p) => (PHASES as readonly string[]).includes(p)),
  }));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  /** `/api/listings` itself failing, kept apart from `bulkError` below (mirrors
   * `tracked-products-client`'s `loadError`/`error` split — doc 15 §3.2). */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: ColumnId; dir: 'asc' | 'desc' } | null>(null);
  const columns = useColumnPrefs('listings-columns-v1', COLUMN_DEFS);
  const presets = useFilterPresets<Filters>('listings-filter-presets-v1');
  const [presetName, setPresetName] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // The brand filter is one piece of state with two ways in: the dropdown in the filter bar
  // below, and cross-navigation from /brands (doc 06 §12.1, §4.5's stock-code pattern applied
  // to brand), which arrives as `?brandId=` and seeds the dropdown's initial value. Keeping
  // them on the same state is what stops an arrived-by-link filter and the visible control
  // from disagreeing about what the grid is showing. It is kept out of the saved-filter-preset
  // shape below for the same reason it is kept out of `Filters`: a preset naming a brand by id
  // would silently break the moment that brand is renamed or removed.
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

  /** Any filter change goes back to page 1 — page 7 of the previous result set means nothing. */
  function setFilters(next: Filters) {
    setPage(0);
    setFiltersState(next);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setBrandFilter(null);
  }

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
    if (filters.isBlacklisted !== undefined) params.set('isBlacklisted', String(filters.isBlacklisted));
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
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { rows: Row[]; total: number }) => {
        setRows(d.rows);
        setTotal(d.total);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
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
    setFilters({
      ...filters,
      phases: filters.phases.includes(phase)
        ? filters.phases.filter((p) => p !== phase)
        : [...filters.phases, phase],
    });
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
    setBulkBusy(true);
    setBulkError(null);
    try {
      await postBulk(action, [...selected]);
      setSelected(new Set());
      load();
    } catch {
      setBulkError('İşlem uygulanamadı. Tekrar deneyin.');
    } finally {
      setBulkBusy(false);
    }
  }

  const hasActiveFilters =
    filters.marketplaceCode !== '' ||
    filters.phases.length > 0 ||
    filters.text !== '' ||
    filters.isSalable !== undefined ||
    filters.isLocked !== undefined ||
    filters.repriceEnabled !== undefined ||
    filters.observationEnabled !== undefined ||
    filters.isBlacklisted !== undefined ||
    brandFilter !== null;

  // The primary load's own six-state handling (doc 15 §3.2): a failed first load is retryable, a
  // first load in flight says so. After this point `rows` is never `null` — every reference below
  // assumes a real array, loaded or genuinely empty.
  if (!rows && loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }
  if (!rows) {
    return <LoadingState message="İlanlar yükleniyor…" skeletonRows={4} />;
  }

  const visibleColumns = COLUMN_DEFS.filter((d) => columns.isVisible(d.id));

  return (
    <div className="space-y-4">
      <PageHeader
        title="İlanlar"
        description="Fiyatı ve otomasyonu takip ettiğiniz her ilan burada. Kırmızı satır zararına satışı ya da bilinmeyen maliyeti, sarı satır bloke bir fazı, yeşil satır alınabilecek bir buybox'ı işaret eder."
        action={
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
        }
      />

      {/* Bir yenileme (filtre/sayfa değişikliği) başarısız oldu ama önceki liste hâlâ ekranda —
          sessizce eskimesine izin vermek yerine söylüyoruz (§3.2 "Stale"). */}
      {loadError && (
        <p
          role="alert"
          className="rounded border border-(--color-warning-border) bg-(--color-warning-bg) px-3 py-2 text-sm"
        >
          Son yenileme başarısız oldu ({loadError}). Aşağıdaki liste artık güncel olmayabilir.
        </p>
      )}

      <div className="space-y-2 rounded border border-(--color-border) p-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Pazaryeri">
            <Select
              value={filters.marketplaceCode}
              onChange={(e) => {
                const code = e.target.value;
                // A brand belongs to one marketplace; keeping it selected under another would
                // filter the grid to nothing with no visible reason why.
                setBrandFilter((b) =>
                  b && code && !brands.some((x) => x.id === b.id && x.marketplaceCode === code) ? null : b,
                );
                setFilters({ ...filters, marketplaceCode: code });
              }}
              className="w-36"
              options={[
                { value: '', label: 'Tümü' },
                { value: 'trendyol', label: 'Trendyol' },
                { value: 'hepsiburada', label: 'Hepsiburada' },
              ]}
            />
          </Field>
          <Field label="Marka">
            <Select
              value={brandFilter?.id ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                setPage(0);
                const picked = brands.find((b) => b.id === id);
                setBrandFilter(id ? { id, name: picked?.name ?? id } : null);
              }}
              className="w-48"
              options={[
                { value: '', label: 'Tümü' },
                // A brand arriving by link is listed even if the fetch has not landed yet, so
                // the control never shows "Tümü" while the grid is in fact filtered.
                ...(brandFilter && !brandOptions.some((b) => b.id === brandFilter.id)
                  ? [{ value: brandFilter.id, label: brandFilter.name }]
                  : []),
                ...brandOptions.map((b) => ({ value: b.id, label: `${b.name} (${b.listingCount})` })),
              ]}
            />
          </Field>
          <Field label="Ara (ürün adı / stok kodu / SKU)">
            <TextInput
              value={filters.text}
              onChange={(e) => setFilters({ ...filters, text: e.target.value })}
              className="w-56"
            />
          </Field>
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
                {PHASE_LABELS[p] ?? p}
              </button>
            ))}
          </div>
          <TriState
            label="Satılabilir"
            value={filters.isSalable}
            onChange={(v) => setFilters({ ...filters, isSalable: v })}
          />
          <TriState
            label="Kilitli"
            value={filters.isLocked}
            onChange={(v) => setFilters({ ...filters, isLocked: v })}
          />
          <TriState
            label="Otomasyon"
            value={filters.repriceEnabled}
            onChange={(v) => setFilters({ ...filters, repriceEnabled: v })}
          />
          <TriState
            label="Gözlem"
            value={filters.observationEnabled}
            onChange={(v) => setFilters({ ...filters, observationEnabled: v })}
          />
          <TriState
            label="Kara Liste"
            value={filters.isBlacklisted}
            onChange={(v) => setFilters({ ...filters, isBlacklisted: v })}
          />
          {hasActiveFilters && (
            <Button variant="secondary" type="button" onClick={clearFilters} className="px-2! py-1! text-xs">
              Temizle
            </Button>
          )}
        </div>

        {/* ---- kayıtlı filtreler (doc 06 §4.4) ---- */}
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

      {selected.size > 0 && canBulk && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-(--color-accent) bg-(--color-accent-bg) px-3 py-2 text-sm">
          <span>{selected.size} ilan seçildi</span>
          {/* Asymmetric confirmation (§3.6): the direction that starts the bot moving prices
              (enable automation) and the one that resets a listing's pricing phase are confirmed;
              turning things off is one click, same as the dashboard's submission switch. */}
          <ConfirmButton
            requireConfirm
            confirmMessage={`${selected.size} ilan için otomasyon açılacak. Onaylıyor musunuz?`}
            onConfirmed={() => void bulkAction('enableAutomation')}
            disabled={bulkBusy}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            Otomasyonu Aç
          </ConfirmButton>
          <ConfirmButton
            requireConfirm={false}
            confirmMessage=""
            onConfirmed={() => void bulkAction('disableAutomation')}
            disabled={bulkBusy}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            Otomasyonu Kapat / Hariç Tut
          </ConfirmButton>
          <ConfirmButton
            requireConfirm={false}
            confirmMessage=""
            onConfirmed={() => void bulkAction('enableObservation')}
            disabled={bulkBusy}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            Gözlemi Aç
          </ConfirmButton>
          <ConfirmButton
            requireConfirm={false}
            confirmMessage=""
            onConfirmed={() => void bulkAction('disableObservation')}
            disabled={bulkBusy}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            Gözlemi Kapat
          </ConfirmButton>
          <ConfirmButton
            requireConfirm
            confirmMessage={`${selected.size} ilan için fiyatlama sıfırdan başlatılacak (faz: Arıyor). Onaylıyor musunuz?`}
            onConfirmed={() => void bulkAction('forceReoptimize')}
            disabled={bulkBusy}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            Yeniden Optimize Et
          </ConfirmButton>
          {bulkBusy && (
            <span aria-live="polite" className="text-(--color-muted)">
              İşleniyor…
            </span>
          )}
        </div>
      )}
      {bulkError && (
        <p role="alert" className="text-sm text-(--color-danger)">
          {bulkError}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          message={
            hasActiveFilters
              ? 'Bu filtrelerle eşleşen ilan yok.'
              : 'Henüz ilan yok. Stok içe aktarıldıktan sonra burası dolar.'
          }
          reason={hasActiveFilters ? 'Farklı bir filtre deneyin ya da filtreleri temizleyin.' : undefined}
          action={
            hasActiveFilters ? (
              <Button variant="secondary" type="button" onClick={clearFilters}>
                Filtreleri Temizle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableFrame>
          <table className="text-xs" style={resizableTableStyle(COLUMN_DEFS, columns, SELECT_COLUMN_PX)}>
            <thead className={`${STICKY_HEAD} bg-(--color-hover) text-left uppercase text-(--color-muted)`}>
              <tr>
                <th className="px-2 py-2" style={{ width: SELECT_COLUMN_PX }}>
                  <input
                    type="checkbox"
                    aria-label="Bu sayfadaki ilanları seç"
                    checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                    }
                  />
                </th>
                {visibleColumns.map((d) => (
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
                      aria-label={`${row.productName} seç`}
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelected(row.id)}
                    />
                  </td>
                  {visibleColumns.map((d) => (
                    <td
                      key={d.id}
                      className={`px-2 py-1 ${d.id === 'rank' && row.rank === 1 ? 'row-success' : ''}`}
                    >
                      {renderCell(d.id, row, load)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}

      <Pagination state={{ page, pageSize, total, setPage, setPageSize }} label="ilan">
        {rows.length > 0 && rows[0] && (
          <>
            {' '}
            — son görülme: <Ago at={rows[0].lastSeenAt} />
          </>
        )}
        {loading && <span aria-live="polite"> · yükleniyor…</span>}
      </Pagination>
    </div>
  );
}
