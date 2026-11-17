/**
 * Settings > Bildirimler (doc 17 §6.1, build plan 11.7).
 *
 * GET: each channel's readiness as the worker will see it, the stored recipients, and the outbox
 * counts per channel and state — so the screen can say "3 bildirim bekliyor: e-posta
 * yapılandırılmamış" rather than implying someone was told.
 *
 * POST: the recipients. Not credentials, so they are a settings row, audited by `setAppSetting`.
 * Channel credentials (`ALERTS_WEBHOOK_URL`, `SMTP_*`, the SMS provider) stay in the environment
 * and are never returned: readiness says only whether each is set.
 */
import { configRepo, newId, notificationDeliveriesRepo } from '@buybox/db';
import {
  NOTIFICATION_RECIPIENTS_SETTING_KEY,
  channelsFromConfiguration,
  parseNotificationRecipients,
  readNotificationRecipients,
} from '@buybox/jobs';
import { NextResponse } from 'next/server';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';

async function getHandler() {
  const appDb = getAppDb();
  const [channels, recipients, counts] = await Promise.all([
    channelsFromConfiguration(appDb),
    readNotificationRecipients(appDb),
    notificationDeliveriesRepo.countByChannelAndState(appDb),
  ]);
  return NextResponse.json({
    channels: channels.map((channel) => {
      const readiness = channel.readiness();
      return { code: channel.code, ready: readiness.ready, reason: readiness.ready ? null : readiness.reason };
    }),
    recipients,
    counts,
  });
}

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const raw = await readJsonBody<{ email?: unknown; sms?: unknown }>(request);
  if (raw === null) return invalidBody();
  const asList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  const parsed = parseNotificationRecipients({ email: asList(raw.email), sms: asList(raw.sms) });
  if ('errors' in parsed) return NextResponse.json({ error: parsed.errors.join(' · ') }, { status: 400 });

  await configRepo.setAppSetting(
    getAppDb(),
    {
      key: NOTIFICATION_RECIPIENTS_SETTING_KEY,
      value: JSON.stringify(parsed),
      updatedBy: auth.actor,
      updatedAt: Date.now(),
    },
    newId(),
  );
  return NextResponse.json({ ok: true, recipients: parsed });
}

export const GET = withPermission('view', getHandler);
export const POST = withPermission('settings.manage', postHandler);
