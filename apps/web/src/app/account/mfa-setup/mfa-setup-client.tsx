'use client';

import { useEffect, useRef, useState } from 'react';
import { AuthCard, errorMessage, postJson } from '@/components/auth-card';
import { RecoveryCodes } from '@/components/recovery-codes';
import { Button, ErrorState, Field, LoadingState, StatusBanner, TextInput } from '@/components/ui';

type Step =
  | { kind: 'starting' }
  | { kind: 'error'; message: string }
  | { kind: 'scan'; secret: string; qrSvg: string }
  | { kind: 'codes'; codes: string[] };

/**
 * doc 18 §5.2 — scan, confirm with a code, then (for a first method) keep the recovery codes.
 * The secret is only turned on after a code from the app proves it was scanned, so a half-done
 * enrolment can never lock anyone out.
 */
export function MfaSetupClient() {
  const [step, setStep] = useState<Step>({ kind: 'starting' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  async function start() {
    setStep({ kind: 'starting' });
    const { ok, data } = await postJson('/api/account/mfa', { action: 'totpStart' });
    if (!ok) setStep({ kind: 'error', message: errorMessage(data, 'Kurulum başlatılamadı.') });
    else setStep({ kind: 'scan', secret: String(data.secret), qrSvg: String(data.qrSvg) });
  }

  // Once per mount, even under React's development double-invoke: two `totpStart` calls would
  // park two secrets, and the QR on screen could be the one the second call overwrote.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, []);

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, data } = await postJson('/api/account/mfa', { action: 'totpConfirm', code });
    setBusy(false);
    if (!ok) {
      setError(errorMessage(data, 'Kod doğrulanamadı.'));
      setCode('');
      return;
    }
    const codes = data.recoveryCodes;
    if (Array.isArray(codes)) setStep({ kind: 'codes', codes: codes.map(String) });
    else window.location.assign('/account');
  }

  if (step.kind === 'starting') {
    return (
      <AuthCard title="Doğrulama uygulaması">
        <LoadingState message="Hazırlanıyor…" />
      </AuthCard>
    );
  }
  if (step.kind === 'error') {
    return (
      <AuthCard title="Doğrulama uygulaması">
        <ErrorState message={step.message} onRetry={() => void start()} />
      </AuthCard>
    );
  }
  if (step.kind === 'codes') {
    return (
      <AuthCard title="Kurtarma kodlarınız">
        <RecoveryCodes codes={step.codes} onDone={() => window.location.assign('/')} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Doğrulama uygulamasını kurun"
      subtitle="Google Authenticator, Microsoft Authenticator, Authy veya benzeri bir uygulama ile kodu tarayın."
    >
      <div className="flex flex-col gap-3">
        {/* Rendered on the server by `qrcode` from our own otpauth URI; no user input reaches it. */}
        <div
          className="mx-auto w-48 rounded bg-white p-2"
          aria-label="Doğrulama uygulaması için QR kodu"
          dangerouslySetInnerHTML={{ __html: step.qrSvg }}
        />
        <button type="button" className="text-xs text-(--color-muted) underline" onClick={() => setShowKey(!showKey)}>
          {showKey ? 'Anahtarı gizle' : 'Tarayamıyor musunuz? Anahtarı elle girin'}
        </button>
        {showKey && (
          <code className="break-all rounded border border-(--color-border) bg-(--color-chip-bg) px-2 py-1 text-center text-sm">
            {step.secret}
          </code>
        )}
        <form onSubmit={confirm} className="flex flex-col gap-3">
          <Field label="Uygulamadaki 6 haneli kod">
            <TextInput
              name="one-time-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          {error && <StatusBanner ok={false} message={error} />}
          <Button type="submit" disabled={busy || code.trim() === ''}>
            {busy ? 'Doğrulanıyor…' : 'Etkinleştir'}
          </Button>
        </form>
        <button
          type="button"
          className="text-sm text-(--color-muted) underline"
          onClick={() => {
            void fetch('/api/auth/logout', { method: 'POST' }).finally(() => window.location.assign('/login'));
          }}
        >
          Çıkış yap
        </button>
      </div>
    </AuthCard>
  );
}
