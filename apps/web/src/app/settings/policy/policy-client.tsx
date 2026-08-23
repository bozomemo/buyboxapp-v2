'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/format';
import { Button, Field, StatusBanner, TextInput } from '../../setup/ui';

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
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    setSaved(false);
    setPreview(null);
    fetch(`/api/settings/policy?marketplaceCode=${marketplaceCode}`)
      .then((r) => r.json())
      .then((data: { current: Form | null }) => setForm(data.current ?? EMPTY))
      .catch(() => undefined);
  }, [marketplaceCode]);

  function update(patch: Partial<Form>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings/policy/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: marketplaceCode, ...form }),
      });
      setSaved(res.ok);
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
        <div className="grid grid-cols-2 gap-4">
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
          <Field label="Tek Satıcı Marjı (%)">
            <TextInput
              value={form.soleSellerMarginPct}
              onChange={(e) => update({ soleSellerMarginPct: e.target.value })}
            />
          </Field>
          <Field label="Yerleşme Süresi (dakika)">
            <TextInput
              value={form.settleDurationMinutes}
              onChange={(e) => update({ settleDurationMinutes: e.target.value })}
            />
          </Field>
          <Field label="Sorgulama Aralığı (dakika)">
            <TextInput
              value={form.pollIntervalMinutes}
              onChange={(e) => update({ pollIntervalMinutes: e.target.value })}
            />
          </Field>
          <Field label="Eşzamanlılık">
            <TextInput value={form.concurrency} onChange={(e) => update({ concurrency: e.target.value })} />
          </Field>
          <Field label="Günlük Bütçe Rezervi (%)">
            <TextInput
              value={form.budgetReservePct}
              onChange={(e) => update({ budgetReservePct: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.lowStockGuardEnabled}
              onChange={(e) => update({ lowStockGuardEnabled: e.target.checked })}
            />
            Düşük stok koruması etkin
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            Otomasyon etkin (bu pazaryerinde otomatik fiyatlandırma çalışsın)
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="secondary" type="button" onClick={() => void runPreviewImpact()} disabled={busy}>
            Etkiyi Önizle
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy}>
            Kaydet
          </Button>
        </div>
        {saved && <StatusBanner ok message="Politika kaydedildi." />}
        {previewError && <p className="mt-2 text-sm text-(--color-danger)">{previewError}</p>}
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
                      <td className="py-1">{s.reason}</td>
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
