'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { STICKY_HEAD, TableFrame } from '@/components/table';
import { Ago, ConfirmButton, ErrorState, LoadingState, PageHeader, Section, StatusBanner } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { MfaSection } from './mfa-section';

export interface AccountData {
  readonly user: {
    readonly username: string;
    readonly displayName: string;
    readonly roleLabel: string;
    readonly lastLoginAt: number | null;
    readonly totpEnabled: boolean;
    readonly smsEnabled: boolean;
    readonly phoneVerified: boolean;
    readonly phoneHint: string | null;
    readonly smsAvailable: boolean;
    readonly recoveryCodesLeft: number;
  };
  readonly sessions: readonly {
    readonly id: string;
    readonly current: boolean;
    readonly createdAt: number;
    readonly lastSeenAt: number;
    readonly ip: string | null;
    readonly userAgent: string | null;
  }[];
  readonly devices: readonly {
    readonly id: string;
    readonly label: string | null;
    readonly createdAt: number;
    readonly expiresAt: number;
    readonly lastUsedAt: number | null;
  }[];
}

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: AccountData };

/** "Firefox on Windows" is what a person recognises; the raw user agent is in the tooltip. */
function describeAgent(ua: string | null): string {
  if (ua === null) return 'Bilinmeyen tarayıcı';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Tarayıcı';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os === '' ? browser : `${browser} · ${os}`;
}

async function accountAction(body: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ?? `HTTP ${res.status}`;
  } catch {
    return 'Sunucuya ulaşılamadı.';
  }
}

/** doc 06 §10.3. */
export function AccountClient() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch('/api/account')
      .then(async (res) => {
        const data = (await res.json()) as AccountData & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setLoad({ status: 'ready', data });
      })
      .catch((e: unknown) => setLoad({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
  }, []);
  useEffect(refresh, [refresh]);

  async function act(body: Record<string, string>, then?: () => void) {
    setError(null);
    const failure = await accountAction(body);
    if (failure !== null) setError(failure);
    else if (then) then();
    else refresh();
  }

  if (load.status === 'loading') return <LoadingState message="Hesap bilgileri yükleniyor…" skeletonRows={3} />;
  if (load.status === 'error') return <ErrorState message={`Hesap bilgileri okunamadı: ${load.message}`} onRetry={refresh} />;
  const { user, sessions, devices } = load.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hesabım"
        description={
          <>
            {user.displayName} · <span className="font-mono">{user.username}</span> · {user.roleLabel} · Son giriş:{' '}
            <Ago at={user.lastLoginAt} />
          </>
        }
      />
      {error && <StatusBanner ok={false} message={error} />}

      <Section id="account-password" title="Parola">
        <p className="text-sm">
          <Link href="/account/password" className="text-(--color-accent) hover:underline">
            Parolayı değiştir
          </Link>{' '}
          <span className="text-(--color-muted)">— değişince diğer tüm cihazlardaki oturumlarınız kapanır.</span>
        </p>
      </Section>

      <Section id="account-mfa" title="İki adımlı doğrulama">
        <MfaSection account={load.data} onChanged={refresh} />
      </Section>

      <Section
        id="account-sessions"
        title="Oturumlar"
        action={
          <ConfirmButton
            requireConfirm
            confirmMessage="Bu tarayıcı dahil tüm oturumlarınız kapanacak ve hatırlanan cihazlar unutulacak. Devam edilsin mi?"
            onConfirmed={() => void act({ action: 'signOutEverywhere' }, () => window.location.assign('/login'))}
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
          >
            Tüm cihazlardan çıkış yap
          </ConfirmButton>
        }
      >
        <TableFrame maxHeight="40vh">
          <table className="w-full text-sm">
            <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-(--color-muted)`}>
              <tr>
                <th className="px-3 py-2">Tarayıcı</th>
                <th className="px-3 py-2">Adres</th>
                <th className="px-3 py-2">Başladı</th>
                <th className="px-3 py-2">Son etkinlik</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2" title={s.userAgent ?? undefined}>
                    {describeAgent(s.userAgent)} {s.current && <span className="text-xs text-(--color-muted)">(bu tarayıcı)</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{s.ip ?? <span className="text-(--color-muted)">yerel</span>}</td>
                  <td className="px-3 py-2 text-xs">{formatDateTime(s.createdAt)}</td>
                  <td className="px-3 py-2 text-xs">
                    <Ago at={s.lastSeenAt} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!s.current && (
                      <button
                        type="button"
                        onClick={() => void act({ action: 'endSession', id: s.id })}
                        className="rounded border px-2 py-1 text-xs hover:bg-(--color-hover)"
                      >
                        Sonlandır
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      </Section>

      <Section id="account-devices" title="Hatırlanan cihazlar">
        {devices.length === 0 ? (
          <p className="text-sm text-(--color-muted)">
            Hatırlanan cihaz yok. İki adımlı doğrulamada “Bu cihazı hatırla” seçilirse burada görünür.
          </p>
        ) : (
          <ul className="divide-y divide-(--color-border) rounded border border-(--color-border) text-sm">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span title={d.label ?? undefined}>
                  {describeAgent(d.label)} · {formatDateTime(d.expiresAt)} tarihine kadar
                </span>
                <button
                  type="button"
                  onClick={() => void act({ action: 'forgetDevice', id: d.id })}
                  className="rounded border px-2 py-1 text-xs hover:bg-(--color-hover)"
                >
                  Unut
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
