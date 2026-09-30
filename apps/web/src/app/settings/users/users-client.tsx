'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
// Types only: `@buybox/shared`'s barrel also carries Node-only code (the secret store) and must
// not reach the browser bundle. The role tables arrive as props from the server page instead.
import type { Role } from '@buybox/shared';
import { STICKY_HEAD, TableFrame } from '@/components/table';
import {
  Ago,
  Button,
  Chip,
  ConfirmButton,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Section,
  Select,
  StatusBanner,
  TextInput,
} from '@/components/ui';
import { SettingsNav } from '../settings-nav';

interface UserSummary {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: Role;
  readonly roleLabel: string;
  readonly state: 'active' | 'disabled';
  readonly totpEnabled: boolean;
  readonly smsEnabled: boolean;
  readonly mustChangePassword: boolean;
  readonly lockedUntil: number | null;
  readonly lastLoginAt: number | null;
}

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; users: UserSummary[] };

/** The role table, read on the server (doc 18 §6.2) and handed down. */
export interface RoleTable {
  readonly roles: readonly { readonly role: Role; readonly label: string }[];
  readonly permissions: readonly { readonly label: string; readonly granted: readonly Role[] }[];
}
const LAST_ADMIN_TITLE = 'Kurulumdaki son etkin Yönetici. Önce başka bir kullanıcıyı Yönetici yapın.';

/**
 * A temporary password the administrator can read out over the phone: four groups of four
 * lower-case letters and digits, without the ones people misread (0/o, 1/l/i). 16 characters
 * from 31 symbols is ~79 bits — far past what the lockout lets anyone guess — and the user
 * replaces it at first sign-in anyway (doc 18 §3.2).
 */
function suggestTemporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

async function send(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ?? `HTTP ${res.status}`;
  } catch {
    return 'Sunucuya ulaşılamadı.';
  }
}

