'use client';

import { useEffect, useState } from 'react';
import { Pagination, usePagedRows } from '@/components/table';
import { formatDate } from '@/lib/format';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Section,
  Select,
  StatusBanner,
  TextInput,
} from '@/components/ui';

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

const MARKETPLACE_OPTIONS = [
  { value: 'trendyol', label: 'Trendyol' },
  { value: 'hepsiburada', label: 'Hepsiburada' },
];

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
  const [hasCurrent, setHasCurrent] = useState(true);
  const [history, setHistory] = useState<
    { id: string; effectiveFrom: number; defaultCommissionRate: number }[]
  >([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // §3.2: the primary load's own failure, kept apart from the form so a failed refetch over an
  // already-loaded screen reads as "stale, refresh failed" rather than wiping the form the
  // operator may already be mid-edit on.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // One row per fee revision — short today, unbounded over the life of the store.
  const pagedHistory = usePagedRows(history, { pageSize: 25, resetKey: marketplaceCode });

  function load() {
    setLoading(true);
    fetch(`/api/settings/fees?marketplaceCode=${marketplaceCode}`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`Ücret ayarları yüklenemedi (HTTP ${r.status}).`)),
      )
      .then((data: { current: Form | null; history: typeof history }) => {
        setForm(data.current ?? EMPTY);
        setHasCurrent(data.current !== null);
        setHistory(data.history);
        setLoadError(null);
        setHasLoadedOnce(true);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setSaved(false);
    setSaveError(null);
    setPreview(null);
    setPreviewFailed(false);
    load();
    // (No `exhaustive-deps` disable directive: this repo's eslint config carries no react-hooks
    // plugin, so naming that rule is itself an error — see `eslint.config.js`.)
  }, [marketplaceCode]);

  function update(patch: Partial<Form>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function runPreview() {
    setBusy(true);
    setPreviewFailed(false);
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
      if (data.ok) {
        setPreview(`100,00 ₺ maliyetli, %20 KDV'li bir ürün için dip fiyat: ${data.floorPrice}`);
      } else {
        setPreviewFailed(true);
        setPreview(data.error ?? 'Hesaplanamadı.');
      }
    } catch (e) {
      setPreviewFailed(true);
      setPreview(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    setSaveError(null);
    try {
      const res = await fetch('/api/settings/fees/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(marketplaceCode, form)),
      });
      if (!res.ok) {
        setSaveError(`Kaydedilemedi (HTTP ${res.status}).`);
        return;
      }
      setSaved(true);
      setHasCurrent(true);
      const data = (await (await fetch(`/api/settings/fees?marketplaceCode=${marketplaceCode}`)).json()) as {
        history: typeof history;
      };
      setHistory(data.history);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // §3.2: a first load that has never succeeded owns the whole screen — there is no form to show
  // yet, so there is nothing useful to render beside it.
  if (!hasLoadedOnce && loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }
  if (!hasLoadedOnce) {
    return <LoadingState message="Ücret ayarları yükleniyor…" skeletonRows={3} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Field label="Pazaryeri">
        <Select
          className="w-48"
          options={MARKETPLACE_OPTIONS}
          value={marketplaceCode}
          onChange={(e) => setMarketplaceCode(e.target.value as 'trendyol' | 'hepsiburada')}
        />
      </Field>

      {/* §3.2 "Stale": a later marketplace switch failed but the previous form is still on
          screen — say so rather than letting it silently go stale. */}
      {loadError && (
        <p
          role="alert"
          className="rounded border border-(--color-warning-border) bg-(--color-warning-bg) px-3 py-2 text-sm"
        >
          Son yenileme başarısız oldu ({loadError}). Aşağıdaki değerler bu pazaryeri için güncel olmayabilir.
        </p>
      )}
      {loading && !loadError && (
        <p aria-live="polite" className="text-xs text-(--color-muted)">
          Güncelleniyor…
        </p>
      )}

      <Section id="fees-form" title="Ücret Ayarları">
        <div className="rounded border border-(--color-border) p-4">
          <p className="mb-3 text-xs text-(--color-muted)">
            Kaydettiğinizde yeni bir satır, şimdiki zamanla etkin olarak eklenir (doc 05 §2) — geçmiş fiyat
            kararları hep o anda geçerli olan değerlerle açıklanabilir kalır, eski satır asla değiştirilmez.
          </p>
          {!hasCurrent && (
            <p className="mb-3 rounded border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs text-(--color-muted)">
              Bu pazaryeri için henüz kaydedilmiş bir ücret ayarı yok — aşağıda varsayılan değerler
              gösteriliyor. Kaydettiğinizde bu pazaryeri için ilk etkin satır oluşur.
            </p>
          )}

          <div className="flex flex-col gap-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-(--color-muted)">
                Komisyon
              </h3>
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
                  Komisyon KDV&apos;si indirilebilir
                </label>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-(--color-muted)">
                Kargo
              </h3>
              <BandEditor
                label="Kargo Bantları (üst fiyat sınırı, tutar)"
                edgeLabel="Üst sınır (boş = sınırsız)"
                bands={form.cargoBands}
                onChange={(bands) => update({ cargoBands: bands })}
              />
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-(--color-muted)">
                Gider Payı
              </h3>
              <BandEditor
                label="Gider Bantları (alt fiyat sınırı, tutar)"
                edgeLabel="Alt sınır"
                bands={form.expenditureBands}
                onChange={(bands) => update({ expenditureBands: bands })}
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button variant="secondary" type="button" onClick={() => void runPreview()} disabled={busy}>
              {busy ? 'Hesaplanıyor…' : 'Dip Fiyat Önizle'}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={busy}>
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
          {preview && (
            <p aria-live="polite" className={`mt-2 text-sm ${previewFailed ? 'text-(--color-danger)' : ''}`}>
              {preview}
            </p>
          )}
          {saved && <StatusBanner ok message="Ücret ayarları kaydedildi." />}
          {saveError && <StatusBanner ok={false} message={saveError} />}
        </div>
      </Section>

      <Section id="fees-history" title="Geçmiş">
        {history.length === 0 ? (
          <EmptyState
            message="Bu pazaryeri için henüz kaydedilmiş bir ücret geçmişi yok."
            reason="Ücret ayarlarını kaydettiğinizde, o andan itibaren etkin ilk satır burada listelenir."
          />
        ) : (
          <>
            <ul className="table-frame max-h-[50vh] divide-y divide-(--color-border) rounded border border-(--color-border) text-sm">
              {pagedHistory.rows.map((h) => (
                <li key={h.id} className="flex justify-between px-3 py-2">
                  <span>{formatDate(h.effectiveFrom)}</span>
                  <span className="text-(--color-muted)">Komisyon: %{h.defaultCommissionRate}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <Pagination state={pagedHistory} label="kayıt" />
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
