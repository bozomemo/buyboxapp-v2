/**
 * _Test gönder_ (doc 17 §6.1): sends one clearly-marked test message through one channel, as the
 * worker would build it, and answers with the channel's own failure detail. Writes no delivery
 * row and touches no violation.
 *
 * `settings.manage` only: it sends a message to real recipients, and an SMS costs money.
 */
import type { NotificationMessage } from '@buybox/adapters';
import { channelsFromConfiguration } from '@buybox/jobs';
import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/server/auth/guard';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';

const TEST_MESSAGE: NotificationMessage = {
  subject: 'Test bildirimi — BuyBox fiyat alarmı',
  text: 'Bu bir test mesajıdır. Fiyat bandı ihlalleri bu kanaldan bildirilecek.',
  shortText: 'BuyBox test mesajı: fiyat alarmları bu numaraya gelecek.',
  items: [],
  omitted: 0,
};

async function postHandler(request: Request) {
  const raw = await readJsonBody<{ channel?: unknown }>(request);
  if (raw === null) return invalidBody();
  const channels = await channelsFromConfiguration(getAppDb());
  const channel = channels.find((c) => c.code === raw.channel);
  if (!channel) return NextResponse.json({ error: 'Bilinmeyen kanal.' }, { status: 400 });

  const readiness = channel.readiness();
  if (!readiness.ready) return NextResponse.json({ ok: false, error: readiness.reason }, { status: 409 });

  const result = await channel.send(TEST_MESSAGE);
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: result.error.detail }, { status: 502 });
}

export const POST = withPermission('settings.manage', postHandler);
