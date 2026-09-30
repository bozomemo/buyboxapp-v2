'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthCard, errorMessage, postJson } from '@/components/auth-card';
import { Button, ErrorState, Field, LoadingState, StatusBanner, TextInput } from '@/components/ui';

interface Status {
  readonly bootstrapMode: boolean;
  readonly databaseConfigured?: boolean;
  readonly hasSetupAccess?: boolean;
  readonly tokenPath?: string;
}

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Status };

/**
 * The first administrator (doc 06 §10.2, doc 18 §8.1), in up to three steps:
 *
 * 1. the setup token, read from a file on the server — proof of access to the machine;
 * 2. on a checkout with no database yet, the setup wizard's database step (the token opens it);
 * 3. the administrator's own username, name and password.
 */
export function BootstrapClient() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const refresh = useCallback(() => {
    setLoad({ status: 'loading' });
    fetch('/api/bootstrap')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as Status;
      })
      .then((data) => {
        // An install that already has its administrator has nothing to do here.
        if (!data.bootstrapMode) window.location.assign('/login');
        else setLoad({ status: 'ready', data });
      })
      .catch((e: unknown) => setLoad({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
  }, []);

  useEffect(refresh, [refresh]);

  if (load.status === 'loading') {
    return (
      <AuthCard title="İlk yönetici">
        <LoadingState message="Kurulum durumu okunuyor…" />
      </AuthCard>
    );
  }
  if (load.status === 'error') {
    return (
      <AuthCard title="İlk yönetici">
        <ErrorState message={`Kurulum durumu okunamadı: ${load.message}`} onRetry={refresh} />
      </AuthCard>
    );
  }

  const { data } = load;
  if (!data.hasSetupAccess) return <TokenStep tokenPath={data.tokenPath ?? ''} onDone={refresh} />;
  if (!data.databaseConfigured) {
    return (
      <AuthCard
        title="Önce veritabanı"
        subtitle="Kullanıcılar veritabanında tutulur ve bu kurulumda henüz veritabanı yapılandırılmadı."
      >
        <p className="mb-4 text-sm">
          Kurulum sihirbazının veritabanı adımını tamamlayın, ardından ilk yöneticiyi oluşturmak için bu ekrana dönün.
        </p>
        <Button type="button" onClick={() => window.location.assign('/setup')}>
          Veritabanı adımına git
        </Button>
      </AuthCard>
    );
  }
  return <AdminStep />;
}

function TokenStep({ tokenPath, onDone }: { tokenPath: string; onDone: () => void }) {
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { ok, data } = await postJson('/api/bootstrap/verify', { token });
      if (!ok) setError(errorMessage(data, 'Kurulum anahtarı doğrulanamadı.'));
      else onDone();
    } catch {
      setError('Sunucuya ulaşılamadı.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="İlk yönetici"
      subtitle="Bu kurulumda henüz yönetici yok. Devam etmek için sunucudaki kurulum anahtarı gerekiyor."
    >
      <div className="mb-4 rounded border border-(--color-border) bg-(--color-chip-bg) px-3 py-2 text-xs">
        <div className="mb-1 text-(--color-muted)">Anahtar bu dosyada:</div>
        <code className="break-all">{tokenPath}</code>
        <div className="mt-2 text-(--color-muted)">
          Dosyayı yalnızca sunucuya erişimi olan biri okuyabilir. Anahtar her yeniden başlatmada değişir.
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Kurulum anahtarı">
          <TextInput
            name="token"
            autoComplete="off"
            spellCheck={false}
            required
            autoFocus
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </Field>
        {error && <StatusBanner ok={false} message={error} />}
        <Button type="submit" disabled={submitting || token.trim() === ''}>
          {submitting ? 'Doğrulanıyor…' : 'Devam'}
        </Button>
      </form>
    </AuthCard>
  );
}

function AdminStep() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = repeat !== '' && repeat !== password;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setSubmitting(true);
    setError(null);
    try {
      const { ok, data } = await postJson('/api/bootstrap/admin', { username, displayName, password });
      if (!ok) setError(errorMessage(data, 'Yönetici oluşturulamadı.'));
      else window.location.assign('/');
    } catch {
      setError('Sunucuya ulaşılamadı.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="İlk yöneticiyi oluşturun" subtitle="Bu hesap tüm ayarlara ve kullanıcı yönetimine erişir.">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Kullanıcı adı" hint="3-32 karakter: küçük harf (a-z), rakam (0-9), nokta (.), alt çizgi (_), tire (-).">
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
        <Field label="Ad Soyad">
          <TextInput name="name" autoComplete="name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Parola" hint="En az 10 karakter. Uzun bir cümle kısa ve karmaşık bir paroladan daha güçlüdür.">
          <TextInput
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Parola (tekrar)" {...(mismatch ? { error: 'Parolalar aynı değil.' } : {})}>
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
        <Button type="submit" disabled={submitting || mismatch || !username || !displayName || !password || !repeat}>
          {submitting ? 'Oluşturuluyor…' : 'Yöneticiyi oluştur'}
        </Button>
      </form>
    </AuthCard>
  );
}
