'use client';

import Link from 'next/link';
import { useState } from 'react';
import { errorMessage, postJson } from '@/components/auth-card';
import { RecoveryCodes } from '@/components/recovery-codes';
import { Button, Field, StatusBanner, TextInput } from '@/components/ui';
import type { AccountData } from './account-client';

type Pending = null | { action: 'totpRemove' | 'recoveryRegenerate' | 'smsRemove' };

/**
 * doc 06 §10.3 _İki adımlı doğrulama_. Removing the app and reissuing recovery codes both ask for
 * the password again; the server also refuses to remove the last method where a second factor is
 * required, and says so.
 */
export function MfaSection({ account, onChanged }: { account: AccountData; onChanged: () => void }) {
  const { user } = account;
  const [pending, setPending] = useState<Pending>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending === null) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await postJson('/api/account/mfa', { action: pending.action, password });
    setBusy(false);
    setPassword('');
    if (!ok) {
      setError(errorMessage(data, 'İşlem yapılamadı.'));
      return;
    }
    setPending(null);
    if (Array.isArray(data.recoveryCodes)) setCodes(data.recoveryCodes.map(String));
    else onChanged();
  }

  if (codes !== null) {
    return (
      <RecoveryCodes
        codes={codes}
        onDone={() => {
          setCodes(null);
          onChanged();
        }}
      />
    );
  }

  const enrolled = user.totpEnabled || user.smsEnabled;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          <strong>Doğrulama uygulaması:</strong> {user.totpEnabled ? 'etkin' : 'kurulmadı'}
        </span>
        {user.totpEnabled ? (
          <Button type="button" variant="secondary" onClick={() => setPending({ action: 'totpRemove' })}>
            Kaldır
          </Button>
        ) : (
          <Link href="/account/mfa-setup" className="rounded bg-(--color-accent) px-3 py-1.5 text-(--color-accent-ink)">
            Kur
          </Link>
        )}
      </div>
      {(user.smsAvailable || user.smsEnabled) && (
        <SmsRow
          account={account}
          onRemove={() => setPending({ action: 'smsRemove' })}
          onCodes={setCodes}
          onChanged={onChanged}
        />
      )}
      {enrolled && (
        <div className="flex flex-wrap items-center gap-3">
          <span>
            <strong>Kurtarma kodları:</strong> {user.recoveryCodesLeft} kullanılmamış kod
            {user.recoveryCodesLeft <= 3 && <span className="text-(--color-warning)"> — yenilemeniz önerilir</span>}
          </span>
          <Button type="button" variant="secondary" onClick={() => setPending({ action: 'recoveryRegenerate' })}>
            Yeniden oluştur
          </Button>
        </div>
      )}
      {pending !== null && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded border border-(--color-border) p-3">
          <p className="w-full">
            {pending.action === 'totpRemove'
              ? 'Doğrulama uygulamasını kaldırmak için parolanızı girin.'
              : pending.action === 'smsRemove'
                ? 'SMS doğrulamasını kaldırmak için parolanızı girin. Telefon numaranız da silinir.'
                : 'Yeni kodlar oluşturulunca eskiler geçersiz olur. Devam etmek için parolanızı girin.'}
          </p>
          <Field label="Parola">
            <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          </Field>
          <Button type="submit" disabled={busy || password === ''}>
            Onayla
          </Button>
          <Button type="button" variant="secondary" onClick={() => setPending(null)}>
            Vazgeç
          </Button>
        </form>
      )}
      {error && <StatusBanner ok={false} message={error} />}
    </div>
  );
}

/**
 * SMS (doc 18 §5.3): a number, then the code sent to it; SMS turns on only once the code comes
 * back. Shown only while a provider is configured — or while the user still has SMS on from a
 * time when one was, so they can remove it.
 */
function SmsRow({
  account,
  onRemove,
  onCodes,
  onChanged,
}: {
  account: AccountData;
  onRemove: () => void;
  onCodes: (codes: string[]) => void;
  onChanged: () => void;
}) {
  const { user } = account;
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, data } = await postJson('/api/account/mfa', { action: 'smsStart', phone });
    setBusy(false);
    if (!ok) setError(errorMessage(data, 'Kod gönderilemedi.'));
    else setSentTo(String(data.phone));
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, data } = await postJson('/api/account/mfa', { action: 'smsConfirm', code });
    setBusy(false);
    if (!ok) {
      setError(errorMessage(data, 'Kod doğrulanamadı.'));
      return;
    }
    setSentTo(null);
    if (Array.isArray(data.recoveryCodes)) onCodes(data.recoveryCodes.map(String));
    else onChanged();
  }

  if (user.smsEnabled) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span>
          <strong>SMS:</strong> etkin — {user.phoneHint}
          {!user.smsAvailable && <span className="text-(--color-warning)"> (SMS sağlayıcısı şu anda yapılandırılmamış)</span>}
        </span>
        <Button type="button" variant="secondary" onClick={onRemove}>
          Kaldır
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span>
        <strong>SMS:</strong> kurulmadı
      </span>
      {sentTo === null ? (
        <form onSubmit={start} className="flex flex-wrap items-end gap-2">
          <Field label="Cep telefonu">
            <TextInput inputMode="tel" autoComplete="tel" placeholder="0532 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </Field>
          <Button type="submit" disabled={busy || phone.trim() === ''}>
            Kod gönder
          </Button>
        </form>
      ) : (
        <form onSubmit={confirm} className="flex flex-wrap items-end gap-2">
          <Field label={`${sentTo} numarasına gelen kod`}>
            <TextInput autoComplete="one-time-code" inputMode="numeric" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          </Field>
          <Button type="submit" disabled={busy || code.trim() === ''}>
            Doğrula
          </Button>
          <Button type="button" variant="secondary" onClick={() => setSentTo(null)}>
            Numarayı değiştir
          </Button>
        </form>
      )}
      {error && <StatusBanner ok={false} message={error} />}
    </div>
  );
}
