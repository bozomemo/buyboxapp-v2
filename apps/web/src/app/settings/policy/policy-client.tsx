'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/format';
import { DECISION_REASON_LABELS, labelOf } from '@/lib/labels';
import {
  Button,
  ConfirmButton,
  ErrorState,
  Field,
  LoadingState,
  Section,
  Select,
  StatusBanner,
  TextInput,
} from '@/components/ui';

interface Form {
  coarseStepMode: 'absolute' | 'percent';
  coarseStepPercent: string;
  refineTolerance: string;
  seekStrategy: 'direct' | 'stepped';
  undercutBy: string;
  seekStep: string;
  soleSellerMarginPct: string;
  lowStockGuardEnabled: boolean;
  lowStockThreshold: string;
  lowStockMarginPct: string;
  stockMode: 'respectStock' | 'ignoreStock';
  minPhysicalStock: string;
  settleDurationMinutes: string;
  competitorPriceDelta: string;
  pollIntervalMinutes: string;
  concurrency: string;
  budgetReservePct: string;
  enabled: boolean;
}

const EMPTY: Form = {
  coarseStepMode: 'percent',
  coarseStepPercent: '5',
  refineTolerance: '0.50',
  seekStrategy: 'direct',
  undercutBy: '0.10',
  seekStep: '1.00',
  soleSellerMarginPct: '10',
  lowStockGuardEnabled: false,
  lowStockThreshold: '3',
  lowStockMarginPct: '5',
  stockMode: 'ignoreStock',
  minPhysicalStock: '0',
  settleDurationMinutes: '1',
  competitorPriceDelta: '0.10',
  pollIntervalMinutes: '5',
  concurrency: '1',
  budgetReservePct: '20',
  enabled: false,
};

const MARKETPLACE_OPTIONS = [
  { value: 'trendyol', label: 'Trendyol' },
  { value: 'hepsiburada', label: 'Hepsiburada' },
];

// Local option lists for this screen's own selects — same shape as `fees-client.tsx`'s
// `MARKETPLACE_OPTIONS`, not a `*_LABELS: Record` map (doc 15 §1b targets shared cross-screen
// enum vocabulary; these three are specific to how one form field is edited).
const COARSE_STEP_MODE_OPTIONS = [
  { value: 'percent', label: 'Yüzde' },
  { value: 'absolute', label: 'Sabit tutar' },
];

const SEEK_STRATEGY_OPTIONS = [
  { value: 'direct', label: 'Doğrudan (önerilen)' },
  { value: 'stepped', label: 'Kademeli' },
];

const STOCK_MODE_OPTIONS = [
  { value: 'ignoreStock', label: 'Stoğu yok say' },
  { value: 'respectStock', label: 'Fiziksel stoğu dikkate al' },
];

interface PreviewResult {
  totalListings: number;
  changed: number;
  unchanged: number;
  skipped: number;
  averageDeltaKurus: number;
  sample: { listingId: string; productName: string; oldPrice: string; newPrice: string; reason: string }[];
}

