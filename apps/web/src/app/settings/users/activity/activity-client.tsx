'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { STICKY_HEAD, TableFrame } from '@/components/table';
import { Button, EmptyState, ErrorState, Field, LoadingState, PageHeader, Select } from '@/components/ui';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime } from '@/lib/format';

interface AuthEvent {
  readonly id: string;
  readonly at: number;
  readonly event: string;
  readonly user: string | null;
  readonly actor: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly detail: Record<string, unknown> | null;
}

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; events: AuthEvent[]; hasMore: boolean };

const EVENT_LABELS: Readonly<Record<string, string>> = {
  'login.succeeded': 'Giriş yapıldı',
  'login.failed': 'Giriş başarısız',
  'login.locked': 'Hesap kilitlendi',
  logout: 'Çıkış yapıldı',
  'mfa.passed': '2 adımlı doğrulama geçti',
  'mfa.failed': '2 adımlı doğrulama başarısız',
  'mfa.enrolled': '2 adımlı doğrulama kuruldu',
  'mfa.removed': '2 adımlı doğrulama kaldırıldı',
  'recovery.used': 'Kurtarma kodu kullanıldı',
  'recovery.regenerated': 'Kurtarma kodları yenilendi',
  'sms.sent': 'SMS gönderildi',
  'sms.failed': 'SMS gönderilemedi',
  'sms.capped': 'SMS sınırına ulaşıldı',
  'password.changed': 'Parola değiştirildi',
  'password.reset': 'Parola sıfırlandı',
  'user.created': 'Kullanıcı oluşturuldu',
  'user.disabled': 'Kullanıcı devre dışı bırakıldı',
  'user.enabled': 'Kullanıcı etkinleştirildi',
  'user.role_changed': 'Rol değiştirildi',
  'user.unlocked': 'Kilit kaldırıldı',
  'bootstrap.completed': 'İlk yönetici oluşturuldu',
  'session.revoked': 'Oturum sonlandırıldı',
  'device.revoked': 'Cihaz unutuldu',
};

/** Why a sign-in failed — kept here, never shown on the sign-in screen itself (doc 18 §3.3). */
const FAILURE_REASONS: Readonly<Record<string, string>> = {
  unknown_user: 'kullanıcı yok',
  wrong_password: 'parola yanlış',
  locked: 'hesap kilitli',
  disabled: 'hesap devre dışı',
  address_blocked: 'adres engelli',
};

function describeDetail(e: AuthEvent): string {
  const d = e.detail;
  if (d === null) return '';
  if (e.event === 'login.failed') {
    const reason = typeof d.reason === 'string' ? (FAILURE_REASONS[d.reason] ?? d.reason) : '';
    return `${reason}${typeof d.username === 'string' ? ` — "${d.username}"` : ''}`;
  }
  if (e.event === 'user.role_changed') return `${String(d.from)} → ${String(d.to)}`;
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(', ');
}

const EVENT_OPTIONS = [{ value: '', label: 'Tümü' }, ...Object.entries(EVENT_LABELS).map(([value, label]) => ({ value, label }))];

/** doc 06 §10.4 _Giriş kayıtları_ — the `auth_events` log, newest first, 100 per page. */
export function ActivityClient() {
  const [event, setEvent] = useState('');
  const [page, setPage] = useState(0);
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const refresh = useCallback(() => {
    setLoad({ status: 'loading' });
    const params = new URLSearchParams({ page: String(page) });
    if (event !== '') params.set('event', event);
    fetch(`/api/users/activity?${params.toString()}`)
      .then(async (res) => {
        const data = (await res.json()) as { events?: AuthEvent[]; hasMore?: boolean; error?: string };
        if (!res.ok || !data.events) throw new Error(data.error ?? `HTTP ${res.status}`);
        setLoad({ status: 'ready', events: data.events, hasMore: data.hasMore === true });
      })
      .catch((e: unknown) => setLoad({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
  }, [event, page]);
  useEffect(refresh, [refresh]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Giriş kayıtları"
        description="Girişler, başarısız denemeler ve kullanıcı yönetimi işlemleri. 365 gün saklanır; parola, kod veya anahtar asla kaydedilmez."
        action={
          <Link href="/settings/users" className="text-sm text-(--color-accent) hover:underline">
            ← Kullanıcılar
          </Link>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Olay">
          <Select
            value={event}
            options={EVENT_OPTIONS}
            onChange={(e) => {
              setEvent(e.target.value);
              setPage(0);
            }}
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          disabled={load.status !== 'ready' || load.events.length === 0}
          onClick={() =>
            load.status === 'ready' &&
            downloadCsv(
              'giris-kayitlari.csv',
              load.events.map((e) => ({
                Zaman: formatDateTime(e.at),
                Olay: EVENT_LABELS[e.event] ?? e.event,
                Kullanıcı: e.user ?? '',
                'Yapan': e.actor,
                Ayrıntı: describeDetail(e),
                Adres: e.ip ?? '',
                Tarayıcı: e.userAgent ?? '',
              })),
            )
          }
        >
          Excel&apos;e Aktar
        </Button>
      </div>

      {load.status === 'loading' && <LoadingState message="Giriş kayıtları yükleniyor…" skeletonRows={5} />}
      {load.status === 'error' && <ErrorState message={`Giriş kayıtları okunamadı: ${load.message}`} onRetry={refresh} />}
      {load.status === 'ready' && load.events.length === 0 && (
        <EmptyState message="Kayıt yok." reason="Bu filtreye uyan bir giriş olayı henüz olmadı." />
      )}
      {load.status === 'ready' && load.events.length > 0 && (
        <>
          <TableFrame>
            <table className="w-full text-sm">
              <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-(--color-muted)`}>
                <tr>
                  <th className="px-3 py-2">Zaman</th>
                  <th className="px-3 py-2">Olay</th>
                  <th className="px-3 py-2">Kullanıcı</th>
                  <th className="px-3 py-2">Yapan</th>
                  <th className="px-3 py-2">Ayrıntı</th>
                  <th className="px-3 py-2">Adres</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {load.events.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-3 py-2">{formatDateTime(e.at)}</td>
                    <td className="px-3 py-2">{EVENT_LABELS[e.event] ?? e.event}</td>
                    <td className="px-3 py-2">{e.user ?? <span className="text-(--color-muted)">—</span>}</td>
                    <td className="px-3 py-2">{e.actor}</td>
                    <td className="px-3 py-2 text-xs">{describeDetail(e)}</td>
                    <td className="px-3 py-2 text-xs" title={e.userAgent ?? undefined}>
                      {e.ip ?? <span className="text-(--color-muted)">yerel</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
          <div className="flex items-center gap-2 text-sm">
            <Button type="button" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
              ← Daha yeni
            </Button>
            <span className="text-(--color-muted)">Sayfa {page + 1}</span>
            <Button type="button" variant="secondary" disabled={!load.hasMore} onClick={() => setPage(page + 1)}>
              Daha eski →
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
