'use client';

import { useState } from 'react';
import { Button, Field, StatusBanner, StepFooter, TextInput } from '../ui';

interface PolicyForm {
  code: 'trendyol' | 'hepsiburada';
  title: string;
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
  saved?: boolean;
}

function initialForm(code: 'trendyol' | 'hepsiburada', title: string): PolicyForm {
  return {
    code,
    title,
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
  };
}

const ALL_TITLES: Record<'trendyol' | 'hepsiburada', string> = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
};

export function Step5Policy({
  enabledMarketplaces,
  onDone,
  onBack,
}: {
  enabledMarketplaces: ('trendyol' | 'hepsiburada')[];
  onDone: () => void;
  onBack: () => void;
}) {
  const [forms, setForms] = useState<PolicyForm[]>(() =>
    enabledMarketplaces.map((code) => initialForm(code, ALL_TITLES[code])),
  );
  const [busyCode, setBusyCode] = useState<string | undefined>();

  function update(code: PolicyForm['code'], patch: Partial<PolicyForm>) {
    setForms((prev) => prev.map((f) => (f.code === code ? { ...f, ...patch } : f)));
  }

  async function save(form: PolicyForm) {
    setBusyCode(form.code);
    try {
      const res = await fetch('/api/setup/policy/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
        Fiyatlandırma motoru politikası (doc 03 §3). Otomasyon bu adımda kapalı kaydedilir — kurulum bittikten
        sonra Panel'den pazaryeri bazında bilinçli olarak açarsınız (doc 10 §6, adım 8).
      </p>
      {forms.map((form) => (
        <div key={form.code} className="rounded border border-[var(--color-border)] p-4">
          <h3 className="mb-3 font-semibold">{form.title}</h3>
          <div className="grid grid-cols-2 gap-4">
            {/* Sabit-tutar modu Ayarlar ekranından (6.10) yapılandırılır — sihirbaz kasıtlı
                olarak yalnızca yüzde modunu sunar, ölçülemeyen bir "0 tutar" adımı kaydedip
                fiyatları sessizce donduran bir kurulum hatasını önlemek için. */}
            <Field label="Kaba Adım (%)">
              <TextInput
                value={form.coarseStepPercent}
                onChange={(e) => update(form.code, { coarseStepPercent: e.target.value })}
              />
            </Field>
            <Field label="İnceltme Toleransı (₺)">
              <TextInput
                value={form.refineTolerance}
                onChange={(e) => update(form.code, { refineTolerance: e.target.value })}
              />
            </Field>
            <Field label="Tek Satıcı Marjı (%)">
              <TextInput
                value={form.soleSellerMarginPct}
                onChange={(e) => update(form.code, { soleSellerMarginPct: e.target.value })}
              />
            </Field>
            <Field label="Yerleşme Süresi (dakika)">
              <TextInput
                value={form.settleDurationMinutes}
                onChange={(e) => update(form.code, { settleDurationMinutes: e.target.value })}
              />
            </Field>
            <Field label="Sorgulama Aralığı (dakika)">
              <TextInput
                value={form.pollIntervalMinutes}
                onChange={(e) => update(form.code, { pollIntervalMinutes: e.target.value })}
              />
            </Field>
            <Field label="Eşzamanlılık">
              <TextInput
                value={form.concurrency}
                onChange={(e) => update(form.code, { concurrency: e.target.value })}
              />
            </Field>
            <Field label="Günlük Bütçe Rezervi (%)">
              <TextInput
                value={form.budgetReservePct}
                onChange={(e) => update(form.code, { budgetReservePct: e.target.value })}
              />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.lowStockGuardEnabled}
              onChange={(e) => update(form.code, { lowStockGuardEnabled: e.target.checked })}
            />
            Düşük stok koruması etkin
          </label>

          <div className="mt-4">
            <Button type="button" onClick={() => void save(form)} disabled={busyCode === form.code}>
              Kaydet
            </Button>
          </div>
          {form.saved && <StatusBanner ok message="Politika kaydedildi (otomasyon kapalı)." />}
        </div>
      ))}
      <StepFooter onBack={onBack} onNext={onDone} nextDisabled={!canProceed} />
    </div>
  );
}
