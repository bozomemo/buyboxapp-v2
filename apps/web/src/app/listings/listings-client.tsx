'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
}

const PHASES = ['SEEKING', 'CLIMBING', 'REFINING', 'OPTIMUM', 'BLOCKED'] as const;
const PAGE_SIZE = 50;

interface Filters {
  marketplaceCode: string;
  phases: string[];
  text: string;
  isSalable?: boolean;
  isLocked?: boolean;
  repriceEnabled?: boolean;
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
        className="rounded border border-[var(--color-border)] px-1 py-0.5"
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
          className="w-20 rounded border border-[var(--color-border)] px-1 py-0.5 text-xs"
        />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!value}
          className="text-xs text-[var(--color-accent)]"
        >
          Gönder
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-[var(--color-muted)]">
          İptal
        </button>
      </div>
      {confirming && (
        <div className="rounded border border-[var(--color-warning)] bg-amber-50 p-2 text-xs">
          <p>
            {formatMoney(BigInt(row.price))} → ₺{value} olarak gönderilsin mi? Bu, bu ilan için otomasyonu
            geçici olarak duraklatır.
          </p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded bg-[var(--color-accent)] px-2 py-0.5 text-white"
            >
              Onayla
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded border px-2 py-0.5">
              Vazgeç
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-[var(--color-danger)]">{error}</p>}
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
        className="w-14 rounded border border-[var(--color-border)] px-1 py-0.5 text-xs"
      />
      <input
        value={max}
        onChange={(e) => setMax(e.target.value)}
        onBlur={() => void save()}
        placeholder="max"
        className="w-14 rounded border border-[var(--color-border)] px-1 py-0.5 text-xs"
      />
    </div>
  );
}

export function ListingsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<Filters>({ marketplaceCode: '', phases: [], text: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.marketplaceCode) params.set('marketplaceCode', filters.marketplaceCode);
    if (filters.phases.length > 0) params.set('phases', filters.phases.join(','));
    if (filters.text) params.set('text', filters.text);
    if (filters.isSalable !== undefined) params.set('isSalable', String(filters.isSalable));
    if (filters.isLocked !== undefined) params.set('isLocked', String(filters.isLocked));
    if (filters.repriceEnabled !== undefined) params.set('repriceEnabled', String(filters.repriceEnabled));
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    fetch(`/api/listings?${params.toString()}`)
      .then((r) => r.json())
      .then((d: { rows: Row[]; total: number }) => {
        setRows(d.rows);
        setTotal(d.total);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [filters, page]);

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

  async function bulkAction(action: 'enableAutomation' | 'disableAutomation' | 'forceReoptimize') {
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">İlanlar</h1>

      <div className="flex flex-wrap items-end gap-3 rounded border border-[var(--color-border)] p-3">
        <label className="flex flex-col text-xs">
          Pazaryeri
          <select
            value={filters.marketplaceCode}
            onChange={(e) => {
              setPage(0);
              setFilters((f) => ({ ...f, marketplaceCode: e.target.value }));
            }}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-sm"
          >
            <option value="">Tümü</option>
            <option value="trendyol">Trendyol</option>
            <option value="hepsiburada">Hepsiburada</option>
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
            className="w-56 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
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
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'border border-[var(--color-border)]'
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
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded border border-[var(--color-accent)] bg-blue-50 px-3 py-2 text-sm">
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
            onClick={() => void bulkAction('forceReoptimize')}
            className="rounded border px-2 py-1"
          >
            Yeniden Optimize Et
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded border border-[var(--color-border)]">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left uppercase text-[var(--color-muted)]">
            <tr>
              <th className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              <th className="px-2 py-2">Pazaryeri</th>
              <th className="px-2 py-2">Ürün Adı</th>
              <th className="px-2 py-2">Stok Kodu</th>
              <th className="px-2 py-2">Dip Fiyat</th>
              <th className="px-2 py-2">Satış Fiyatı</th>
              <th className="px-2 py-2">Sıra</th>
              <th className="px-2 py-2">Buybox Fiyatı</th>
              <th className="px-2 py-2">Faz</th>
              <th className="px-2 py-2">Satış Stok</th>
              <th className="px-2 py-2">Min/Max</th>
              <th className="px-2 py-2">Oto BB</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((row) => (
              <tr key={row.id} className={rowClass(row)} style={{ contentVisibility: 'auto' }}>
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleSelected(row.id)}
                  />
                </td>
                <td className="px-2 py-1">{row.marketplaceCode}</td>
                <td className="px-2 py-1">
                  <Link href={`/listings/${row.id}`} className="text-[var(--color-accent)] hover:underline">
                    {row.productName}
                  </Link>
                </td>
                <td className="px-2 py-1">{row.baseStockCode ?? '—'}</td>
                <td className="px-2 py-1">{row.floorPrice ? formatMoney(BigInt(row.floorPrice)) : '—'}</td>
                <td className="px-2 py-1">
                  <ManualPriceCell row={row} onChanged={load} />
                </td>
                <td className={`px-2 py-1 ${row.rank === 1 ? 'row-success' : ''}`}>{row.rank ?? '—'}</td>
                <td className="px-2 py-1">{row.buyboxPrice ? formatMoney(BigInt(row.buyboxPrice)) : '—'}</td>
                <td className="px-2 py-1">{row.phase ?? '—'}</td>
                <td className="px-2 py-1">{formatNumber(row.offeredStock)}</td>
                <td className="px-2 py-1">
                  <MinMaxCell row={row} onChanged={load} />
                </td>
                <td className="px-2 py-1">
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
                      }).then(load);
                    }}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={12} className="px-2 py-6 text-center text-[var(--color-muted)]">
                  Filtreyle eşleşen ilan yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--color-muted)]">
          {formatNumber(total)} ilan — sayfa {page + 1}/{totalPages}, son görülme:{' '}
          {formatDateTime(rows[0]?.lastSeenAt)}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border px-3 py-1 disabled:opacity-50"
          >
            Önceki
          </button>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border px-3 py-1 disabled:opacity-50"
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  );
}
