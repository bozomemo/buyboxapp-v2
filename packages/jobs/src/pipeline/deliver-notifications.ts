/**
 * `DeliverNotifications` — drains the notification outbox (doc 07 §7.6, doc 17 §6.2, build plan
 * 11.7). Every minute, in both modules.
 *
 * Per channel: take the pending rows, build **one** message naming up to
 * `MAX_VIOLATIONS_PER_MESSAGE` violations and counting the rest, send it once, and mark every row
 * it covered. A failure increments `attempts` and keeps the error; at `NOTIFY_MAX_ATTEMPTS` the
 * rows become `failed`. A channel that is not configured is skipped, its rows stay `pending` with
 * the reason, so the screen can say who was not told and why.
 *
 * Nothing here can un-store a violation or fail the look that opened it: the outbox is written
 * after the violation, and this job only ever reads violations.
 */
import {
  EmailChannel,
  SmsChannel,
  WebhookChannel,
  createSmsSender,
  smtpSettingsFromEnv,
  type NotificationChannel,
} from '@buybox/adapters';
import { bandViolationsRepo, eventsRepo, newId, notificationDeliveriesRepo, type AppDatabase } from '@buybox/db';
import { createLogger } from '@buybox/shared';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';
import { NOTIFY_MAX_ATTEMPTS, readNotificationRecipients } from '../notify-config.js';
import { formatBandViolationMessage } from './band-notifications.js';

export const DELIVER_NOTIFICATIONS_JOB = 'DeliverNotifications';

/** No options: a run drains every channel's outbox. */
export const DeliverNotificationsPayloadSchema = z.object({});

/** How many pending rows of one channel a run reads. One message covers all of them. */
const PENDING_BATCH = 500;

/**
 * The channels as this install has configured them: credentials from the environment, recipients
 * from `app_settings`. Read on every run, so a new recipient takes effect within a minute; a
 * changed credential, on the worker's next restart like every environment variable.
 */
export async function channelsFromConfiguration(
  appDb: AppDatabase,
  env: NodeJS.ProcessEnv = process.env,
): Promise<NotificationChannel[]> {
  const recipients = await readNotificationRecipients(appDb);
  return [
    new WebhookChannel(env.ALERTS_WEBHOOK_URL?.trim() || undefined),
    new EmailChannel(smtpSettingsFromEnv(env), recipients.email),
    new SmsChannel(createSmsSender(env, createLogger({ name: 'sms' })), recipients.sms),
  ];
}

export interface DeliverNotificationsDeps {
  /** Tests inject channels; production builds them from configuration on every run. */
  readonly channels?: readonly NotificationChannel[];
}

export async function deliverNotifications(
  ctx: JobContext,
  deps: DeliverNotificationsDeps = {},
): Promise<JobResult> {
  DeliverNotificationsPayloadSchema.parse(JSON.parse(ctx.payload || '{}'));
  const channels = deps.channels ?? (await channelsFromConfiguration(ctx.appDb));
  let itemsTotal = 0;
  let itemsOk = 0;
  let itemsFailed = 0;

  for (const channel of channels) {
    const pending = await notificationDeliveriesRepo.pendingDeliveries(ctx.appDb, channel.code, PENDING_BATCH);
    if (pending.length === 0) continue;
    itemsTotal += pending.length;
    const ids = pending.map((row) => row.id);

    const readiness = channel.readiness();
    if (!readiness.ready) {
      await notificationDeliveriesRepo.noteWaiting(ctx.appDb, ids, `bildirilmedi: ${readiness.reason}`);
      continue;
    }

    const violations = await bandViolationsRepo.bandViolationsByIds(
      ctx.appDb,
      [...new Set(pending.filter((row) => row.subjectType === 'bandViolation').map((row) => row.subjectId))],
    );
    const known = new Set(violations.map((v) => v.id));
    // A violation deleted with its brand product (doc 17 §5.3) has nothing left to describe.
    const orphaned = pending.filter((row) => !known.has(row.subjectId)).map((row) => row.id);
    if (orphaned.length > 0) {
      await notificationDeliveriesRepo.recordAttemptFailure(ctx.appDb, orphaned, 'ihlal kaydı silinmiş', 0);
      itemsFailed += orphaned.length;
    }
    const deliverable = pending.filter((row) => known.has(row.subjectId)).map((row) => row.id);
    if (deliverable.length === 0) continue;

    const nowMs = ctx.clock.nowMs();
    const result = await channel.send(formatBandViolationMessage(violations));
    if (result.ok) {
      await notificationDeliveriesRepo.markSent(ctx.appDb, deliverable, nowMs);
      itemsOk += deliverable.length;
    } else {
      await notificationDeliveriesRepo.recordAttemptFailure(
        ctx.appDb,
        deliverable,
        result.error.detail,
        NOTIFY_MAX_ATTEMPTS,
      );
      itemsFailed += deliverable.length;
      await eventsRepo.logEvent(ctx.appDb, {
        id: newId(),
        at: nowMs,
        level: 'warn',
        marketplaceCode: null,
        listingId: null,
        jobRunId: ctx.correlationId,
        code: 'NotificationSendFailed',
        message: `Notification via ${channel.code} failed for ${deliverable.length} delivery(ies): ${result.error.detail}`,
        context: JSON.stringify({ channel: channel.code, count: deliverable.length }),
      });
    }
  }

  return { itemsTotal, itemsOk, itemsFailed };
}
