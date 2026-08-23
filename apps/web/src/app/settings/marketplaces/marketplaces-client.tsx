'use client';

import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { Button, Field, Select, StatusBanner, TextInput } from '../../setup/ui';

interface MarketplaceRow {
  code: string;
  displayName: string;
  enabled: boolean;
  merchantRef: string | null;
  updatedAt: number;
}

interface Form {
  code: 'trendyol' | 'hepsiburada';
  title: string;
  enabled: boolean;
  merchantRef: string;
  credentials: Record<string, string>;
  updatedAt?: number;
  testResult?: { ok: boolean; message: string };
  saved?: boolean;
}

const CREDENTIAL_FIELDS: Record<Form['code'], { key: string; label: string }[]> = {
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

const TITLES: Record<Form['code'], string> = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada' };

/**
 * Environment lives inside the same credentials record that already goes straight to the
 * secret store (never the DB) — no schema change needed. The worker's `buildAdapter` and the
 * connection-test route both read `credentials.environment` off the raw object.
 */
const ENV_OPTIONS: Record<Form['code'], { value: string; label: string }[]> = {
  trendyol: [
    { value: 'production', label: 'Prod (apigw.trendyol.com)' },
    { value: 'stage', label: 'Test (stageapigw.trendyol.com)' },
  ],
  hepsiburada: [
    { value: 'production', label: 'Prod' },
    { value: 'sit', label: 'Test (SIT)' },
  ],
};

export function MarketplacesClient() {
  const [forms, setForms] = useState<Form[]>([
    { code: 'trendyol', title: 'Trendyol', enabled: false, merchantRef: '', credentials: {} },
    { code: 'hepsiburada', title: 'Hepsiburada', enabled: false, merchantRef: '', credentials: {} },
  ]);
  const [busyCode, setBusyCode] = useState<string | undefined>();

  useEffect(() => {
    fetch('/api/settings/marketplaces')
      .then((r) => r.json())
      .then((data: { marketplaces: MarketplaceRow[] }) => {
        setForms((prev) =>
          prev.map((f) => {
            const existing = data.marketplaces.find((m) => m.code === f.code);
            return existing
              ? {
                  ...f,
                  enabled: existing.enabled,
                  merchantRef: existing.merchantRef ?? '',
                  updatedAt: existing.updatedAt,
                }
              : f;
          }),
        );
      })
      .catch(() => undefined);
  }, []);

  function update(code: Form['code'], patch: Partial<Form>) {
    setForms((prev) => prev.map((f) => (f.code === code ? { ...f, ...patch } : f)));
  }

  async function test(form: Form) {
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

  async function save(form: Form) {
    setBusyCode(form.code);
    try {
      const res = await fetch('/api/settings/marketplaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          enabled: form.enabled,
          credentials: form.credentials,
        }),
      });
      update(form.code, { saved: res.ok, credentials: {} });
    } finally {
      setBusyCode(undefined);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {forms.map((form) => (
        <div key={form.code} className="rounded border border-(--color-border) p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">{TITLES[form.code]}</h3>
            <div className="flex items-center gap-3">
              {form.updatedAt && (
                <span className="text-xs text-(--color-muted)">
                  Son güncelleme: {formatDateTime(form.updatedAt)}
                </span>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => update(form.code, { enabled: e.target.checked })}
                />
                Etkin
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {/* Derived, not entered. It used to be a text field, which made it a second copy of
                the seller id already in the credentials — free to drift from it, and silent when
                it did: every own-offer filter simply matched nothing and our own store was
                reported as our biggest competitor. */}
            <Field label="Satıcı Referansı (merchantRef)">
              <div className="rounded border border-(--color-border) bg-(--color-surface-2) px-2 py-1.5 text-sm">
                {form.merchantRef || '— henüz belirlenmedi —'}
              </div>
            </Field>
            <p className="text-xs text-(--color-muted)">
              Bu alan elle girilmez: kimlik bilgilerindeki satıcı kodundan (Trendyol{' '}
              <code>sellerId</code>, Hepsiburada <code>merchantId</code>) otomatik belirlenir ve her
              ürün içe aktarımında doğrulanır. Kendi teklifimizi rakiplerinkinden ayıran tek veri
              budur; yanlış olduğunda hata vermez, sadece kendi mağazamızı rakip sayardık.
            </p>
            <p className="text-xs text-(--color-muted)">
              Kimlik bilgileri güvenlik nedeniyle görüntülenmez — yalnızca doldurduğunuz alanlar kaydedilir,
              boş bırakılanlar mevcut değeri korur.
            </p>
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
                  type={f.key.toLowerCase().includes('secret') || f.key === 'password' ? 'password' : 'text'}
                  value={form.credentials[f.key] ?? ''}
                  onChange={(e) =>
                    update(form.code, { credentials: { ...form.credentials, [f.key]: e.target.value } })
                  }
                  placeholder="değiştirmek için doldurun"
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
            {form.saved && <StatusBanner ok message="Kaydedildi." />}
          </div>
        </div>
      ))}
    </div>
  );
}
