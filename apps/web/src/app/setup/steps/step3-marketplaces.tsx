'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Select, StatusBanner, StepFooter, StepStopNotice, TextInput } from '@/components/ui';
import { formatDate } from '@/lib/format';

interface MarketplaceForm {
  code: 'trendyol' | 'hepsiburada';
  title: string;
  enabled: boolean;
  credentials: Record<string, string>;
  testResult?: { ok: boolean; message: string };
  saved?: boolean;
  /** Set when `/api/settings/marketplaces` already had this marketplace enabled with a real
   * seller id on mount — see the prefill effect below. Cleared as soon as the operator edits a
   * credential field, so a stale confirmation can never survive a change nobody re-tested. */
  savedByServer?: boolean;
  /** `merchantRef` / `updatedAt` from that same prefill, shown so the operator can see *what* is
   * already on file without the write-only credential fields pretending to show it. */
  existing?: { merchantRef: string | null; updatedAt: number };
}

const CREDENTIAL_FIELDS: Record<
  MarketplaceForm['code'],
  { key: string; label: string; optional?: boolean }[]
> = {
  trendyol: [
    { key: 'apiKey', label: 'API Anahtarı' },
    { key: 'apiSecret', label: 'API Gizli Anahtarı' },
    { key: 'sellerId', label: 'Satıcı Kimliği (sellerId)' },
    { key: 'userAgentSuffix', label: 'User-Agent Eki (opsiyonel)', optional: true },
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

/** Field-level validation (doc 15 §6, Phase 6): every credential field but the ones marked optional is required. */
function missingRequiredFields(form: MarketplaceForm): string[] {
  return CREDENTIAL_FIELDS[form.code]
    .filter((f) => !f.optional && !form.credentials[f.key])
    .map((f) => f.label);
}

export function Step3Marketplaces({
  onDone,
  onBack,
}: {
  onDone: (enabledCodes: ('trendyol' | 'hepsiburada')[]) => void;
  onBack: () => void;
}) {
  const [forms, setForms] = useState<MarketplaceForm[]>(INITIAL);
  const [busyCode, setBusyCode] = useState<string | undefined>();
  // `${code}:${fieldKey}` → has this field been blurred at least once. Field-level validation
  // shows nothing until the operator has actually reached a field, same rule as every other step.
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Never re-ask what `/api/settings/marketplaces` already knows (doc 15 §6, Phase 6): a
  // marketplace already enabled with a real seller id on file is shown as already configured
  // instead of forcing the operator to retype credentials and click Test + Kaydet again just to
  // satisfy `canProceed`. Credentials themselves stay blank — they are write-only everywhere in
  // this app (`credential-merge.ts`) — but the operator sees *that* something is on file, not a
  // blank form pretending nothing was ever done.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/settings/marketplaces');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          marketplaces: { code: string; enabled: boolean; merchantRef: string | null; updatedAt: number }[];
        };
        if (cancelled) return;
        setForms((prev) =>
          prev.map((f) => {
            const row = data.marketplaces.find((m) => m.code === f.code);
            if (!row) return f;
            const configured = row.enabled && row.merchantRef !== null;
            return {
              ...f,
              enabled: row.enabled || f.enabled,
              savedByServer: configured,
              existing: { merchantRef: row.merchantRef, updatedAt: row.updatedAt },
            };
          }),
        );
      } catch {
        // No prefill — the operator falls back to entering everything, same as before this step
        // read this route at all.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function update(code: MarketplaceForm['code'], patch: Partial<MarketplaceForm>) {
    setForms((prev) => prev.map((f) => (f.code === code ? { ...f, ...patch } : f)));
  }

  function updateCredential(code: MarketplaceForm['code'], key: string, value: string) {
    setForms((prev) =>
      prev.map((f) =>
        f.code === code
          ? {
              ...f,
              credentials: { ...f.credentials, [key]: value },
              // A stale "already configured" or "tested" badge must not survive an edit nobody
              // re-verified — otherwise the operator could change a credential, never re-test,
              // and still proceed on a confirmation that predates the change.
              savedByServer: false,
              saved: false,
              testResult: undefined,
            }
          : f,
      ),
    );
  }

  function markTouched(code: string, key: string) {
    setTouched((prev) => new Set(prev).add(`${code}:${key}`));
  }

  function fieldError(
    form: MarketplaceForm,
    key: string,
    label: string,
    optional?: boolean,
  ): string | undefined {
    if (optional) return undefined;
    if (!touched.has(`${form.code}:${key}`)) return undefined;
    return form.credentials[key] ? undefined : `${label} gerekli.`;
  }

  async function test(form: MarketplaceForm) {
    const missing = missingRequiredFields(form);
    if (missing.length > 0) {
      setTouched((prev) => {
        const next = new Set(prev);
        for (const f of CREDENTIAL_FIELDS[form.code]) next.add(`${form.code}:${f.key}`);
        return next;
      });
      return;
    }
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

  const canProceed = forms.every((f) => !f.enabled || f.saved || f.savedByServer);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-(--color-muted)">
        Her pazaryeri için bilgileri girin ve "Bağlantıyı Test Et" ile gerçek bir okuma çağrısı yapıp dönen
        sonucu doğrulayın, ardından kaydedin. Devre dışı bıraktığınız pazaryerleri atlanır.
      </p>
      {forms.map((form) => (
        <div key={form.code} className="rounded border border-(--color-border) p-4">
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
              {form.savedByServer && form.existing && (
                <StatusBanner
                  ok
                  message={`Zaten kayıtlı — satıcı kimliği: ${form.existing.merchantRef}, son güncelleme: ${formatDate(form.existing.updatedAt)}. Devam edebilirsiniz; kimlik bilgilerini değiştirmek isterseniz aşağıya yeniden girip test edin.`}
                />
              )}
              {/* Deliberately not asked for: it is the seller id already entered below, and a
                  second copy is free to drift from the first — silently, because nothing errors
                  when it is wrong; our own store simply starts counting as a competitor. */}
              <Field label="Ortam (Environment)">
                <Select
                  options={ENV_OPTIONS[form.code]}
                  value={form.credentials.environment ?? 'production'}
                  onChange={(e) => updateCredential(form.code, 'environment', e.target.value)}
                />
              </Field>
              {CREDENTIAL_FIELDS[form.code].map((f) => (
                <Field key={f.key} label={f.label} error={fieldError(form, f.key, f.label, f.optional)}>
                  <TextInput
                    type={
                      f.key.toLowerCase().includes('secret') || f.key === 'password' ? 'password' : 'text'
                    }
                    value={form.credentials[f.key] ?? ''}
                    onChange={(e) => updateCredential(form.code, f.key, e.target.value)}
                    onBlur={() => markTouched(form.code, f.key)}
                    placeholder={form.savedByServer ? 'Değiştirmek istemiyorsanız boş bırakın' : undefined}
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
                  {busyCode === form.code ? 'Test ediliyor…' : 'Bağlantıyı Test Et'}
                </Button>
                <Button type="button" onClick={() => void save(form)} disabled={busyCode === form.code}>
                  {busyCode === form.code ? 'Kaydediliyor…' : 'Kaydet'}
                </Button>
              </div>
              {form.testResult && <StatusBanner ok={form.testResult.ok} message={form.testResult.message} />}
              {form.saved && <StatusBanner ok message="Kimlik bilgileri şifreli olarak kaydedildi." />}
            </div>
          )}
        </div>
      ))}
      <StepStopNotice>
        Devre dışı bıraktığınız bir pazaryeri, sonraki tüm adımlarda (ücret, politika, gözden geçirme) atlanır
        ve o pazaryeri için hiçbir fiyat gönderilmez — daha sonra Ayarlar &gt; Pazaryerleri'nden
        açabilirsiniz. Etkin bıraktığınız bir pazaryerini test edip kaydetmeden çıkarsanız, döndüğünüzde
        kimlik bilgilerini yeniden girmeniz gerekir.
      </StepStopNotice>
      <StepFooter
        onBack={onBack}
        onNext={() => onDone(forms.filter((f) => f.enabled).map((f) => f.code))}
        nextDisabled={!canProceed}
      />
    </div>
  );
}
