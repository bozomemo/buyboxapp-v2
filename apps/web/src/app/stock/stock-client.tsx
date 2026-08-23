'use client';

import { useEffect, useRef, useState } from 'react';
import { Pagination, STICKY_HEAD, TableFrame, usePagedRows } from '@/components/table';
import { formatMoney, formatNumber } from '@/lib/format';

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

/** Row highlighting (doc 06 §3, semantics preserved from the legacy app). */
function rowClass(item: StockItem, marketplaces: MarketplaceOption[]): string {
  if (item.unitCost === '0') return 'row-danger'; // cost unknown/unresolvable — excluded from automation
  const totalOffered = marketplaces.reduce((sum, m) => sum + (item.offeredStock[m.code] ?? 0), 0);
  if (totalOffered > item.unitStock) return 'row-warning'; // over-listed
  return '';
}

function PrefCell({
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
  const [auto, setAuto] = useState(pref?.autoRepriceEnabled ?? false);
  const offered = item.offeredStock[marketplace.code] ?? 0;
  const listingOpportunity = offered === 0 && item.unitStock > 0;

  async function save(next: { priceMultiplier?: number; autoRepriceEnabled?: boolean }) {
    await fetch('/api/stock/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseStockCode: item.baseStockCode,
        marketplaceCode: marketplace.code,
        ...next,
      }),
    });
    onChanged();
  }

  return (
    <td
      className={`px-2 py-1 ${listingOpportunity ? 'row-success' : ''}`}
      title={
        listingOpportunity ? 'Listeleme fırsatı: fiziksel stok var, bu pazaryerinde satışta yok' : undefined
      }
    >
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          value={multiplier}
          onChange={(e) => setMultiplier(Number(e.target.value))}
          onBlur={() => void save({ priceMultiplier: multiplier })}
          className="w-16 rounded border border-(--color-border) px-1 py-0.5 text-xs"
        />
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            setAuto(e.target.checked);
            void save({ autoRepriceEnabled: e.target.checked });
          }}
          title="Otomatik Buybox"
        />
        <span className="text-[10px] text-(--color-muted)">{formatNumber(offered)}</span>
      </div>
    </td>
  );
}

function AddItemForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ baseStockCode: '', name: '', unitCost: '', unitStock: '0' });
  const [error, setError] = useState<string | undefined>();

  async function submit() {
    setError(undefined);
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
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-(--color-accent) px-3 py-1.5 text-sm font-semibold text-(--color-accent-ink)"
      >
        Ürün Ekle
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-(--color-border) p-3">
      <label className="flex flex-col text-xs">
        Stok Kodu
        <input
          value={form.baseStockCode}
          onChange={(e) => setForm((f) => ({ ...f, baseStockCode: e.target.value }))}
          className="rounded border border-(--color-border) px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col text-xs">
        Ürün İsmi
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="rounded border border-(--color-border) px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col text-xs">
        Birim Fiyat (₺)
        <input
          value={form.unitCost}
          onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))}
          className="rounded border border-(--color-border) px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col text-xs">
        Stok Miktarı
        <input
          type="number"
          value={form.unitStock}
          onChange={(e) => setForm((f) => ({ ...f, unitStock: e.target.value }))}
          className="rounded border border-(--color-border) px-2 py-1 text-sm"
        />
      </label>
      <button
        type="button"
        onClick={() => void submit()}
        className="rounded bg-(--color-accent) px-3 py-1.5 text-sm font-semibold text-(--color-accent-ink)"
      >
        Kaydet
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded border px-3 py-1.5 text-sm">
        Vazgeç
      </button>
      {error && <p className="w-full text-xs text-(--color-danger)">{error}</p>}
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
    <div className="rounded border border-(--color-border) p-3 text-sm">
      <p className="mb-2 text-(--color-muted)">
        Yapılandırılmış kaynak: <strong>{config.configured ? config.sourceCode : 'yok'}</strong>
      </p>
      {config.sourceCode === 'excel' && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInput} type="file" accept=".xlsx" className="text-xs" />
          <button
            type="button"
            disabled={busy}
            onClick={() => void previewExcel()}
            className="rounded border px-2 py-1 text-xs"
          >
            İlk 20 Satırı Önizle
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void commitExcel()}
            className="rounded bg-(--color-accent) px-2 py-1 text-xs text-(--color-accent-ink)"
          >
            İçe Aktar
          </button>
        </div>
      )}
      {preview && (
        <div className="mt-2 max-h-48 overflow-auto text-xs">
          <table className="w-full">
            <tbody>
              {preview.map((r, i) => (
                <tr key={i}>
                  <td className="border-b p-1">{r.baseStockCode}</td>
                  <td className="border-b p-1">{r.name}</td>
                  <td className="border-b p-1">{r.unitCost}</td>
                  <td className="border-b p-1">{r.unitStock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {status && <p className="mt-2 text-xs">{status}</p>}
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
    <div className="rounded border border-(--color-border) p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Paket Düzenleyici</span>
        <button type="button" onClick={openNew} className="rounded border px-2 py-1 text-xs">
          Yeni Paket
        </button>
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Paket adı"
            className="w-full rounded border border-(--color-border) px-2 py-1 text-xs"
          />
          {/* Bounded: there is no cap on how many members a bundle may have (doc 06 §3), and the
              save button has to stay reachable. */}
          <div className="max-h-64 space-y-2 overflow-auto">
          {members.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={m.memberStockCode}
                onChange={(e) => {
                  const next = [...members];
                  next[i] = { ...next[i]!, memberStockCode: e.target.value };
                  setMembers(next);
                }}
                placeholder="Üye stok kodu"
                className="flex-1 rounded border border-(--color-border) px-2 py-1 text-xs"
              />
              <input
                type="number"
                min={1}
                value={m.quantity}
                onChange={(e) => {
                  const next = [...members];
                  next[i] = { ...next[i]!, quantity: Number(e.target.value) };
                  setMembers(next);
                }}
                className="w-16 rounded border border-(--color-border) px-2 py-1 text-xs"
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
          <button
            type="button"
            onClick={() => setMembers([...members, { memberStockCode: '', quantity: 1 }])}
            className="rounded border px-2 py-1 text-xs"
          >
            Üye Ekle
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              className="rounded bg-(--color-accent) px-3 py-1 text-xs text-(--color-accent-ink)"
            >
              Kaydet
            </button>
            <button
              type="button"
              onClick={() => setEditing(undefined)}
              className="rounded border px-3 py-1 text-xs"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StockClient() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [marketplaces, setMarketplaces] = useState<MarketplaceOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const paged = usePagedRows(items);

  function load() {
    fetch('/api/stock')
      .then((r) => r.json())
      .then((d: { items: StockItem[]; marketplaces: MarketplaceOption[] }) => {
        setItems(d.items);
        setMarketplaces(d.marketplaces);
        setLoaded(true);
      });
  }
  useEffect(load, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stok</h1>
      <div className="flex flex-wrap gap-3">
        <AddItemForm onAdded={load} />
      </div>
      <ImportPanel onImported={load} />
      <BundleEditor onChanged={load} />

      {loaded && (
        <div className="space-y-2">
        <TableFrame>
          <table className="w-full text-sm">
            <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-(--color-muted)`}>
              <tr>
                <th className="px-2 py-2">Stok Kodu</th>
                <th className="px-2 py-2">Ürün İsmi</th>
                <th className="px-2 py-2">Birim Fiyat</th>
                <th className="px-2 py-2">Stok Miktarı</th>
                {marketplaces.map((m) => (
                  <th key={m.code} className="px-2 py-2">
                    {m.displayName} (Çarpan / Oto BB / Satış Stok)
                  </th>
                ))}
                <th className="px-2 py-2">Kaynak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {paged.rows.map((item) => (
                <tr key={item.baseStockCode} className={rowClass(item, marketplaces)}>
                  <td className="px-2 py-1">{item.baseStockCode}</td>
                  <td className="px-2 py-1">{item.name}</td>
                  <td className={`px-2 py-1 ${item.unitCost === '0' ? 'row-danger' : ''}`}>
                    {formatMoney(BigInt(item.unitCost))}
                  </td>
                  <td className="px-2 py-1">{formatNumber(item.unitStock)}</td>
                  {marketplaces.map((m) => (
                    <PrefCell key={m.code} item={item} marketplace={m} onChanged={load} />
                  ))}
                  <td className="px-2 py-1">{item.sourceCode}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={4 + marketplaces.length + 1}
                    className="px-2 py-6 text-center text-(--color-muted)"
                  >
                    Henüz stok kalemi yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableFrame>
        <Pagination state={paged} label="stok kalemi" />
        </div>
      )}
    </div>
  );
}
