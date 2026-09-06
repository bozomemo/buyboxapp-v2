'use client';

import { useEffect, useState } from 'react';
import { Button, Field, StatusBanner, StepFooter, StepStopNotice, TextInput } from '@/components/ui';

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
  /** Set when `/api/settings/fees` already had a row for this marketplace on mount. */
  savedByServer?: boolean;
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

// --- Field-level validation (doc 15 §6, Phase 6) ---------------------------------------------
//
// Before this, every numeric field here was a bare `TextInput`: typing "abc" into a commission
// rate produced `Number('abc') === NaN`, sent as-is to `/api/setup/fees/preview` and
// `/api/setup/fees/save`, and surfaced only as an opaque failure from those routes. Catching it
// here is prevention, not just reporting (doc 15 §5 review question 6).

function percentError(value: string): string | undefined {
  if (value.trim() === '') return 'Gerekli.';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Sayı olmalı.';
  if (n < 0 || n > 100) return '0 ile 100 arasında olmalı.';
  return undefined;
}

function amountError(value: string, allowEmpty: boolean): string | undefined {
  if (value.trim() === '') return allowEmpty ? undefined : 'Gerekli.';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Geçerli bir tutar olmalı (örn. 11.00).';
  if (n < 0) return 'Negatif olamaz.';
  return undefined;
}

