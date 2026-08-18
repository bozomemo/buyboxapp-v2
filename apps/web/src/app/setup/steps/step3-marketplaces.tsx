'use client';

import { useState } from 'react';
import { Button, Field, Select, StatusBanner, StepFooter, TextInput } from '../ui';

interface MarketplaceForm {
  code: 'trendyol' | 'hepsiburada';
  title: string;
  enabled: boolean;
  credentials: Record<string, string>;
  testResult?: { ok: boolean; message: string };
  saved?: boolean;
}

const CREDENTIAL_FIELDS: Record<MarketplaceForm['code'], { key: string; label: string }[]> = {
  trendyol: [
    { key: 'apiKey', label: 'API Anahtarı' },
    { key: 'apiSecret', label: 'API Gizli Anahtarı' },
    { key: 'sellerId', label: 'Satıcı Kimliği (sellerId)' },
    { key: 'userAgentSuffix', label: 'User-Agent Eki (opsiyonel)' },
  ],
  hepsiburada: [
    { key: 'username', label: 'Mağaza Kullanıcı Adı' },
    { key: 'password', label: 'Şifre' },
    { key: 'merchantId', label: 'Merchant ID' },
  ],
};

/**
 * Environment lives inside the same credentials record that already goes straight to the
 * secret store (never the DB) — no schema change needed. The worker's `buildAdapter` and the
 * connection-test route both read `credentials.environment` off the raw object.
 */
const ENV_OPTIONS: Record<MarketplaceForm['code'], { value: string; label: string }[]> = {
  trendyol: [
    { value: 'production', label: 'Prod (apigw.trendyol.com)' },
    { value: 'stage', label: 'Test (stageapigw.trendyol.com)' },
  ],
  hepsiburada: [
    { value: 'production', label: 'Prod' },
    { value: 'sit', label: 'Test (SIT)' },
  ],
};

const INITIAL: MarketplaceForm[] = [
  { code: 'trendyol', title: 'Trendyol', enabled: true, credentials: {} },
  { code: 'hepsiburada', title: 'Hepsiburada', enabled: false, credentials: {} },
];

export function Step3Marketplaces({
  onDone,
  onBack,
}: {
  onDone: (enabledCodes: ('trendyol' | 'hepsiburada')[]) => void;
  onBack: () => void;
}) {
  const [forms, setForms] = useState<MarketplaceForm[]>(INITIAL);
  const [busyCode, setBusyCode] = useState<string | undefined>();

  function update(code: MarketplaceForm['code'], patch: Partial<MarketplaceForm>) {
    setForms((prev) => prev.map((f) => (f.code === code ? { ...f, ...patch } : f)));
  }

  async function test(form: MarketplaceForm) {
    setBusyCode(form.code);
    try {
      const res = await fetch('/api/setup/marketplace/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceCode: form.code, credentials: form.credentials }),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      update(form.code, { testResult: data });
    } finally {
      setBusyCode(undefined);
    }
  }

  async function save(form: MarketplaceForm) {
    setBusyCode(form.code);
    try {
      const res = await fetch('/api/setup/marketplace/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      update(form.code, { saved: res.ok });
    } finally {
      setBusyCode(undefined);
    }
  }

  const canProceed = forms.every((f) => !f.enabled || f.saved);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--color-muted)]">
        Her pazaryeri için bilgileri girin ve "Bağlantıyı Test Et" ile gerçek bir okuma çağrısı yapıp dönen
        sonucu doğrulayın, ardından kaydedin. Devre dışı bıraktığınız pazaryerleri atlanır.
      </p>
      {forms.map((form) => (
        <div key={form.code} className="rounded border border-[var(--color-border)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">{form.title}</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => update(form.code, { enabled: e.target.checked })}
              />
              Etkin
            </label>
          </div>

          {form.enabled && (
            <div className="flex flex-col gap-3">
              {/* Deliberately not asked for: it is the seller id already entered below, and a
                  second copy is free to drift from the first — silently, because nothing errors
                  when it is wrong; our own store simply starts counting as a competitor. */}
              <Field label="Ortam (Environment)">
                <Select
                  options={ENV_OPTIONS[form.code]}
                  value={form.credentials.environment ?? 'production'}
                  onChange={(e) =>
                    update(form.code, { credentials: { ...form.credentials, environment: e.target.value } })
                  }
                />
              </Field>
              {CREDENTIAL_FIELDS[form.code].map((f) => (
                <Field key={f.key} label={f.label}>
                  <TextInput
                    type={
                      f.key.toLowerCase().includes('secret') || f.key === 'password' ? 'password' : 'text'
                    }
                    value={form.credentials[f.key] ?? ''}
                    onChange={(e) =>
                      update(form.code, { credentials: { ...form.credentials, [f.key]: e.target.value } })
                    }
                  />
                </Field>
              ))}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => void test(form)}
                  disabled={busyCode === form.code}
                >
                  Bağlantıyı Test Et
                </Button>
                <Button type="button" onClick={() => void save(form)} disabled={busyCode === form.code}>
                  Kaydet
                </Button>
              </div>
              {form.testResult && <StatusBanner ok={form.testResult.ok} message={form.testResult.message} />}
              {form.saved && <StatusBanner ok message="Kimlik bilgileri şifreli olarak kaydedildi." />}
            </div>
          )}
        </div>
      ))}
      <StepFooter
        onBack={onBack}
        onNext={() => onDone(forms.filter((f) => f.enabled).map((f) => f.code))}
        nextDisabled={!canProceed}
      />
    </div>
  );
}
