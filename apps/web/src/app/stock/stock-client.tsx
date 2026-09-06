'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Section,
  TextInput,
} from '@/components/ui';
import { downloadCsv } from '@/lib/csv';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * `/stock` (doc 06 §3, doc 15 §6 Phase 2.6). This screen's stated task is "Maliyetler doğru mu?"
 * — every floor price downstream (docs/02) is computed from `unitCost`, so a stock item with a
 * missing or zero cost is silently excluded from automation rather than merely wrong (see
 * `rowClass` below). Reworked around that task: a search/problem filter to find the rows that
 * need attention, and per-marketplace columns split out and made optional (R-UI-12 — this grid
 * previously had no column preferences at all) rather than one wide "Çarpan / Oto BB / Satış
 * Stok" cell per marketplace.
 */

interface MarketplaceOption {
  code: string;
  displayName: string;
}

interface StockItem {
  baseStockCode: string;
  name: string;
  unitCost: string;
  unitStock: number;
  sourceCode: string;
  prefs: Record<string, { priceMultiplier: number; autoRepriceEnabled: boolean }>;
  offeredStock: Record<string, number>;
}

interface BundleSummary {
  bundleStockCode: string;
  name: string;
  memberCount: number;
}

/** Total offered across every marketplace — used by both the row highlight and the filter. */
function totalOffered(item: StockItem, marketplaces: MarketplaceOption[]): number {
  return marketplaces.reduce((sum, m) => sum + (item.offeredStock[m.code] ?? 0), 0);
}

/** Row highlighting (doc 06 §3, semantics preserved from the legacy app). */
function rowClass(item: StockItem, marketplaces: MarketplaceOption[]): string {
  if (item.unitCost === '0') return 'row-danger'; // cost unknown/unresolvable — excluded from automation
  if (totalOffered(item, marketplaces) > item.unitStock) return 'row-warning'; // over-listed
  return '';
}

function rowTitle(item: StockItem, marketplaces: MarketplaceOption[]): string | undefined {
  if (item.unitCost === '0') {
    return 'Maliyet bilinmiyor — bu kalem otomatik fiyatlamadan hariç tutuluyor.';
  }
  if (totalOffered(item, marketplaces) > item.unitStock) {
    return 'Aşırı listelenmiş: pazaryerlerindeki toplam satış stoğu fiziksel stoktan fazla.';
  }
  return undefined;
}

/** Shared by {@link MultiplierCell} and {@link AutoBBCell} — each owns its own field independently
 * so either column can be hidden via the column menu without breaking the other's editing. */
