/**
 * Notification constants and the recipient setting (doc 17 §6, doc 08, build plan 11.7).
 *
 * Recipients are not credentials, so they live in `app_settings` (`notifications.recipients`),
 * audited like every setting. Channel credentials stay in the environment.
 */
import { configRepo, type AppDatabase } from '@buybox/db';

/** At most this many violations are described in one message; the rest are counted (doc 08). */
export const MAX_VIOLATIONS_PER_MESSAGE = 10;

/** One-minute cadence: ten minutes of a channel being down before a delivery is `failed`. */
export const NOTIFY_MAX_ATTEMPTS = 10;

/**
 * A violation reopened for the same (card, kind, seller) within this window of the last one
 * resolving is recorded but not notified — its deliveries are written `suppressed` (doc 17 §6.2).
 */
export const BAND_RENOTIFY_QUIET_MS = 6 * 60 * 60_000;

export const NOTIFICATION_RECIPIENTS_SETTING_KEY = 'notifications.recipients';

export interface NotificationRecipients {
  readonly email: readonly string[];
  /** E.164 (`+905…`). */
  readonly sms: readonly string[];
}

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const E164 = /^\+[1-9][0-9]{7,14}$/;

/**
 * Normalises what an operator typed: one address or number per entry, trimmed, duplicates and
 * blanks dropped. A Turkish mobile typed the local way (`0532…` or `532…`) becomes `+90532…`.
 * Returns the problems instead when any entry is not an address or a number.
 */
export function parseNotificationRecipients(input: {
  email?: readonly string[];
  sms?: readonly string[];
}): NotificationRecipients | { readonly errors: readonly string[] } {
  const errors: string[] = [];
  const email = [...new Set((input.email ?? []).map((e) => e.trim().toLowerCase()).filter((e) => e !== ''))];
  for (const e of email) if (!EMAIL.test(e)) errors.push(`Geçersiz e-posta adresi: ${e}`);

  const sms = [
    ...new Set(
      (input.sms ?? [])
        .map((n) => n.replace(/[\s()-]/g, ''))
        .filter((n) => n !== '')
        .map((n) => (n.startsWith('+') ? n : n.startsWith('0') ? `+90${n.slice(1)}` : `+90${n}`)),
    ),
  ];
  for (const n of sms) if (!E164.test(n)) errors.push(`Geçersiz telefon numarası: ${n}`);

  return errors.length > 0 ? { errors } : { email, sms };
}

/** The stored recipients; none when the setting was never saved or cannot be read. */
export async function readNotificationRecipients(appDb: AppDatabase): Promise<NotificationRecipients> {
  const row = await configRepo.getAppSetting(appDb, NOTIFICATION_RECIPIENTS_SETTING_KEY);
  if (!row) return { email: [], sms: [] };
  try {
    const parsed = parseNotificationRecipients(JSON.parse(row.value) as { email?: string[]; sms?: string[] });
    return 'errors' in parsed ? { email: [], sms: [] } : parsed;
  } catch {
    return { email: [], sms: [] };
  }
}
