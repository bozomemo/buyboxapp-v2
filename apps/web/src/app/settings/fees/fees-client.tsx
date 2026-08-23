'use client';

import { useEffect, useState } from 'react';
import { Pagination, usePagedRows } from '@/components/table';
import { formatDate } from '@/lib/format';
import { Button, Field, StatusBanner, TextInput } from '../../setup/ui';

interface Band {
  edge: string;
  amount: string;
}

interface Form {
  commissionVatRate: string;
  commissionRateIncludesVat: boolean;
  commissionVatDeductible: boolean;
  commissionBase: 'gross' | 'net';
  defaultCommissionRate: string;
  cargoBands: Band[];
  cargoAmountsIncludeVat: boolean;
  cargoVatRate: string;
  cargoVatDeductible: boolean;
  expenditureBands: Band[];
  expenditureIncludesVat: boolean;
  expenditureVatRate: string;
  expenditureVatDeductible: boolean;
}

const EMPTY: Form = {
  commissionVatRate: '20',
  commissionRateIncludesVat: false,
  commissionVatDeductible: false,
  commissionBase: 'gross',
  defaultCommissionRate: '15',
  cargoBands: [{ edge: '', amount: '11.00' }],
  cargoAmountsIncludeVat: true,
  cargoVatRate: '20',
  cargoVatDeductible: false,
  expenditureBands: [{ edge: '0', amount: '0' }],
  expenditureIncludesVat: true,
  expenditureVatRate: '20',
  expenditureVatDeductible: false,
};

function toPayload(marketplaceCode: string, form: Form) {
  return {
    marketplaceCode,
    commissionVatRate: Number(form.commissionVatRate),
    commissionRateIncludesVat: form.commissionRateIncludesVat,
    commissionVatDeductible: form.commissionVatDeductible,
    commissionBase: form.commissionBase,
    defaultCommissionRate: Number(form.defaultCommissionRate),
    cargoBands: form.cargoBands.map((b) => ({ maxPrice: b.edge || null, amount: b.amount })),
    cargoAmountsIncludeVat: form.cargoAmountsIncludeVat,
    cargoVatRate: Number(form.cargoVatRate),
    cargoVatDeductible: form.cargoVatDeductible,
    expenditureBands: form.expenditureBands.map((b) => ({ minPrice: b.edge || '0', amount: b.amount })),
    expenditureIncludesVat: form.expenditureIncludesVat,
    expenditureVatRate: Number(form.expenditureVatRate),
    expenditureVatDeductible: form.expenditureVatDeductible,
  };
}