function BandEditor({
  label,
  edgeLabel,
  bands,
  edgeAllowEmpty,
  touchedPrefix,
  touched,
  onTouch,
  onChange,
}: {
  label: string;
  edgeLabel: string;
  bands: Band[];
  edgeAllowEmpty: boolean;
  touchedPrefix: string;
  touched: Set<string>;
  onTouch: (key: string) => void;
  onChange: (bands: Band[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {bands.map((band, i) => {
        const edgeKey = `${touchedPrefix}:edge:${i}`;
        const amountKey = `${touchedPrefix}:amount:${i}`;
        const edgeErr = touched.has(edgeKey) ? amountError(band.edge, edgeAllowEmpty) : undefined;
        const amountErr = touched.has(amountKey) ? amountError(band.amount, false) : undefined;
        return (
          <div key={i} className="flex items-start gap-2">
            <div className="flex flex-col">
              <TextInput
                placeholder={edgeLabel}
                value={band.edge}
                onChange={(e) =>
                  onChange(bands.map((b, j) => (i === j ? { ...b, edge: e.target.value } : b)))
                }
                onBlur={() => onTouch(edgeKey)}
                className="w-32"
              />
              {edgeErr && (
                <span role="alert" className="mt-0.5 text-xs text-(--color-danger)">
                  {edgeErr}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              <TextInput
                placeholder="Tutar"
                value={band.amount}
                onChange={(e) =>
                  onChange(bands.map((b, j) => (i === j ? { ...b, amount: e.target.value } : b)))
                }
                onBlur={() => onTouch(amountKey)}
                className="w-28"
              />
              {amountErr && (
                <span role="alert" className="mt-0.5 text-xs text-(--color-danger)">
                  {amountErr}
                </span>
              )}
            </div>
            <button
              type="button"
              className="mt-1.5 text-xs text-(--color-danger)"
              onClick={() => onChange(bands.filter((_, j) => j !== i))}
            >
              Kaldır
            </button>
          </div>
        );
      })}
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
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Never re-ask what `/api/settings/fees` already has (doc 15 §6, Phase 6): a marketplace this
  // wizard (or a prior run of it) already saved fee settings for is shown with those values, and
  // does not force another "Kaydet" click just to satisfy `canProceed`.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        enabledMarketplaces.map(async (code) => {
          try {
            const res = await fetch(`/api/settings/fees?marketplaceCode=${code}`);
            if (!res.ok) return null;
            const data = (await res.json()) as { current: Omit<FeeForm, 'code' | 'title' | 'saved'> | null };
            return data.current ? { code, current: data.current } : null;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setForms((prev) =>
        prev.map((f) => {
          const hit = results.find((r) => r?.code === f.code);
          return hit ? { ...f, ...hit.current, savedByServer: true } : f;
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [enabledMarketplaces]);

  function update(code: FeeForm['code'], patch: Partial<FeeForm>) {
    // Any manual edit invalidates a server-sourced "already saved" badge — it must not survive a
    // change nobody re-saved.
    setForms((prev) => prev.map((f) => (f.code === code ? { ...f, ...patch, savedByServer: false } : f)));
  }

  function touch(code: string, key: string) {
    setTouched((prev) => new Set(prev).add(`${code}:${key}`));
  }

  function formErrors(form: FeeForm): string[] {
    const errs: string[] = [];
    if (percentError(form.commissionVatRate)) errs.push('commissionVatRate');
    if (percentError(form.defaultCommissionRate)) errs.push('defaultCommissionRate');
    form.cargoBands.forEach((b, i) => {
      if (amountError(b.edge, true)) errs.push(`cargo-edge-${i}`);
      if (amountError(b.amount, false)) errs.push(`cargo-amount-${i}`);
    });
    form.expenditureBands.forEach((b, i) => {
      if (amountError(b.edge, false)) errs.push(`exp-edge-${i}`);
      if (amountError(b.amount, false)) errs.push(`exp-amount-${i}`);
    });
    return errs;
  }

  function touchAll(form: FeeForm) {
    setTouched((prev) => {
      const next = new Set(prev);
      next.add(`${form.code}:commissionVatRate`);
      next.add(`${form.code}:defaultCommissionRate`);
      form.cargoBands.forEach((_, i) => {
        next.add(`cargo:${form.code}:edge:${i}`);
        next.add(`cargo:${form.code}:amount:${i}`);
      });
      form.expenditureBands.forEach((_, i) => {
        next.add(`exp:${form.code}:edge:${i}`);
        next.add(`exp:${form.code}:amount:${i}`);
      });
      return next;
    });
  }

  async function runPreview(form: FeeForm) {
    if (formErrors(form).length > 0) {
      touchAll(form);
      return;
    }
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
    if (formErrors(form).length > 0) {
      touchAll(form);
      return;
    }
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

  const canProceed = forms.every((f) => f.saved || f.savedByServer);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-(--color-muted)">
        Komisyon KDV oranı ve muamelesi, kargo bantları ve gider bantları (doc 02 §3). Kalıcı değerler
        mağazanızın gerçek sözleşme koşullarıyla eşleşmelidir — buradaki değerler başlangıç varsayımlarıdır ve
        Ayarlar ekranından daha sonra düzeltilebilir.
      </p>
      {forms.map((form) => (
        <div key={form.code} className="rounded border border-(--color-border) p-4">
          <h3 className="mb-3 font-semibold">{form.title}</h3>
          {form.savedByServer && (
            <StatusBanner
              ok
              message="Bu pazaryeri için ücret ayarları zaten kayıtlı — aşağıda gösteriliyor. Değiştirip yeniden kaydedebilirsiniz."
            />
          )}
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Field
              label="Komisyon KDV Oranı (%)"
              error={
                touched.has(`${form.code}:commissionVatRate`)
                  ? percentError(form.commissionVatRate)
                  : undefined
              }
            >
              <TextInput
                value={form.commissionVatRate}
                onChange={(e) => update(form.code, { commissionVatRate: e.target.value })}
                onBlur={() => touch(form.code, 'commissionVatRate')}
              />
            </Field>
            <Field
              label="Varsayılan Komisyon Oranı (%)"
              error={
                touched.has(`${form.code}:defaultCommissionRate`)
                  ? percentError(form.defaultCommissionRate)
                  : undefined
              }
            >
              <TextInput
                value={form.defaultCommissionRate}
                onChange={(e) => update(form.code, { defaultCommissionRate: e.target.value })}
                onBlur={() => touch(form.code, 'defaultCommissionRate')}
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
              Komisyon KDV&apos;si indirilebilir
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <BandEditor
              label="Kargo Bantları (üst fiyat sınırı, tutar)"
              edgeLabel="Üst sınır (boş = sınırsız)"
              bands={form.cargoBands}
              edgeAllowEmpty
              touchedPrefix={`cargo:${form.code}`}
              touched={touched}
              onTouch={(key) => setTouched((prev) => new Set(prev).add(key))}
              onChange={(bands) => update(form.code, { cargoBands: bands })}
            />
            <BandEditor
              label="Gider Bantları (alt fiyat sınırı, tutar)"
              edgeLabel="Alt sınır"
              bands={form.expenditureBands}
              edgeAllowEmpty={false}
              touchedPrefix={`exp:${form.code}`}
              touched={touched}
              onTouch={(key) => setTouched((prev) => new Set(prev).add(key))}
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
              {busyCode === form.code ? 'Hesaplanıyor…' : 'Dip Fiyat Önizle'}
            </Button>
            <Button type="button" onClick={() => void save(form)} disabled={busyCode === form.code}>
              {busyCode === form.code ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
          {preview[form.code] && <p className="mt-2 text-sm">{preview[form.code]}</p>}
          {form.saved && <StatusBanner ok message="Ücret ayarları kaydedildi." />}
        </div>
      ))}
      <StepStopNotice>
        Kaydetmeden çıkarsanız bu pazaryeri için ücret ayarı olmaz — dip fiyat hesaplanamaz ve o pazaryerinde
        fiyatlandırma çalışmaz. Sihirbaza döndüğünüzde, kaydettiğiniz pazaryerleri burada yeniden gösterilir;
        yalnızca kaydetmediğiniz kaldığı yerden devam eder.
      </StepStopNotice>
      <StepFooter onBack={onBack} onNext={onDone} nextDisabled={!canProceed} />
    </div>
  );
}
