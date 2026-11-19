'use client';

/**
 * Settings > Bildirimler (doc 17 §6.1, build plan 11.7).
 *
 * Each channel's state as the worker sees it, the recipients, and a _Test gönder_ per channel.
 * Credentials are not edited here and never shown: a webhook URL is a bearer token and SMTP has a
 * password, so both live in the environment (doc 08). This screen says only whether each is set.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, ErrorState, Field, LoadingState, Section, StatusBanner } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { PermissionFieldset } from '@/lib/permissions';

type ChannelCode = 'webhook' | 'email' | 'sms';
type State = 'pending' | 'sent' | 'failed' | 'suppressed';

interface Data {
  channels: { code: ChannelCode; ready: boolean; reason: string | null }[];
  recipients: { email: string[]; sms: string[] };
  counts: { channel: ChannelCode; state: State; n: number }[];
}

const CHANNEL_LABELS: Record<ChannelCode, string> = { webhook: 'Webhook', email: 'E-posta', sms: 'SMS' };
const CHANNEL_HELP: Record<ChannelCode, string> = {
  webhook: 'Slack/Teams türü bir adres. Sunucu ortamında ALERTS_WEBHOOK_URL ile ayarlanır.',
  email: 'SMTP sunucusu ortamda (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM) ayarlanır; alıcılar aşağıda.',
  sms: 'Tek satırlık özet gönderilir. SMS sağlayıcısı seçildiğinde etkinleşir; numaralar aşağıda.',
};
const STATE_LABELS: Record<State, string> = {
  pending: 'bekliyor',
  sent: 'gönderildi',
  failed: 'başarısız',
  suppressed: 'sessiz dönemde',
};

/** One entry per line; commas and semicolons also split, since that is how addresses get pasted. */
function splitLines(text: string): string[] {
  return text
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

export function NotificationsClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sms, setSms] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    fetch('/api/settings/notifications')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Bildirim ayarları yüklenemedi (HTTP ${r.status}).`))))
      .then((body: Data) => {
        setData(body);
        setEmail(body.recipients.email.join('\n'));
        setSms(body.recipients.sms.join('\n'));
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(load, [load]);

  async function save() {
    setBusy('save');
    setBanner(null);
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: splitLines(email), sms: splitLines(sms) }),
      });
      const body = (await res.json()) as { error?: string };
      setBanner(res.ok ? { ok: true, message: 'Alıcılar kaydedildi.' } : { ok: false, message: body.error ?? 'Kaydedilemedi.' });
      if (res.ok) load();
    } finally {
      setBusy(null);
    }
  }

  async function sendTest(code: ChannelCode) {
    setBusy(code);
    setBanner(null);
    try {
      const res = await fetch('/api/settings/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: code }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      setBanner(
        body.ok
          ? { ok: true, message: `${CHANNEL_LABELS[code]} test mesajı gönderildi.` }
          : { ok: false, message: `${CHANNEL_LABELS[code]} test mesajı gönderilemedi: ${body.error ?? 'bilinmeyen hata'}` },
      );
    } finally {
      setBusy(null);
    }
  }

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!data) return <LoadingState message="Bildirim ayarları yükleniyor…" skeletonRows={3} />;

  const countsOf = (code: ChannelCode) => data.counts.filter((c) => c.channel === code && c.n > 0);

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <p className="text-sm text-(--color-muted)">
        Yeni açılan her fiyat bandı ihlali aşağıdaki kanallardan bildirilir. Devam eden ve kapanan ihlaller
        bildirilmez. Aynı satıcı 6 saat içinde yeniden bandın dışına çıkarsa kayıt tutulur ama tekrar
        bildirilmez.
      </p>

      <PermissionFieldset permission="settings.manage">
      <Section id="notification-channels" title="Kanallar" card>
        <ul className="space-y-3">
          {data.channels.map((channel) => (
            <li key={channel.code} className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {CHANNEL_LABELS[channel.code]}{' '}
                  <span className={channel.ready ? 'text-(--color-success)' : 'text-(--color-warning)'}>
                    · {channel.ready ? 'hazır' : channel.reason}
                  </span>
                </div>
                <div className="text-xs text-(--color-muted)">{CHANNEL_HELP[channel.code]}</div>
                {countsOf(channel.code).length > 0 && (
                  <div className="mt-1 text-xs text-(--color-muted)">
                    {countsOf(channel.code)
                      .map((c) => `${formatNumber(c.n)} ${STATE_LABELS[c.state]}`)
                      .join(' · ')}
                  </div>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={!channel.ready || busy !== null}
                onClick={() => void sendTest(channel.code)}
              >
                {busy === channel.code ? 'Gönderiliyor…' : 'Test gönder'}
              </Button>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="notification-recipients" title="Alıcılar" card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-posta adresleri (her satıra bir tane)">
            {/* kit-exempt: multi-line list input, the kit has no textarea control */}
            <textarea
              className="min-h-28 w-full rounded border border-(--color-border) bg-(--color-surface) p-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="marka@ornek.com"
            />
          </Field>
          <Field label="SMS numaraları (her satıra bir tane)">
            {/* kit-exempt: multi-line list input, the kit has no textarea control */}
            <textarea
              className="min-h-28 w-full rounded border border-(--color-border) bg-(--color-surface) p-2 text-sm"
              value={sms}
              onChange={(e) => setSms(e.target.value)}
              placeholder="0532 123 45 67"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Button type="button" onClick={() => void save()} disabled={busy !== null}>
            {busy === 'save' ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </Section>

      {banner && <StatusBanner ok={banner.ok} message={banner.message} />}
      </PermissionFieldset>
    </div>
  );
}
