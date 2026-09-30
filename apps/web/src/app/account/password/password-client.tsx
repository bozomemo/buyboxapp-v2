'use client';

import { useEffect, useState } from 'react';
import { AuthCard, errorMessage, postJson } from '@/components/auth-card';
import { Button, Field, StatusBanner, TextInput } from '@/components/ui';

/**
 * Change password (doc 06 §10.3). Standalone rather than inside the app shell, because a user
 * holding a temporary password can reach nothing else until it is changed (doc 18 §3.2) — the
 * navigation would be a page of links that all bounce back here.
 */
export function PasswordClient() {
  const [mustChange, setMustChange] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { mustChangePassword?: boolean } } | null) => setMustChange(data?.user?.mustChangePassword === true))
      .catch(() => undefined);
  }, []);

  const mismatch = repeat !== '' && repeat !== next;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setSubmitting(true);
    setError(null);
    try {
      const { ok, data } = await postJson('/api/auth/password', { currentPassword: current, newPassword: next });
      if (!ok) setError(errorMessage(data, 'Parola değiştirilemedi.'));
      else window.location.assign('/');
    } catch {
      setError('Sunucuya ulaşılamadı.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Parolayı değiştir"
      subtitle={
        mustChange
          ? 'Yöneticiniz size geçici bir parola verdi. Devam etmeden önce kendi parolanızı belirleyin.'
          : 'Parolanız değişince diğer tüm cihazlardaki oturumlarınız kapanır.'
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label={mustChange ? 'Geçici parola' : 'Mevcut parola'}>
          <TextInput
            name="current-password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="Yeni parola" hint="En az 10 karakter.">
          <TextInput
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="Yeni parola (tekrar)" {...(mismatch ? { error: 'Parolalar aynı değil.' } : {})}>
          <TextInput
            name="repeat-password"
            type="password"
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </Field>
        {error && <StatusBanner ok={false} message={error} />}
        <Button type="submit" disabled={submitting || mismatch || !current || !next || !repeat}>
          {submitting ? 'Kaydediliyor…' : 'Parolayı değiştir'}
        </Button>
        {!mustChange && (
          <button type="button" className="text-sm text-(--color-muted) underline" onClick={() => window.history.back()}>
            Vazgeç
          </button>
        )}
      </form>
    </AuthCard>
  );
}