export function PolicyClient() {
  const [marketplaceCode, setMarketplaceCode] = useState<'trendyol' | 'hepsiburada'>('trendyol');
  const [form, setForm] = useState<Form>(EMPTY);
  const [hasCurrent, setHasCurrent] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // §3.2: the primary load's own failure, kept apart from the form so a failed refetch over an
  // already-loaded screen reads as "stale, refresh failed" rather than wiping mid-edit work —
  // same shape as `fees-client.tsx`.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch(`/api/settings/policy?marketplaceCode=${marketplaceCode}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Politika yüklenemedi (HTTP ${r.status}).`))))
      .then((data: { current: Form | null }) => {
        setForm(data.current ?? EMPTY);
        setHasCurrent(data.current !== null);
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
    setPreviewError(null);
    load();
    // (No `exhaustive-deps` disable directive: this repo's eslint config carries no react-hooks
    // plugin, so naming that rule is itself an error — see `eslint.config.js`, same as fees-client.tsx.)
  }, [marketplaceCode]);

  function update(patch: Partial<Form>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    setSaveError(null);
    try {
      const res = await fetch('/api/settings/policy/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: marketplaceCode, ...form }),
      });
      if (!res.ok) {
        setSaveError(`Kaydedilemedi (HTTP ${res.status}).`);
        return;
      }
      setSaved(true);
      setHasCurrent(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runPreviewImpact() {
    setBusy(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const feesRes = await fetch(`/api/settings/fees?marketplaceCode=${marketplaceCode}`);
      const feesData = (await feesRes.json()) as { current: Record<string, unknown> | null };
      if (!feesData.current) {
        setPreviewError('Önce bu pazaryeri için ücret ayarlarını kaydedin.');
        return;
      }
      const res = await fetch('/api/settings/preview-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fees: { ...feesData.current, marketplaceCode },
          policy: form,
        }),
      });
      const data = (await res.json()) as PreviewResult & { error?: string };
      if (!res.ok || data.error) {
        setPreviewError(data.error ?? 'Önizleme hesaplanamadı.');
        return;
      }
      setPreview(data);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
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
    return <LoadingState message="Politika yükleniyor…" skeletonRows={4} />;
  }

  const marketplaceLabel =
    MARKETPLACE_OPTIONS.find((o) => o.value === marketplaceCode)?.label ?? marketplaceCode;

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
          screen — say so rather than letting it silently go stale (same pattern as
          fees-client.tsx). */}
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

      <div className="flex items-center justify-between rounded border border-(--color-border) bg-(--color-surface) p-4">
        <div>
          <p className="text-sm font-semibold">Otomasyon</p>
          <p className="text-xs text-(--color-muted)">
            Açıkken {marketplaceLabel} için fiyatlar bu politikaya göre otomatik gönderilir.
          </p>
        </div>
        {/* §3.6: turning automation ON creates risk (live price submission) and is confirmed;
            turning it OFF removes risk and is one click — never the reverse. */}
        <ConfirmButton
          requireConfirm={!form.enabled}
          confirmMessage={`${marketplaceLabel} için otomatik fiyatlandırmayı açmak istiyorsunuz. Bu andan itibaren fiyatlar otomatik gönderilecek. Devam edilsin mi?`}
          onConfirmed={() => update({ enabled: !form.enabled })}
          aria-pressed={form.enabled}
          className={`rounded px-4 py-2 text-sm font-semibold ${
            form.enabled
              ? 'bg-(--color-success-bg) text-(--color-success)'
              : 'border border-(--color-border) bg-(--color-surface) text-(--color-muted)'
          }`}
        >
          {form.enabled ? 'Açık' : 'Kapalı'}
        </ConfirmButton>
      </div>

      {!hasCurrent && (
        <p className="rounded border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs text-(--color-muted)">
          Bu pazaryeri için henüz kaydedilmiş bir politika yok — aşağıda varsayılan değerler gösteriliyor.
          Kaydettiğinizde bu pazaryeri için politika oluşturulur.
        </p>
      )}

      <div className="rounded border border-(--color-border) p-4">
        <div className="flex flex-col gap-6">
          <Section id="policy-strateji" title="Strateji">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Kaba Adım Türü">
                <Select
                  options={COARSE_STEP_MODE_OPTIONS}
                  value={form.coarseStepMode}
                  onChange={(e) => update({ coarseStepMode: e.target.value as Form['coarseStepMode'] })}
                />
              </Field>
              <Field label="Kaba Adım (%)">
                <TextInput
                  value={form.coarseStepPercent}
                  onChange={(e) => update({ coarseStepPercent: e.target.value })}
                />
              </Field>
              <Field label="İnceltme Toleransı (₺)">
                <TextInput
                  value={form.refineTolerance}
                  onChange={(e) => update({ refineTolerance: e.target.value })}
                />
              </Field>
              <Field label="Arama Stratejisi">
                <Select
                  options={SEEK_STRATEGY_OPTIONS}
                  value={form.seekStrategy}
                  onChange={(e) => update({ seekStrategy: e.target.value as Form['seekStrategy'] })}
                />
              </Field>
              <Field label="Buybox'ın Altına İnme Tutarı (₺)">
                <TextInput value={form.undercutBy} onChange={(e) => update({ undercutBy: e.target.value })} />
              </Field>
              <Field label="Kademeli Arama Adımı (₺)">
                <TextInput value={form.seekStep} onChange={(e) => update({ seekStep: e.target.value })} />
              </Field>
              <Field label="Tek Satıcı Marjı (%)">
                <TextInput
                  value={form.soleSellerMarginPct}
                  onChange={(e) => update({ soleSellerMarginPct: e.target.value })}
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-(--color-muted)">
              Kademeli arama adımı yalnızca arama stratejisi &quot;Kademeli&quot; iken kullanılır.
            </p>
          </Section>

          <Section id="policy-kar-koruma" title="Kâr Koruma">
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.lowStockGuardEnabled}
                onChange={(e) => update({ lowStockGuardEnabled: e.target.checked })}
              />
              Düşük stok koruması etkin
            </label>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Düşük Stok Eşiği (adet)">
                <TextInput
                  value={form.lowStockThreshold}
                  onChange={(e) => update({ lowStockThreshold: e.target.value })}
                  disabled={!form.lowStockGuardEnabled}
                />
              </Field>
              <Field label="Düşük Stok İçin Ek Marj (%)">
                <TextInput
                  value={form.lowStockMarginPct}
                  onChange={(e) => update({ lowStockMarginPct: e.target.value })}
                  disabled={!form.lowStockGuardEnabled}
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-(--color-muted)">
              Rakibin stoğu bu eşiğin altındaysa, onunla rekabet etmek için ek marj istenir.
            </p>
          </Section>

          <Section id="policy-stok" title="Stok">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Stok Modu">
                <Select
                  options={STOCK_MODE_OPTIONS}
                  value={form.stockMode}
                  onChange={(e) => update({ stockMode: e.target.value as Form['stockMode'] })}
                />
              </Field>
              <Field label="Minimum Fiziksel Stok (adet)">
                <TextInput
                  value={form.minPhysicalStock}
                  onChange={(e) => update({ minPhysicalStock: e.target.value })}
                  disabled={form.stockMode !== 'respectStock'}
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-(--color-muted)">
              Minimum fiziksel stok yalnızca stok modu &quot;Fiziksel stoğu dikkate al&quot; iken kullanılır.
            </p>
          </Section>

          <Section id="policy-hiz-butce" title="Hız ve Bütçe">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Yerleşme Süresi (dakika)">
                <TextInput
                  value={form.settleDurationMinutes}
                  onChange={(e) => update({ settleDurationMinutes: e.target.value })}
                />
              </Field>
              <Field label="Rakip Fiyat Değişim Eşiği (₺)">
                <TextInput
                  value={form.competitorPriceDelta}
                  onChange={(e) => update({ competitorPriceDelta: e.target.value })}
                />
              </Field>
              <Field label="Sorgulama Aralığı (dakika)">
                <TextInput
                  value={form.pollIntervalMinutes}
                  onChange={(e) => update({ pollIntervalMinutes: e.target.value })}
                />
              </Field>
              <Field label="Eşzamanlılık">
                <TextInput
                  value={form.concurrency}
                  onChange={(e) => update({ concurrency: e.target.value })}
                />
              </Field>
              <Field label="Günlük Bütçe Rezervi (%)">
                <TextInput
                  value={form.budgetReservePct}
                  onChange={(e) => update({ budgetReservePct: e.target.value })}
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-(--color-muted)">
              Rakip fiyatındaki bu tutardan küçük değişiklikler yeniden fiyatlandırmayı tetiklemez.
            </p>
          </Section>
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="secondary" type="button" onClick={() => void runPreviewImpact()} disabled={busy}>
            {busy ? 'Hesaplanıyor…' : 'Etkiyi Önizle'}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
        {saved && <StatusBanner ok message="Politika kaydedildi." />}
        {saveError && <StatusBanner ok={false} message={saveError} />}
        {previewError && <StatusBanner ok={false} message={previewError} />}
        {preview && (
          <div className="mt-4 rounded border border-(--color-border) p-3">
            <p className="text-sm">
              <strong>{preview.changed}</strong> ilan fiyat değiştirir, <strong>{preview.unchanged}</strong>{' '}
              ilan değişmez{preview.skipped > 0 ? `, ${preview.skipped} ilan hesaplanamadı (eksik veri)` : ''}{' '}
              — {preview.totalListings} ilan üzerinden, mevcut katalog ve bu (henüz kaydedilmemiş) politikayla
              gölgede çalıştırılarak hesaplandı.
            </p>
            {preview.changed > 0 && (
              <p className="mt-1 text-sm text-(--color-muted)">
                Ortalama değişim: {formatMoney(BigInt(Math.round(preview.averageDeltaKurus)))}
              </p>
            )}
            {preview.sample.length > 0 && (
              <div className="mt-3 max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-(--color-muted)">
                    <tr>
                      <th className="py-1">Ürün</th>
                      <th className="py-1">Eski</th>
                      <th className="py-1">Yeni</th>
                      <th className="py-1">Sebep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((s) => (
                      <tr key={s.listingId} className="border-t border-(--color-border)">
                        <td className="py-1">{s.productName}</td>
                        <td className="py-1">{formatMoney(BigInt(s.oldPrice))}</td>
                        <td className="py-1">{formatMoney(BigInt(s.newPrice))}</td>
                        <td className="py-1">{labelOf(DECISION_REASON_LABELS, s.reason)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
