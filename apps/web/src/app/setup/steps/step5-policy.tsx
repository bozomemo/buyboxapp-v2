'use client';

import { useEffect, useState } from 'react';
import { Button, Field, StatusBanner, StepFooter, StepStopNotice, TextInput } from '@/components/ui';

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
  /** Set when `/api/settings/policy` already had a row for this marketplace on mount. */
  savedByServer?: boolean;
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

// --- Field-level validation (doc 15 §6, Phase 6) -----------------------------------------------
//
// Every numeric field here used to be a bare `TextInput` feeding straight into `Number(...)` on
// save (`/api/setup/policy/save`'s `Number(body.soleSellerMarginPct)` etc.) — an invalid entry
// became `NaN` silently. These mirror that route's own arithmetic so an invalid value is caught
// before the request, not after.

function percentError(value: string): string | undefined {
  if (value.trim() === '') return 'Gerekli.';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Sayı olmalı.';
  if (n < 0 || n > 100) return '0 ile 100 arasında olmalı.';
  return undefined;
}

function positiveIntegerError(value: string): string | undefined {
  if (value.trim() === '') return 'Gerekli.';
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return 'Negatif olmayan bir tam sayı olmalı.';
  return undefined;
}

function amountError(value: string): string | undefined {
  if (value.trim() === '') return 'Gerekli.';
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 'Geçerli, negatif olmayan bir tutar olmalı (örn. 0.50).';
  return undefined;
}

interface FieldSpec {
  key: keyof PolicyForm;
  label: string;
  validate: (value: string) => string | undefined;
}

const NUMERIC_FIELDS: FieldSpec[] = [
  { key: 'coarseStepPercent', label: 'Kaba Adım (%)', validate: percentError },
  { key: 'refineTolerance', label: 'İnceltme Toleransı (₺)', validate: amountError },
  { key: 'soleSellerMarginPct', label: 'Tek Satıcı Marjı (%)', validate: percentError },
  { key: 'settleDurationMinutes', label: 'Yerleşme Süresi (dakika)', validate: positiveIntegerError },
  { key: 'pollIntervalMinutes', label: 'Sorgulama Aralığı (dakika)', validate: positiveIntegerError },
  { key: 'concurrency', label: 'Eşzamanlılık', validate: positiveIntegerError },
  { key: 'budgetReservePct', label: 'Günlük Bütçe Rezervi (%)', validate: percentError },
];

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
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Never re-ask what `/api/settings/policy` already has (doc 15 §6, Phase 6) — same pattern as
  // fees above.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        enabledMarketplaces.map(async (code) => {
          try {
            const res = await fetch(`/api/settings/policy?marketplaceCode=${code}`);
            if (!res.ok) return null;
            const data = (await res.json()) as {
              current:
                | (Omit<PolicyForm, 'code' | 'title' | 'saved' | 'savedByServer'> & { enabled: boolean })
                | null;
            };
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
          if (!hit?.current) return f;
          const { enabled: _enabled, ...rest } = hit.current;
          return { ...f, ...rest, savedByServer: true };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [enabledMarketplaces]);

  function update(code: PolicyForm['code'], patch: Partial<PolicyForm>) {
    setForms((prev) => prev.map((f) => (f.code === code ? { ...f, ...patch, savedByServer: false } : f)));
  }

  function touch(code: string, key: string) {
    setTouched((prev) => new Set(prev).add(`${code}:${key}`));
  }

  function formErrors(form: PolicyForm): boolean {
    return NUMERIC_FIELDS.some((spec) => spec.validate(String(form[spec.key])) !== undefined);
  }

  function touchAll(form: PolicyForm) {
    setTouched((prev) => {
      const next = new Set(prev);
      for (const spec of NUMERIC_FIELDS) next.add(`${form.code}:${spec.key}`);
      return next;
    });
  }

  async function save(form: PolicyForm) {
    if (formErrors(form)) {
      touchAll(form);
      return;
    }
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

  const canProceed = forms.every((f) => f.saved || f.savedByServer);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-(--color-muted)">
        Fiyatlandırma motoru politikası (doc 03 §3). Otomasyon bu adımda kapalı kaydedilir — kurulum bittikten
        sonra Panel'den pazaryeri bazında bilinçli olarak açarsınız (doc 10 §6, adım 8).
      </p>
      {forms.map((form) => (
        <div key={form.code} className="rounded border border-(--color-border) p-4">
          <h3 className="mb-3 font-semibold">{form.title}</h3>
          {form.savedByServer && (
            <StatusBanner
              ok
              message="Bu pazaryeri için politika zaten kayıtlı — aşağıda gösteriliyor. Değiştirip yeniden kaydedebilirsiniz."
            />
          )}
          <div className="mt-3 grid grid-cols-2 gap-4">
            {/* Sabit-tutar modu Ayarlar ekranından (6.10) yapılandırılır — sihirbaz kasıtlı
                olarak yalnızca yüzde modunu sunar, ölçülemeyen bir "0 tutar" adımı kaydedip
                fiyatları sessizce donduran bir kurulum hatasını önlemek için. */}
            {NUMERIC_FIELDS.map((spec) => (
              <Field
                key={spec.key}
                label={spec.label}
                error={
                  touched.has(`${form.code}:${spec.key}`) ? spec.validate(String(form[spec.key])) : undefined
                }
              >
                <TextInput
                  value={String(form[spec.key])}
                  onChange={(e) =>
                    update(form.code, { [spec.key]: e.target.value } as unknown as Partial<PolicyForm>)
                  }
                  onBlur={() => touch(form.code, spec.key)}
                />
              </Field>
            ))}
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
              {busyCode === form.code ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
          {form.saved && <StatusBanner ok message="Politika kaydedildi (otomasyon kapalı)." />}
        </div>
      ))}
      <StepStopNotice>
        Kaydetmeden çıkarsanız bu pazaryeri için fiyatlandırma politikası olmaz ve otomasyon Panel'den
        açılamaz. Sihirbaza döndüğünüzde daha önce kaydettiğiniz pazaryerleri burada yeniden gösterilir.
      </StepStopNotice>
      <StepFooter onBack={onBack} onNext={onDone} nextDisabled={!canProceed} />
    </div>
  );
}