async function savePref(
  item: StockItem,
  marketplace: MarketplaceOption,
  next: { priceMultiplier?: number; autoRepriceEnabled?: boolean },
): Promise<void> {
  const res = await fetch('/api/stock/prefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseStockCode: item.baseStockCode,
      marketplaceCode: marketplace.code,
      ...next,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function MultiplierCell({
  item,
  marketplace,
  onChanged,
}: {
  item: StockItem;
  marketplace: MarketplaceOption;
  onChanged: () => void;
}) {
  const pref = item.prefs[marketplace.code];
  const [multiplier, setMultiplier] = useState(pref?.priceMultiplier ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      await savePref(item, marketplace, { priceMultiplier: multiplier });
      onChanged();
    } catch {
      setError('Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <input
        type="number"
        step="0.01"
        value={multiplier}
        disabled={busy}
        aria-label={`${item.name} için ${marketplace.displayName} fiyat çarpanı`}
        onChange={(e) => setMultiplier(Number(e.target.value))}
        onBlur={() => void save()}
        className="w-16 rounded border border-(--color-border) px-1 py-0.5 text-xs disabled:opacity-50"
      />
      {busy && <span className="text-[10px] text-(--color-muted)">Kaydediliyor…</span>}
      {error && <span className="text-[10px] text-(--color-danger)">{error}</span>}
    </div>
  );
}

function AutoBBCell({
  item,
  marketplace,
  onChanged,
}: {
  item: StockItem;
  marketplace: MarketplaceOption;
  onChanged: () => void;
}) {
  const pref = item.prefs[marketplace.code];
  const [auto, setAuto] = useState(pref?.autoRepriceEnabled ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function save(next: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      await savePref(item, marketplace, { autoRepriceEnabled: next });
      onChanged();
    } catch {
      setError('Kaydedilemedi.');
      setAuto(!next); // the server never accepted it — do not leave the switch showing a lie
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <input
        type="checkbox"
        checked={auto}
        disabled={busy}
        aria-label={`${item.name} için ${marketplace.displayName} otomatik buybox`}
        onChange={(e) => {
          setAuto(e.target.checked);
          void save(e.target.checked);
        }}
      />
      {error && <span className="text-[10px] text-(--color-danger)">{error}</span>}
    </div>
  );
}

function OfferedStockCell({ item, marketplace }: { item: StockItem; marketplace: MarketplaceOption }) {
  const offered = item.offeredStock[marketplace.code] ?? 0;
  const listingOpportunity = offered === 0 && item.unitStock > 0;
  return (
    <div className="flex items-center gap-1">
      <span>{formatNumber(offered)}</span>
      {listingOpportunity && (
        <Chip tone="ok" title="Fiziksel stok var ama bu pazaryerinde satışta yok.">
          Fırsat
        </Chip>
      )}
    </div>
  );
}

function AddItemForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ baseStockCode: '', name: '', unitCost: '', unitStock: '0' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function submit() {
    setError(undefined);
    setBusy(true);
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, unitStock: Number(form.unitStock) }),
      });
      if (res.ok) {
        setOpen(false);
        setForm({ baseStockCode: '', name: '', unitCost: '', unitStock: '0' });
        onAdded();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Eklenemedi.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Ürün Ekle
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-(--color-border) bg-(--color-surface) p-3">
      <Field label="Stok Kodu">
        <TextInput
          value={form.baseStockCode}
          disabled={busy}
          onChange={(e) => setForm((f) => ({ ...f, baseStockCode: e.target.value }))}
        />
      </Field>
      <Field label="Ürün İsmi">
        <TextInput
          value={form.name}
          disabled={busy}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </Field>
      <Field label="Birim Fiyat (₺)">
        <TextInput
          value={form.unitCost}
          disabled={busy}
          onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))}
        />
      </Field>
      <Field label="Stok Miktarı">
        <TextInput
          type="number"
          value={form.unitStock}
          disabled={busy}
          onChange={(e) => setForm((f) => ({ ...f, unitStock: e.target.value }))}
        />
      </Field>
      <Button type="button" onClick={() => void submit()} disabled={busy}>
        {busy ? 'Kaydediliyor…' : 'Kaydet'}
      </Button>
      <Button variant="secondary" type="button" onClick={() => setOpen(false)} disabled={busy}>
        Vazgeç
      </Button>
      {error && (
        <p role="alert" className="w-full text-xs text-(--color-danger)">
          {error}
        </p>
      )}
    </div>
  );
}

