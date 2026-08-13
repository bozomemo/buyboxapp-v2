'use client';

import { useState } from 'react';
import { Button, Field, StatusBanner, StepFooter, TextInput } from '../ui';

interface Band {
  edge: string; // maxPrice for cargo, minPrice for expenditure — decimal string, "" = unbounded
  amount: string;
}

interface FeeForm {
  code: 'trendyol' | 'hepsiburada';
  title: string;
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
  saved?: boolean;
}

function initialForm(code: 'trendyol' | 'hepsiburada', title: string): FeeForm {
  return {
    code,
    title,
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
}

function toPayload(form: FeeForm) {
  return {
    marketplaceCode: form.code,
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
            className="text-xs text-[var(--color-danger)]"
            onClick={() => onChange(bands.filter((_, j) => j !== i))}
          >
            Kaldır
          </button>
        </div>
      ))}
      <button
        type="button"
        className="w-fit text-xs text-[var(--color-accent)]"
        onClick={() => onChange([...bands, { edge: '', amount: '0' }])}
      >
        + Bant Ekle
      </button>
    </div>
  );
}

const ALL_TITLES: Record<'trendyol' | 'hepsiburada', string> = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
};

export function Step4Fees({
  enabledMarketplaces,
  onDone,
  onBack,
}: {
  enabledMarketplaces: ('trendyol' | 'hepsiburada')[];
  onDone: () => void;
  onBack: () => void;
}) {
  const [forms, setForms] = useState<FeeForm[]>(() =>
    enabledMarketplaces.map((code) => initialForm(code, ALL_TITLES[code])),
  );
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [busyCode, setBusyCode] = useState<string | undefined>();

  function update(code: FeeForm['code'], patch: Partial<FeeForm>) {
    setForms((prev) => prev.map((f) => (f.code === code ? { ...f, ...patch } : f)));
  }

  async function runPreview(form: FeeForm) {
    setBusyCode(form.code);
    try {
      const res = await fetch('/api/setup/fees/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fees: toPayload(form), sampleCost: '100.00', sampleVatRate: 20 }),
      });
      const data = (await res.json()) as { ok: boolean; floorPrice?: string; error?: string };
      setPreview((p) => ({
        ...p,
        [form.code]: data.ok
          ? `100,00 ₺ maliyetli, %20 KDV'li bir ürün için dip fiyat: ${data.floorPrice}`
          : (data.error ?? 'Hesaplanamadı'),
      }));
    } finally {
      setBusyCode(undefined);
    }
  }

  async function save(form: FeeForm) {
    setBusyCode(form.code);
    try {
      const res = await fetch('/api/setup/fees/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(form)),
      });
      update(form.code, { saved: res.ok });
    } finally {
      setBusyCode(undefined);
    }
  }

  const canProceed = forms.every((f) => f.saved);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--color-muted)]">
        Komisyon KDV oranı ve muamelesi, kargo bantları ve gider bantları (doc 02 §3). Kalıcı değerler
        mağazanızın gerçek sözleşme koşullarıyla eşleşmelidir — buradaki değerler başlangıç varsayımlarıdır ve
        Ayarlar ekranından daha sonra düzeltilebilir.
      </p>
      {forms.map((form) => (
        <div key={form.code} className="rounded border border-[var(--color-border)] p-4">
          <h3 className="mb-3 font-semibold">{form.title}</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Komisyon KDV Oranı (%)">
              <TextInput
                value={form.commissionVatRate}
                onChange={(e) => update(form.code, { commissionVatRate: e.target.value })}
              />
            </Field>
            <Field label="Varsayılan Komisyon Oranı (%)">
              <TextInput
                value={form.defaultCommissionRate}
                onChange={(e) => update(form.code, { defaultCommissionRate: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.commissionRateIncludesVat}
                onChange={(e) => update(form.code, { commissionRateIncludesVat: e.target.checked })}
              />
              API oranı KDV dahil
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.commissionVatDeductible}
                onChange={(e) => update(form.code, { commissionVatDeductible: e.target.checked })}
              />
              Komisyon KDV'si indirilebilir
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <BandEditor
              label="Kargo Bantları (üst fiyat sınırı, tutar)"
              edgeLabel="Üst sınır (boş = sınırsız)"
              bands={form.cargoBands}
              onChange={(bands) => update(form.code, { cargoBands: bands })}
            />
            <BandEditor
              label="Gider Bantları (alt fiyat sınırı, tutar)"
              edgeLabel="Alt sınır"
              bands={form.expenditureBands}
              onChange={(bands) => update(form.code, { expenditureBands: bands })}
            />
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => void runPreview(form)}
              disabled={busyCode === form.code}
            >
              Dip Fiyat Önizle
            </Button>
            <Button type="button" onClick={() => void save(form)} disabled={busyCode === form.code}>
              Kaydet
            </Button>
          </div>
          {preview[form.code] && <p className="mt-2 text-sm">{preview[form.code]}</p>}
          {form.saved && <StatusBanner ok message="Ücret ayarları kaydedildi." />}
        </div>
      ))}
      <StepFooter onBack={onBack} onNext={onDone} nextDisabled={!canProceed} />
    </div>
  );
}
