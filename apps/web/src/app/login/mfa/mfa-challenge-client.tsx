'use client';

import { useEffect, useState } from 'react';
import { AuthCard, errorMessage, postJson } from '@/components/auth-card';
import { Button, Field, LoadingState, StatusBanner, TextInput } from '@/components/ui';

type Method = 'totp' | 'sms' | 'recovery';

interface ChallengeInfo {
  readonly methods: Method[];
  readonly phoneHint: string | null;
  readonly canRememberDevice: boolean;
  readonly rememberDays: number;
}

const METHOD_LABELS: Record<Method, string> = {
  totp: 'Doğrulama uygulaması',
  sms: 'SMS ile kod',
  recovery: 'Kurtarma kodu',
};

/** Seconds between SMS sends (doc 18 §5.3, `AUTH_SMS_RESEND_MS`). */
const RESEND_SECONDS = 60;

/**
 * doc 06 §10.1 — choose a method, type the code. A six-digit field for the app and SMS
 * (`autocomplete="one-time-code"`, so a phone offers the code it just received); a free-form one
 * for recovery codes, which are ten characters in two groups.
 */
export function MfaChallengeClient({ next }: { next: string }) {
  const [info, setInfo] = useState<ChallengeInfo | null>(null);
  const [expired, setExpired] = useState(false);
  const [method, setMethod] = useState<Method>('totp');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smsSentAt, setSmsSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch('/api/auth/mfa')
      .then(async (res) => {
        if (!res.ok) {
          setExpired(true);
          return;
        }
        const data = (await res.json()) as ChallengeInfo;
        setInfo(data);
        setMethod(data.methods.find((m) => m !== 'recovery') ?? 'recovery');
      })
      .catch(() => setExpired(true));
  }, []);

  useEffect(() => {
    if (smsSentAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [smsSentAt]);

  async function sendSms() {
    setError(null);
    const { ok, data } = await postJson('/api/auth/mfa/sms', {});
    if (!ok) setError(errorMessage(data, 'SMS gönderilemedi.'));
    else setSmsSentAt(Date.now());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { ok, status, data } = await postJson('/api/auth/mfa', { method, code, rememberDevice: remember });
      if (ok) {
        window.location.assign(next);
        return;
      }
      if (status === 401 && data.code === 'challenge_expired') setExpired(true);
      setError(errorMessage(data, 'Doğrulanamadı.'));
      setCode('');
    } catch {
      setError('Sunucuya ulaşılamadı.');
    } finally {
      setBusy(false);
    }
  }

  if (expired) {
    return (
      <AuthCard title="Doğrulama süresi doldu">
        <p className="mb-4 text-sm">Güvenliğiniz için doğrulama adımı 5 dakika ve 5 deneme ile sınırlıdır.</p>
        <Button type="button" onClick={() => window.location.assign('/login')}>
          Yeniden giriş yap
        </Button>
      </AuthCard>
    );
  }
  if (info === null) {
    return (
      <AuthCard title="İki adımlı doğrulama">
        <LoadingState message="Yükleniyor…" />
      </AuthCard>
    );
  }

  const resendIn = smsSentAt === null ? 0 : Math.max(0, RESEND_SECONDS - Math.floor((now - smsSentAt) / 1000));

  return (
    <AuthCard title="İki adımlı doğrulama">
      {info.methods.length > 1 && (
        <div role="radiogroup" aria-label="Doğrulama yöntemi" className="mb-4 flex flex-wrap gap-1 text-xs">
          {info.methods.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => {
                setMethod(m);
                setCode('');
                setError(null);
              }}
              className={`rounded border px-2 py-1 ${method === m ? 'border-(--color-accent) bg-(--color-accent-bg)' : 'border-(--color-border)'}`}
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        {method === 'totp' && <p className="text-sm text-(--color-muted)">Doğrulama uygulamanızdaki 6 haneli kodu girin.</p>}
        {method === 'sms' && (
          <div className="flex flex-col gap-2 text-sm text-(--color-muted)">
            <p>{info.phoneHint ?? 'Kayıtlı numaranıza'} kod gönderilir.</p>
            <Button type="button" variant="secondary" onClick={() => void sendSms()} disabled={resendIn > 0}>
              {smsSentAt === null ? 'Kod gönder' : resendIn > 0 ? `Yeniden gönder (${resendIn} sn)` : 'Yeniden gönder'}
            </Button>
          </div>
        )}
        {method === 'recovery' && (
          <p className="text-sm text-(--color-muted)">
            Kurulumda kaydettiğiniz kurtarma kodlarından birini girin. Her kod bir kez kullanılabilir.
          </p>
        )}

        <Field label={method === 'recovery' ? 'Kurtarma kodu' : 'Kod'}>
          {method === 'recovery' ? (
            <TextInput
              name="recovery-code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABCDE-FGH23"
            />
          ) : (
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
          )}
        </Field>

        {info.canRememberDevice && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Bu cihazı {info.rememberDays} gün hatırla
          </label>
        )}
        {error && <StatusBanner ok={false} message={error} />}
        <Button type="submit" disabled={busy || code.trim() === ''}>
          {busy ? 'Doğrulanıyor…' : 'Doğrula'}
        </Button>
        <button type="button" className="text-sm text-(--color-muted) underline" onClick={() => window.location.assign('/login')}>
          Farklı bir hesapla giriş yap
        </button>
      </form>
    </AuthCard>
  );
}