/** doc 06 §10.4. */
export function UsersClient({ roleTable }: { roleTable: RoleTable }) {
  const roleOptions = roleTable.roles.map((r) => ({ value: r.role, label: r.label }));
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const refresh = useCallback(() => {
    fetch('/api/users')
      .then(async (res) => {
        const data = (await res.json()) as { users?: UserSummary[]; error?: string };
        if (!res.ok || !data.users) throw new Error(data.error ?? `HTTP ${res.status}`);
        setLoad({ status: 'ready', users: data.users });
      })
      .catch((e: unknown) => setLoad({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
  }, []);
  useEffect(refresh, [refresh]);

  const report = (error: string | null, success: string) => {
    setNotice(error === null ? { ok: true, message: success } : { ok: false, message: error });
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kullanıcılar"
        description="Kimin giriş yapabileceği ve ne yapabileceği. Her değişiklik giriş kayıtlarına işlenir."
        action={
          <Link href="/settings/users/activity" className="text-sm text-(--color-accent) hover:underline">
            Giriş kayıtları →
          </Link>
        }
      />
      <SettingsNav />
      {notice && <StatusBanner ok={notice.ok} message={notice.message} />}

      <Section id="users-list" title="Kullanıcılar">
        {load.status === 'loading' && <LoadingState message="Kullanıcılar yükleniyor…" skeletonRows={3} />}
        {load.status === 'error' && <ErrorState message={`Kullanıcılar okunamadı: ${load.message}`} onRetry={refresh} />}
        {load.status === 'ready' && <UsersTable users={load.users} roleOptions={roleOptions} onDone={report} />}
      </Section>

      <Section id="users-policy" title="İki adımlı doğrulama">
        <MfaPolicy onDone={report} />
      </Section>

      <Section id="users-new" title="Yeni kullanıcı">
        <NewUserForm roleOptions={roleOptions} onDone={report} />
      </Section>

      <Section id="users-roles" title="Roller">
        <RolesTable table={roleTable} />
      </Section>
    </div>
  );
}

type RoleOptions = { value: string; label: string }[];

function UsersTable({
  users,
  roleOptions,
  onDone,
}: {
  users: UserSummary[];
  roleOptions: RoleOptions;
  onDone: (error: string | null, success: string) => void;
}) {
  const [resetting, setResetting] = useState<string | null>(null);
  const [temporary, setTemporary] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const activeAdmins = users.filter((u) => u.role === 'admin' && u.state === 'active').length;

  async function act(user: UserSummary, body: Record<string, unknown>, success: string) {
    setBusy(user.id);
    const error = await send(`/api/users/${user.id}`, 'PATCH', body);
    setBusy(null);
    if (error === null) setResetting(null);
    onDone(error, success);
  }

  return (
    <TableFrame maxHeight="60vh">
      <table className="w-full text-sm">
        <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-(--color-muted)`}>
          <tr>
            <th className="px-3 py-2">Kullanıcı adı</th>
            <th className="px-3 py-2">Ad Soyad</th>
            <th className="px-3 py-2">Rol</th>
            <th className="px-3 py-2">Durum</th>
            <th className="px-3 py-2">2 adımlı</th>
            <th className="px-3 py-2">Son giriş</th>
            <th className="px-3 py-2">İşlemler</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--color-border)">
          {users.map((user) => {
            const lastAdmin = user.role === 'admin' && user.state === 'active' && activeAdmins <= 1;
            const rowBusy = busy === user.id;
            return (
              <tr key={user.id} className={user.state === 'disabled' ? 'opacity-60' : ''}>
                <td className="px-3 py-2 font-mono text-xs">{user.username}</td>
                <td className="px-3 py-2">{user.displayName}</td>
                <td className="px-3 py-2">
                  <Select
                    aria-label={`${user.username} rolü`}
                    value={user.role}
                    options={roleOptions}
                    disabled={rowBusy || lastAdmin}
                    title={lastAdmin ? LAST_ADMIN_TITLE : undefined}
                    onChange={(e) =>
                      void act(user, { action: 'setRole', role: e.target.value }, `${user.username}: rol değiştirildi.`)
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Chip tone={user.state === 'active' ? 'ok' : 'neutral'}>
                      {user.state === 'active' ? 'Etkin' : 'Devre dışı'}
                    </Chip>
                    {user.lockedUntil !== null && <Chip tone="danger">Kilitli</Chip>}
                    {user.mustChangePassword && <Chip tone="warn">Geçici parola</Chip>}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">
                  {[user.totpEnabled ? 'Uygulama' : null, user.smsEnabled ? 'SMS' : null].filter(Boolean).join(', ') || (
                    <span className="text-(--color-muted)">yok</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  <Ago at={user.lastLoginAt} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1 text-xs">
                    {user.state === 'active' ? (
                      <ConfirmButton
                        requireConfirm
                        confirmMessage={`${user.username} devre dışı bırakılsın mı? Tüm oturumları hemen kapanır.`}
                        onConfirmed={() => void act(user, { action: 'disable' }, `${user.username} devre dışı bırakıldı.`)}
                        disabled={rowBusy || lastAdmin}
                        title={lastAdmin ? LAST_ADMIN_TITLE : undefined}
                        className="rounded border px-2 py-1 disabled:opacity-40"
                      >
                        Devre dışı bırak
                      </ConfirmButton>
                    ) : (
                      <ConfirmButton
                        requireConfirm
                        confirmMessage={`${user.username} yeniden etkinleştirilsin mi?`}
                        onConfirmed={() => void act(user, { action: 'enable' }, `${user.username} etkinleştirildi.`)}
                        disabled={rowBusy}
                        className="rounded border px-2 py-1 disabled:opacity-40"
                      >
                        Etkinleştir
                      </ConfirmButton>
                    )}
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => {
                        setResetting(resetting === user.id ? null : user.id);
                        setTemporary(suggestTemporaryPassword());
                      }}
                      className="rounded border px-2 py-1 disabled:opacity-40"
                    >
                      Parolayı sıfırla
                    </button>
                    <ConfirmButton
                      requireConfirm
                      confirmMessage={`${user.username} için iki adımlı doğrulama sıfırlansın mı? Bir sonraki girişte yeniden kurması gerekir; tüm oturumları kapanır.`}
                      onConfirmed={() => void act(user, { action: 'resetMfa' }, `${user.username}: iki adımlı doğrulama sıfırlandı.`)}
                      disabled={rowBusy || (!user.totpEnabled && !user.smsEnabled)}
                      className="rounded border px-2 py-1 disabled:opacity-40"
                    >
                      2 adımlıyı sıfırla
                    </ConfirmButton>
                    {user.lockedUntil !== null && (
                      <ConfirmButton
                        requireConfirm={false}
                        confirmMessage=""
                        onConfirmed={() => void act(user, { action: 'unlock' }, `${user.username} kilidi kaldırıldı.`)}
                        disabled={rowBusy}
                        className="rounded border px-2 py-1 disabled:opacity-40"
                      >
                        Kilidi kaldır
                      </ConfirmButton>
                    )}
                  </div>
                  {resetting === user.id && (
                    <form
                      className="mt-2 flex flex-wrap items-end gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act(
                          user,
                          { action: 'resetPassword', temporaryPassword: temporary },
                          `${user.username}: geçici parola ayarlandı. Parolayı kullanıcıya kendiniz iletin; ilk girişte değiştirmesi istenecek.`,
                        );
                      }}
                    >
                      <Field label="Geçici parola" hint="Kullanıcıya kendiniz iletin. İlk girişte değiştirmesi istenir.">
                        <TextInput value={temporary} onChange={(e) => setTemporary(e.target.value)} spellCheck={false} autoComplete="off" />
                      </Field>
                      <Button type="submit" disabled={rowBusy || temporary.length < 10}>
                        Kaydet
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setResetting(null)}>
                        Vazgeç
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableFrame>
  );
}

function NewUserForm({ roleOptions, onDone }: { roleOptions: RoleOptions; onDone: (error: string | null, success: string) => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [temporary, setTemporary] = useState(suggestTemporaryPassword);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const error = await send('/api/users', 'POST', { username, displayName, role, temporaryPassword: temporary, phone });
    setBusy(false);
    onDone(error, `${username} oluşturuldu. Geçici parolayı kendiniz iletin; ilk girişte değiştirmesi istenecek.`);
    if (error === null) {
      setUsername('');
      setDisplayName('');
      setPhone('');
      setTemporary(suggestTemporaryPassword());
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Kullanıcı adı" hint="3-32 karakter: küçük harf (a-z), rakam (0-9), nokta (.), alt çizgi (_), tire (-).">
        <TextInput value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" spellCheck={false} required />
      </Field>
      <Field label="Ad Soyad">
        <TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </Field>
      <Field label="Rol">
        <Select value={role} options={roleOptions} onChange={(e) => setRole(e.target.value as Role)} />
      </Field>
      <Field label="Geçici parola" hint="Kullanıcıya kendiniz iletin. İlk girişte değiştirmesi istenir.">
        <TextInput value={temporary} onChange={(e) => setTemporary(e.target.value)} spellCheck={false} autoComplete="off" required />
      </Field>
      <Field label="Telefon (isteğe bağlı)" hint="SMS doğrulaması için. Numarayı kullanıcının kendisi doğrular.">
        <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0532 123 45 67" />
      </Field>
      <div className="flex items-end">
        <Button type="submit" disabled={busy || !username || !displayName || temporary.length < 10}>
          {busy ? 'Oluşturuluyor…' : 'Kullanıcı oluştur'}
        </Button>
      </div>
    </form>
  );
}

/**
 * doc 18 §5.1: on a network install always required, shown locked; on a loopback install the
 * administrator's choice. Turning it on sends every user without a second factor to enrolment at
 * their next request.
 */
function MfaPolicy({ onDone }: { onDone: (error: string | null, success: string) => void }) {
  const [policy, setPolicy] = useState<{ networkMode: boolean; mfaRequired: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/users/policy')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { networkMode: boolean; mfaRequired: boolean } | null) => setPolicy(data))
      .catch(() => setPolicy(null));
  }, []);
  if (policy === null) return null;

  async function toggle(next: boolean) {
    setBusy(true);
    const error = await send('/api/users/policy', 'POST', { mfaRequired: next });
    setBusy(false);
    if (error === null) setPolicy({ ...policy!, mfaRequired: next });
    onDone(error, next ? 'İki adımlı doğrulama artık herkes için zorunlu.' : 'İki adımlı doğrulama artık isteğe bağlı.');
  }

  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={policy.mfaRequired}
        disabled={busy || policy.networkMode}
        onChange={(e) => void toggle(e.target.checked)}
      />
      <span>
        Herkes için zorunlu
        <span className="block text-xs text-(--color-muted)">
          {policy.networkMode
            ? 'Bu kurulum ağ üzerinden erişildiği için her zaman zorunludur.'
            : 'Açılırsa iki adımlı doğrulaması olmayan her kullanıcı bir sonraki işleminde kurulum ekranına yönlendirilir.'}
        </span>
      </span>
    </label>
  );
}

/** doc 06 §10.4 — what each role can do, so choosing one does not need the specification. */
function RolesTable({ table }: { table: RoleTable }) {
  return (
    <TableFrame maxHeight="none">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-(--color-muted)">
          <tr>
            <th className="px-3 py-2">Yetki</th>
            {table.roles.map((r) => (
              <th key={r.role} className="px-3 py-2 text-center">
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-(--color-border)">
          {table.permissions.map((p) => (
            <tr key={p.label}>
              <td className="px-3 py-2">{p.label}</td>
              {table.roles.map((r) => (
                <td key={r.role} className="px-3 py-2 text-center">
                  {p.granted.includes(r.role) ? '✓' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
