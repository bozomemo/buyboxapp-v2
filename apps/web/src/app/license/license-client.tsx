'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LicenseInvalidReason, LicenseStatus } from '@buybox/shared';
import { ErrorState, LoadingState, PageHeader, TONE_BOX, TONE_TEXT, type Tone } from '@/components/ui';

/**
 * The licence screen (docs/13-licensing.md §6) — the one route reachable while unlicensed, and
 * therefore the only place an operator can fix a lapsed install from. Turkish throughout, like
 * the rest of the UI (doc 06). Consistency pass (doc 15 §6, Phase 5): shared kit, six states,
 * no local tone map.
 */

const INVALID_MESSAGES: Record<LicenseInvalidReason, string> = {
  malformed: 'Lisans anahtarı okunamadı. Anahtarın tamamını, boşluksuz olarak yapıştırdığınızdan emin olun.',
  'unknown-format': 'Bu lisans anahtarı bu sürüm tarafından tanınmıyor. Güncel bir anahtar isteyin.',
  'bad-signature': 'Lisans anahtarı geçerli değil. Anahtar değiştirilmiş veya eksik kopyalanmış olabilir.',
  'bad-claims': 'Lisans anahtarının içeriği okunamadı. Tedarikçinizden yeni bir anahtar isteyin.',
  'clock-rollback': 'Sunucu saati geriye alınmış görünüyor. Sistem saatini düzeltin ve sayfayı yenileyin.',
};

function describe(status: LicenseStatus): { tone: Tone; title: string; detail: string } {
  switch (status.state) {
    case 'valid':
      return {
        tone: 'ok',
        title: 'Lisans etkin',
        detail: `${status.claims.customer} — ${status.daysRemaining} gün kaldı.`,
      };
    case 'grace':
      return {
        tone: 'warn',
        title: 'Lisans süresi doldu — ek süre kullanılıyor',
        detail: `${status.claims.customer} — sistem ${status.graceDaysRemaining} gün sonra duracak. Lisansınızı yenileyin.`,
      };
    case 'expired':
      return {
        tone: 'danger',
        title: 'Lisans süresi doldu',
        detail: `${status.claims.customer} — ek süre de doldu, sistem durduruldu. Yenilenmiş anahtarı aşağıya yapıştırın.`,
      };
    case 'invalid':
      return { tone: 'danger', title: 'Lisans geçersiz', detail: INVALID_MESSAGES[status.reason] };
    case 'missing':
      return {
        tone: 'danger',
        title: 'Lisans bulunamadı',
        detail: 'Bu kurulum henüz lisanslanmadı. Devam etmek için lisans anahtarınızı yapıştırın.',
      };
  }
}

interface LicenseResponse {
  status: LicenseStatus;
  managedByEnvironment: boolean;
}

export function LicenseClient() {
  const [data, setData] = useState<LicenseResponse | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const response = await fetch('/api/license');
      if (!response.ok) throw new Error(`Lisans durumu okunamadı (HTTP ${response.status}).`);
      setData((await response.json()) as LicenseResponse);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch('/api/license', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json()) as { status: LicenseStatus };
      if (!response.ok) {
        setError(describe(body.status).detail);
        return;
      }
      // A newly accepted licence lifts the gate, so send the operator back to where they were
      // headed rather than leaving them on a screen that no longer applies.
      window.location.href = '/';
    } catch {
      setError('Lisans kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  if (!data && loadError) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
        <ErrorState message={loadError} onRetry={() => void load()} />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
        <LoadingState message="Lisans durumu yükleniyor…" />
      </main>
    );
  }

  const described = describe(data.status);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <PageHeader
        title="Lisans"
        description="BuyBoxApp lisanslı bir kurulum gerektirir. Lisans olmadan hiçbir iş çalışmaz, hiçbir fiyat gönderilmez."
      />

      <div className={`rounded border px-4 py-3 ${TONE_BOX[described.tone]}`}>
        <p className={`text-sm font-semibold ${TONE_TEXT[described.tone]}`}>{described.title}</p>
        <p className="text-sm">{described.detail}</p>
      </div>

      {data.managedByEnvironment && (
        <p className="rounded border border-(--color-border) px-4 py-3 text-sm">
          Bu kurulumun lisansı şu anda <code>LICENSE_TOKEN</code> ortam değişkeninden geliyor. Aşağıya yeni
          bir anahtar kaydederseniz, anahtar veritabanına taşınır ve ortam değişkeni kaldırılır.
        </p>
      )}

      <section aria-labelledby="license-form-heading" className="flex flex-col gap-3">
        <h2 id="license-form-heading" className="sr-only">
          Lisans anahtarı gir
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Lisans anahtarı</span>
          <textarea
            value={token}
            onChange={(event) => setToken(event.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="BBX1.…"
            className="rounded border border-(--color-border) px-3 py-2 font-mono text-xs outline-none focus:border-(--color-accent)"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-(--color-danger)">
            {error}
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || token.trim() === ''}
            className="rounded bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-ink) hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Kaydediliyor…' : 'Lisansı etkinleştir'}
          </button>
        </div>
      </section>
    </main>
  );
}
