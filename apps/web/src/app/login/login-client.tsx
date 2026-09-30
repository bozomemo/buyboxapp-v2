'use client';

import { useEffect, useState } from 'react';
import { AuthCard, errorMessage, postJson } from '@/components/auth-card';
import { Button, Field, StatusBanner, TextInput } from '@/components/ui';

/**
 * Sign in (doc 06 §10.1). Deliberately nothing but the two fields: no "forgot password" link,
 * because a password is reset by an administrator (doc 18 §1), and no hint of *why* a sign-in
 * failed (doc 18 §3.3).
 *
 * A full page load after success, not a client-side navigation: the header, the licence banner
 * and every poll in `NavShell` should start from the signed-in state rather than refetch into it.
 */
export function LoginClient({ next }: { next: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An install with no administrator has nobody who could sign in; send the operator to the
  // screen that creates one rather than letting them type into a form that cannot succeed.
  useEffect(() => {
    fetch('/api/bootstrap')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { bootstrapMode?: boolean } | null) => {
        if (data?.bootstrapMode) window.location.assign('/bootstrap');
      })
      .catch(() => undefined);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { ok, data } = await postJson('/api/auth/login', { username, password });
      if (!ok) {
        setError(errorMessage(data, 'Giriş yapılamadı.'));
        setPassword('');
        return;
      }
      if (data.next === 'mfa') {
        window.location.assign(`/login/mfa?next=${encodeURIComponent(next)}`);
        return;
      }
      window.location.assign(data.mustChangePassword === true ? '/account/password' : next);
    } catch {
      setError('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Giriş yap">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Kullanıcı adı">
          <TextInput
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Parola">
          <TextInput
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <StatusBanner ok={false} message={error} />}
        <Button type="submit" disabled={submitting || username === '' || password === ''}>
          {submitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </Button>
      </form>
    </AuthCard>
  );
}
