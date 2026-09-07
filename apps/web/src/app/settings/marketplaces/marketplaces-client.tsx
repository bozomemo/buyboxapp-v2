'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Ago,
  Button,
  ErrorState,
  Field,
  LoadingState,
  Section,
  Select,
  StatusBanner,
  TextInput,
} from '@/components/ui';

/**
 * Settings > Marketplaces (doc 15 §6, Phase 5). Consistency pass only — the credential merge
 * behaviour is unchanged and matches `lib/credential-merge.ts`'s contract: a blank field means
 * "keep the stored value", never "clear it", so credentials stay write-only and are never
 * re-rendered once saved. `/api/settings/marketplaces` applies the identical filter server-side.
 */

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

const INITIAL_FORMS: Form[] = [
  { code: 'trendyol', title: 'Trendyol', enabled: false, merchantRef: '', credentials: {} },
  { code: 'hepsiburada', title: 'Hepsiburada', enabled: false, merchantRef: '', credentials: {} },
];

export function MarketplacesClient() {
  const [forms, setForms] = useState<Form[]>(INITIAL_FORMS);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Which form is mid-request, and which action — so "Kaydet" and "Bağlantıyı Test Et" can each
  // say what they are doing rather than only going dim (doc 15 §3.2 "Busy").
  const [busy, setBusy] = useState<{ code: string; action: 'test' | 'save' } | undefined>();

  const load = useCallback(() => {
    setLoadError(null);
    fetch('/api/settings/marketplaces')
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`Pazaryeri ayarları yüklenemedi (HTTP ${r.status}).`)),
      )
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
        setHasLoadedOnce(true);
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : String(e));
        setHasLoadedOnce(true);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update(code: Form['code'], patch: Partial<Form>) {
    setForms((prev) => prev.map((f) => (f.code === code ? { ...f, ...patch } : f)));
  }

  // §3.6: turning a marketplace on lets the background jobs start submitting real prices to it —
  // the risk direction, so it is confirmed. Turning it off is one click, the safe direction.
  // Raw `window.confirm` rather than the kit's `ConfirmButton` (sweep report §2.5): the control
  // here is a checkbox, and `ConfirmButton` only wraps a `<button>` — routing this through it
  // would mean replacing the checkbox with a button-styled toggle, a UI change beyond this nit.
  function setEnabled(form: Form, next: boolean) {
    if (next && !form.enabled) {
      const confirmed = window.confirm(
        `${TITLES[form.code]} etkinleştirilsin mi? Bu, arka plan işlerinin bu pazaryerinde gerçek fiyat göndermeye başlamasına izin verir.`,
      );
      if (!confirmed) return;
    }
    update(form.code, { enabled: next });
  }

  async function test(form: Form) {
    setBusy({ code: form.code, action: 'test' });
    try {
      const res = await fetch('/api/setup/marketplace/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceCode: form.code, credentials: form.credentials }),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      update(form.code, { testResult: data });
    } catch (e) {
      update(form.code, { testResult: { ok: false, message: e instanceof Error ? e.message : String(e) } });
    } finally {
      setBusy(undefined);
    }
  }

  async function save(form: Form) {
    setBusy({ code: form.code, action: 'save' });
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
      setBusy(undefined);
    }
  }

  if (!hasLoadedOnce) {
    return <LoadingState message="Pazaryeri ayarları yükleniyor…" skeletonRows={2} />;
  }

  if (loadError && forms.every((f) => f.updatedAt === undefined)) {
    return <ErrorState message={loadError} onRetry={load} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {loadError && (
        <p
          role="alert"
          className="rounded border border-(--color-warning-border) bg-(--color-warning-bg) px-3 py-2 text-sm"
        >
          Son yenileme başarısız oldu ({loadError}). Aşağıdaki bilgiler güncel olmayabilir.{' '}
          <button type="button" onClick={load} className="underline">
            Tekrar dene
          </button>
        </p>
      )}

      {forms.map((form) => (
        <Section
          key={form.code}
          id={`marketplace-${form.code}`}
          title={TITLES[form.code]}
          action={
            <div className="flex items-center gap-3">
              {form.updatedAt && (
                <span className="text-xs text-(--color-muted)">
                  Son güncelleme: <Ago at={form.updatedAt} />
                </span>
              )}
              <label className="flex items-center gap-2 text-sm font-normal normal-case tracking-normal text-(--color-text)">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setEnabled(form, e.target.checked)}
                />
                Etkin
              </label>
            </div>
          }
        >
          <div className="rounded border border-(--color-border) p-4">
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
                Bu alan elle girilmez: kimlik bilgilerindeki satıcı kodundan (Trendyol <code>sellerId</code>,
                Hepsiburada <code>merchantId</code>) otomatik belirlenir ve her ürün içe aktarımında
                doğrulanır. Kendi teklifimizi rakiplerinkinden ayıran tek veri budur; yanlış olduğunda hata
                vermez, sadece kendi mağazamızı rakip sayardık.
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
                    type={
                      f.key.toLowerCase().includes('secret') || f.key === 'password' ? 'password' : 'text'
                    }
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
                  disabled={busy?.code === form.code}
                >
                  {busy?.code === form.code && busy.action === 'test'
                    ? 'Test ediliyor…'
                    : 'Bağlantıyı Test Et'}
                </Button>
                <Button type="button" onClick={() => void save(form)} disabled={busy?.code === form.code}>
                  {busy?.code === form.code && busy.action === 'save' ? 'Kaydediliyor…' : 'Kaydet'}
                </Button>
              </div>
              {form.testResult && <StatusBanner ok={form.testResult.ok} message={form.testResult.message} />}
              {form.saved && <StatusBanner ok message="Kaydedildi." />}
            </div>
          </div>
        </Section>
      ))}
    </div>
  );
}