function BandEditor({
  label,
  edgeLabel,
  bands,
  onChange,
}: {
  label: string;
  edgeLabel: string;
  bands: Band[];
  onChange: (bands: Band[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {bands.map((band, i) => (
        <div key={i} className="flex items-center gap-2">
          <TextInput
            placeholder={edgeLabel}
            value={band.edge}
            onChange={(e) => onChange(bands.map((b, j) => (i === j ? { ...b, edge: e.target.value } : b)))}
            className="w-32"
          />
          <TextInput
            placeholder="Tutar"
            value={band.amount}
            onChange={(e) => onChange(bands.map((b, j) => (i === j ? { ...b, amount: e.target.value } : b)))}
            className="w-28"
          />
          <button
            type="button"
            className="text-xs text-(--color-danger)"
            onClick={() => onChange(bands.filter((_, j) => j !== i))}
          >
            Kaldır
          </button>
        </div>
      ))}
      <button
        type="button"
        className="w-fit text-xs text-(--color-accent)"
        onClick={() => onChange([...bands, { edge: '', amount: '0' }])}
      >
        + Bant Ekle
      </button>
    </div>
  );
}

export function FeesClient() {
  const [marketplaceCode, setMarketplaceCode] = useState<'trendyol' | 'hepsiburada'>('trendyol');
  const [form, setForm] = useState<Form>(EMPTY);
  const [history, setHistory] = useState<
    { id: string; effectiveFrom: number; defaultCommissionRate: number }[]
  >([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // One row per fee revision — short today, unbounded over the life of the store.
  const pagedHistory = usePagedRows(history, { pageSize: 25, resetKey: marketplaceCode });

  useEffect(() => {
    setSaved(false);
    fetch(`/api/settings/fees?marketplaceCode=${marketplaceCode}`)
      .then((r) => r.json())
      .then((data: { current: Form | null; history: typeof history }) => {
        setForm(data.current ?? EMPTY);
        setHistory(data.history);
      })
      .catch(() => undefined);
  }, [marketplaceCode]);

  function update(patch: Partial<Form>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function runPreview() {
    setBusy(true);
    try {
      const res = await fetch('/api/setup/fees/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fees: toPayload(marketplaceCode, form),
          sampleCost: '100.00',
          sampleVatRate: 20,
        }),
      });
      const data = (await res.json()) as { ok: boolean; floorPrice?: string; error?: string };
      setPreview(
        data.ok
          ? `100,00 ₺ maliyetli, %20 KDV'li bir ürün için dip fiyat: ${data.floorPrice}`
          : (data.error ?? 'Hesaplanamadı'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings/fees/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(marketplaceCode, form)),
      });
      setSaved(res.ok);
      if (res.ok) {
        const data = (await (
          await fetch(`/api/settings/fees?marketplaceCode=${marketplaceCode}`)
        ).json()) as {
          history: typeof history;
        };
        setHistory(data.history);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <label className="text-sm">
        Pazaryeri:{' '}
        <select
          className="rounded border border-(--color-border) px-2 py-1"
          value={marketplaceCode}
          onChange={(e) => setMarketplaceCode(e.target.value as 'trendyol' | 'hepsiburada')}
        >
          <option value="trendyol">Trendyol</option>
          <option value="hepsiburada">Hepsiburada</option>
        </select>
      </label>

      <div className="rounded border border-(--color-border) p-4">
        <p className="mb-3 text-xs text-(--color-muted)">
          Kaydettiğinizde yeni bir satır, şimdiki zamanla etkin olarak eklenir (doc 05 §2) — geçmiş fiyat
          kararları hep o anda geçerli olan değerlerle açıklanabilir kalır, eski satır asla değiştirilmez.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Komisyon KDV Oranı (%)">
            <TextInput
              value={form.commissionVatRate}
              onChange={(e) => update({ commissionVatRate: e.target.value })}
            />
          </Field>
          <Field label="Varsayılan Komisyon Oranı (%)">
            <TextInput
              value={form.defaultCommissionRate}
              onChange={(e) => update({ defaultCommissionRate: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.commissionRateIncludesVat}
              onChange={(e) => update({ commissionRateIncludesVat: e.target.checked })}
            />
            API oranı KDV dahil
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.commissionVatDeductible}
              onChange={(e) => update({ commissionVatDeductible: e.target.checked })}
            />
            Komisyon KDV'si indirilebilir
          </label>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <BandEditor
            label="Kargo Bantları (üst fiyat sınırı, tutar)"
            edgeLabel="Üst sınır (boş = sınırsız)"
            bands={form.cargoBands}
            onChange={(bands) => update({ cargoBands: bands })}
          />
          <BandEditor
            label="Gider Bantları (alt fiyat sınırı, tutar)"
            edgeLabel="Alt sınır"
            bands={form.expenditureBands}
            onChange={(bands) => update({ expenditureBands: bands })}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" type="button" onClick={() => void runPreview()} disabled={busy}>
            Dip Fiyat Önizle
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy}>
            Kaydet
          </Button>
        </div>
        {preview && <p className="mt-2 text-sm">{preview}</p>}
        {saved && <StatusBanner ok message="Ücret ayarları kaydedildi." />}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-(--color-muted)">
          Geçmiş
        </h3>
        <ul className="table-frame max-h-[50vh] divide-y divide-(--color-border) rounded border border-(--color-border) text-sm">
          {pagedHistory.rows.map((h) => (
            <li key={h.id} className="flex justify-between px-3 py-2">
              <span>{formatDate(h.effectiveFrom)}</span>
              <span className="text-(--color-muted)">Komisyon: %{h.defaultCommissionRate}</span>
            </li>
          ))}
          {history.length === 0 && <li className="px-3 py-2 text-(--color-muted)">Kayıt yok.</li>}
        </ul>
        {history.length > 0 && (
          <div className="mt-2">
            <Pagination state={pagedHistory} label="kayıt" />
          </div>
        )}
      </div>
    </div>
  );
}