function ImportPanel({ onImported }: { onImported: () => void }) {
  const [config, setConfig] = useState<{ configured: boolean; sourceCode?: string } | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [preview, setPreview] =
    useState<{ baseStockCode: string; name: string; unitCost: string; unitStock: number }[]>();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/product-source/config')
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({ configured: false }));
  }, []);

  async function fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  }

  async function previewExcel() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch('/api/setup/product-source/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCode: 'excel',
          sourceConfig: {
            fileBase64,
            columnMapping: {
              baseStockCode: 'KODU',
              name: 'ADI',
              unitCost: 'Standart_Maliyet',
              unitStock: 'TOPLAM MIKTAR',
            },
          },
        }),
      });
      const data = (await res.json()) as { ok: boolean; rows?: typeof preview; error?: string };
      if (data.ok) setPreview(data.rows);
      else setStatus(data.error ?? 'Önizleme başarısız.');
    } finally {
      setBusy(false);
    }
  }

  async function commitExcel() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus(undefined);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch('/api/stock/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCode: 'excel',
          sourceConfig: {
            fileBase64,
            columnMapping: {
              baseStockCode: 'KODU',
              name: 'ADI',
              unitCost: 'Standart_Maliyet',
              unitStock: 'TOPLAM MIKTAR',
            },
          },
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        itemsOk?: number;
        itemsFailed?: number;
        error?: string;
      };
      setStatus(
        data.ok
          ? `${data.itemsOk} ürün içe aktarıldı (${data.itemsFailed} hata).`
          : (data.error ?? 'İçe aktarma başarısız.'),
      );
      if (data.ok) onImported();
    } finally {
      setBusy(false);
    }
  }

  if (!config) return null;

  return (
    <div className="text-sm">
      <p className="mb-2 text-(--color-muted)">
        Yapılandırılmış kaynak: <strong>{config.configured ? config.sourceCode : 'yok'}</strong>
      </p>
      {config.sourceCode === 'excel' && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInput} type="file" accept=".xlsx" className="text-xs" aria-label="Excel dosyası" />
          <Button
            variant="secondary"
            type="button"
            disabled={busy}
            onClick={() => void previewExcel()}
            className="px-2! py-1! text-xs"
          >
            İlk 20 Satırı Önizle
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void commitExcel()}
            className="px-2! py-1! text-xs"
          >
            {busy ? 'İçe aktarılıyor…' : 'İçe Aktar'}
          </Button>
        </div>
      )}
      {preview && (
        <div className="mt-2 max-h-48 overflow-auto text-xs">
          <table className="w-full">
            <tbody>
              {preview.map((r, i) => (
                <tr key={i}>
                  <td className="border-b border-(--color-border) p-1">{r.baseStockCode}</td>
                  <td className="border-b border-(--color-border) p-1">{r.name}</td>
                  <td className="border-b border-(--color-border) p-1">{r.unitCost}</td>
                  <td className="border-b border-(--color-border) p-1">{r.unitStock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {status && (
        <p aria-live="polite" className="mt-2 text-xs">
          {status}
        </p>
      )}
    </div>
  );
}

function BundleEditor({ onChanged }: { onChanged: () => void }) {
  const [bundles, setBundles] = useState<BundleSummary[]>([]);
  const pagedBundles = usePagedRows(bundles, { pageSize: 25 });
  const [editing, setEditing] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [members, setMembers] = useState<{ memberStockCode: string; quantity: number }[]>([]);

  function load() {
    fetch('/api/stock/bundles')
      .then((r) => r.json())
      .then((d: { bundles: BundleSummary[] }) => setBundles(d.bundles));
  }
  useEffect(load, []);

  async function openBundle(code: string, existingName: string) {
    setEditing(code);
    setName(existingName);
    const res = await fetch(`/api/stock/bundles/${encodeURIComponent(code)}`);
    const data = (await res.json()) as { members: { memberStockCode: string; quantity: number }[] };
    setMembers(data.members);
  }

  function openNew() {
    setEditing('');
    setName('');
    setMembers([]);
  }

  async function save() {
    if (editing === undefined) return;
    const bundleStockCode = editing || `${Date.now()}`;
    await fetch('/api/stock/bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundleStockCode, name, members }),
    });
    setEditing(undefined);
    load();
    onChanged();
  }

  return (
    <div className="text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">{bundles.length} paket</span>
        <Button variant="secondary" type="button" onClick={openNew} className="px-2! py-1! text-xs">
          Yeni Paket
        </Button>
      </div>
      <ul className="mb-2 max-h-64 space-y-1 overflow-auto">
        {pagedBundles.rows.map((b) => (
          <li key={b.bundleStockCode} className="flex items-center justify-between">
            <button
              type="button"
              className="text-(--color-accent) hover:underline"
              onClick={() => void openBundle(b.bundleStockCode, b.name)}
            >
              {b.name} ({b.bundleStockCode})
            </button>
            <span className="text-xs text-(--color-muted)">{b.memberCount} üye</span>
          </li>
        ))}
        {bundles.length === 0 && <li className="text-xs text-(--color-muted)">Henüz paket yok.</li>}
      </ul>
      {bundles.length > 0 && (
        <div className="mb-3">
          <Pagination state={pagedBundles} label="paket" />
        </div>
      )}
      {editing !== undefined && (
        <div className="space-y-2 border-t border-(--color-border) pt-2">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Paket adı"
            aria-label="Paket adı"
            className="w-full"
          />
          {/* Bounded: there is no cap on how many members a bundle may have (doc 06 §3), and the
              save button has to stay reachable. */}
          <div className="max-h-64 space-y-2 overflow-auto">
            {members.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInput
                  value={m.memberStockCode}
                  onChange={(e) => {
                    const next = [...members];
                    next[i] = { ...next[i]!, memberStockCode: e.target.value };
                    setMembers(next);
                  }}
                  placeholder="Üye stok kodu"
                  aria-label={`${i + 1}. üye stok kodu`}
                  className="flex-1"
                />
                <TextInput
                  type="number"
                  min={1}
                  value={m.quantity}
                  onChange={(e) => {
                    const next = [...members];
                    next[i] = { ...next[i]!, quantity: Number(e.target.value) };
                    setMembers(next);
                  }}
                  aria-label={`${i + 1}. üye miktarı`}
                  className="w-16"
                />
                <button
                  type="button"
                  onClick={() => setMembers(members.filter((_, j) => j !== i))}
                  className="text-xs text-(--color-danger)"
                >
                  Sil
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="secondary"
            type="button"
            onClick={() => setMembers([...members, { memberStockCode: '', quantity: 1 }])}
            className="px-2! py-1! text-xs"
          >
            Üye Ekle
          </Button>
          <div className="flex gap-2">
            <Button type="button" onClick={() => void save()} className="px-3! py-1! text-xs">
              Kaydet
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => setEditing(undefined)}
              className="px-3! py-1! text-xs"
            >
              Vazgeç
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- The grid ------------------------------------------------------------------------------------

/** Marketplace-prefixed ids for the three columns each marketplace contributes, plus the static
 * item columns. Kept as `string` rather than a template-literal union: the marketplace list is
 * loaded from `/api/stock` at runtime, so there is no fixed set of ids to name at compile time. */
type ColumnId = string;

const MP_MULTIPLIER = (code: string) => `mp:${code}:multiplier`;
const MP_AUTO_BB = (code: string) => `mp:${code}:autoBB`;
const MP_OFFERED = (code: string) => `mp:${code}:offered`;

/** Built from the marketplaces the API returns — see `useColumnPrefs`'s doc comment on why a
 * screen with a dynamic column set has to wait for that data before it mounts the part of the
 * tree that calls the hook (`StockClient` renders `StockTable` only once `marketplaces` is
 * known, rather than calling `useColumnPrefs` here with a column list that would grow later). */
function buildColumnDefs(marketplaces: MarketplaceOption[]): ColumnDef<ColumnId>[] {
  const defs: ColumnDef<ColumnId>[] = [
    { id: 'stockCode', label: 'Stok Kodu', defaultWidth: 110 },
    { id: 'name', label: 'Ürün İsmi', defaultWidth: 260 },
    { id: 'unitCost', label: 'Birim Fiyat', defaultWidth: 110 },
    { id: 'unitStock', label: 'Stok Miktarı', defaultWidth: 100 },
  ];
  for (const m of marketplaces) {
    defs.push(
      { id: MP_MULTIPLIER(m.code), label: `${m.displayName} Çarpan`, defaultWidth: 100 },
      { id: MP_AUTO_BB(m.code), label: `${m.displayName} Oto BB`, defaultWidth: 90 },
      {
        id: MP_OFFERED(m.code),
        label: `${m.displayName} Satış Stok`,
        defaultWidth: 110,
        hiddenByDefault: true, // supporting detail — already surfaced as the row/cell highlight
      },
    );
  }
  defs.push({ id: 'source', label: 'Kaynak', defaultWidth: 90, hiddenByDefault: true });
  return defs;
}

function renderCell(
  id: ColumnId,
  item: StockItem,
  marketplaces: MarketplaceOption[],
  onChanged: () => void,
): React.ReactNode {
  if (id === 'stockCode') return item.baseStockCode;
  if (id === 'name') return item.name;
  if (id === 'unitCost') {
    if (item.unitCost === '0') {
      return (
        <Chip tone="danger" title="Maliyet bilinmiyor — bu kalem otomatik fiyatlamadan hariç tutuluyor.">
          Maliyet yok
        </Chip>
      );
    }
    return formatMoney(BigInt(item.unitCost));
  }
  if (id === 'unitStock') {
    const over = totalOffered(item, marketplaces) > item.unitStock;
    return (
      <div className="flex items-center gap-1">
        <span>{formatNumber(item.unitStock)}</span>
        {over && (
          <Chip tone="warn" title="Pazaryerlerindeki toplam satış stoğu fiziksel stoktan fazla.">
            Aşırı listelenmiş
          </Chip>
        )}
      </div>
    );
  }
  if (id === 'source') return item.sourceCode;

  const mp = marketplaces.find(
    (m) => id === MP_MULTIPLIER(m.code) || id === MP_AUTO_BB(m.code) || id === MP_OFFERED(m.code),
  );
  if (!mp) return '—';
  if (id === MP_OFFERED(mp.code)) return <OfferedStockCell item={item} marketplace={mp} />;
  if (id === MP_AUTO_BB(mp.code)) return <AutoBBCell item={item} marketplace={mp} onChanged={onChanged} />;
  return <MultiplierCell item={item} marketplace={mp} onChanged={onChanged} />;
}

interface Filters {
  text: string;
  onlyCostProblems: boolean;
  onlyOverListed: boolean;
}

const EMPTY_FILTERS: Filters = { text: '', onlyCostProblems: false, onlyOverListed: false };

function matchesFilters(item: StockItem, marketplaces: MarketplaceOption[], filters: Filters): boolean {
  if (filters.text) {
    const q = filters.text.toLowerCase();
    if (!item.baseStockCode.toLowerCase().includes(q) && !item.name.toLowerCase().includes(q)) return false;
  }
  if (filters.onlyCostProblems && item.unitCost !== '0') return false;
  if (filters.onlyOverListed && !(totalOffered(item, marketplaces) > item.unitStock)) return false;
  return true;
}

/**
 * The grid itself, split out of `StockClient` so `useColumnPrefs` is only ever called with the
 * full, final column list — see `buildColumnDefs`'s doc comment. Mounted once `marketplaces` is
 * known (doc 15 §6 Phase 2.6).
 */
function StockTable({
  items,
  marketplaces,
  refreshing,
  onChanged,
}: {
  items: StockItem[];
  marketplaces: MarketplaceOption[];
  refreshing: boolean;
  onChanged: () => void;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const columnDefs = useMemo(() => buildColumnDefs(marketplaces), [marketplaces]);
  const columns = useColumnPrefs('stock-columns-v1', columnDefs);
  const visibleColumns = columnDefs.filter((d) => columns.isVisible(d.id));

  const filtered = useMemo(
    () => items.filter((item) => matchesFilters(item, marketplaces, filters)),
    [items, marketplaces, filters],
  );
  const resetKey = `${filters.text}|${filters.onlyCostProblems}|${filters.onlyOverListed}`;
  const paged = usePagedRows(filtered, { resetKey });

  const hasActiveFilters = filters.text !== '' || filters.onlyCostProblems || filters.onlyOverListed;

  function exportCsv() {
    // Always the full catalogue, not just the current filter/page: the operator's mental model
    // of "export" here is "everything", and the filter above exists to *look at* a subset, not to
    // define what leaves the app. No size cap needed — the grid loads the whole in-memory stock
    // catalogue up front already (unlike the server-paged Listings grid).
    downloadCsv(
      'stok.csv',
      items.map((item) => {
        const row: Record<string, unknown> = {
          'Stok Kodu': item.baseStockCode,
          'Ürün İsmi': item.name,
          // A plain decimal, not `formatMoney`'s "₺123,45": a spreadsheet needs a parseable
          // number in this column, and the ₺ prefix and thousands separator would defeat that.
          // Still the display boundary — nothing upstream of this ever holds a float.
          'Birim Fiyat': (Number(item.unitCost) / 100).toFixed(2),
          'Stok Miktarı': item.unitStock,
          Kaynak: item.sourceCode,
        };
        for (const m of marketplaces) {
          const pref = item.prefs[m.code];
          row[`${m.displayName} Çarpan`] = pref?.priceMultiplier ?? '';
          row[`${m.displayName} Oto BB`] = pref?.autoRepriceEnabled ? 'evet' : 'hayır';
          row[`${m.displayName} Satış Stok`] = item.offeredStock[m.code] ?? 0;
        }
        return row;
      }),
    );
  }

  return (
    <Section
      id="stock-items"
      title="Stok Kalemleri"
      action={
        <div className="flex items-center gap-2">
          <ColumnMenu defs={columnDefs} prefs={columns} />
          <Button variant="secondary" type="button" onClick={exportCsv} className="px-2! py-1! text-xs">
            Excel&apos;e Aktar
          </Button>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Ara (stok kodu / ürün ismi)">
          <TextInput
            value={filters.text}
            onChange={(e) => setFilters({ ...filters, text: e.target.value })}
            className="w-56"
          />
        </Field>
        <label className="flex items-center gap-1.5 pb-1.5 text-sm">
          <input
            type="checkbox"
            checked={filters.onlyCostProblems}
            onChange={(e) => setFilters({ ...filters, onlyCostProblems: e.target.checked })}
          />
          Yalnızca maliyeti bilinmeyenler
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-sm">
          <input
            type="checkbox"
            checked={filters.onlyOverListed}
            onChange={(e) => setFilters({ ...filters, onlyOverListed: e.target.checked })}
          />
          Yalnızca aşırı listelenenler
        </label>
        {hasActiveFilters && (
          <Button
            variant="secondary"
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="px-2! py-1! pb-1.5! text-xs"
          >
            Temizle
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          message={hasActiveFilters ? 'Bu filtrelerle eşleşen stok kalemi yok.' : 'Henüz stok kalemi yok.'}
          reason={
            hasActiveFilters
              ? 'Farklı bir arama deneyin ya da filtreleri temizleyin.'
              : 'Aşağıdan elle bir kalem ekleyin ya da yapılandırılmış kaynaktan içe aktarın.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>
                Filtreleri Temizle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          <TableFrame>
            <table className="w-full text-sm" style={resizableTableStyle(columnDefs, columns)}>
              <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-(--color-muted)`}>
                <tr>
                  {visibleColumns.map((d) => (
                    <ResizableTh key={d.id} id={d.id} prefs={columns} className="px-2 py-2">
                      {d.label}
                    </ResizableTh>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {paged.rows.map((item) => (
                  <tr
                    key={item.baseStockCode}
                    className={rowClass(item, marketplaces)}
                    title={rowTitle(item, marketplaces)}
                  >
                    {visibleColumns.map((d) => (
                      <td key={d.id} className="px-2 py-1">
                        {renderCell(d.id, item, marketplaces, onChanged)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
          <Pagination state={paged} label="stok kalemi">
            {refreshing && <span aria-live="polite"> · yükleniyor…</span>}
          </Pagination>
        </div>
      )}
    </Section>
  );
}

export function StockClient() {
  /** `null` until the first successful load — distinct from "loaded, zero rows" (doc 15 §3.2). */
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [marketplaces, setMarketplaces] = useState<MarketplaceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch('/api/stock')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { items: StockItem[]; marketplaces: MarketplaceOption[] }) => {
        setItems(d.items);
        setMarketplaces(d.marketplaces);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  // The primary load's six-state handling (doc 15 §3.2): a failed first load is retryable, a
  // first load in flight says so. After this point `items` is never `null`.
  if (!items && loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }
  if (!items) {
    return <LoadingState message="Stok yükleniyor…" skeletonRows={4} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stok"
        description="Her stok kaleminin maliyetini ve pazaryeri ayarlarını burada yönetin. Kırmızı satır maliyeti bilinmeyen — bu yüzden otomasyon dışında kalan — bir kalemi, sarı satır fiziksel stoktan fazla listelenmiş bir kalemi işaret eder."
        action={<AddItemForm onAdded={load} />}
      />

      {/* A refresh (a pref save, an import, a bundle save) failed but the previous list is still
          on screen — say so rather than letting it silently go stale (§3.2 "Stale"). */}
      {loadError && (
        <p
          role="alert"
          className="rounded border border-(--color-warning-border) bg-(--color-warning-bg) px-3 py-2 text-sm"
        >
          Son yenileme başarısız oldu ({loadError}). Aşağıdaki liste artık güncel olmayabilir.
        </p>
      )}

      <StockTable items={items} marketplaces={marketplaces} refreshing={loading} onChanged={load} />

      <details className="rounded border border-(--color-border)">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold uppercase tracking-wide text-(--color-muted)">
          İçe Aktarma
        </summary>
        <div className="border-t border-(--color-border) p-3">
          <ImportPanel onImported={load} />
        </div>
      </details>

      <details className="rounded border border-(--color-border)">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold uppercase tracking-wide text-(--color-muted)">
          Paket Düzenleyici
        </summary>
        <div className="border-t border-(--color-border) p-3">
          <BundleEditor onChanged={load} />
        </div>
      </details>
    </div>
  );
}
