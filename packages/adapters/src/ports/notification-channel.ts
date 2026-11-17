/**
 * The notification channel port (doc 17 §6.1, build plan 11.7).
 *
 * One adapter per channel: webhook, e-mail, SMS. The screen is a channel too, but it needs no
 * adapter — it is the violation list itself.
 *
 * A channel is either **ready** or says why it is not (no URL, no SMTP host, no recipients, no SMS
 * provider). An unready channel is not an error: its deliveries wait, with the reason, until it is
 * configured (doc 07 §7.6). A send that was attempted and failed returns a failure the caller
 * records and retries; it never throws for a refused message.
 */
import type { Result } from '@buybox/shared';

export type NotificationChannelCode = 'webhook' | 'email' | 'sms';

/** What a message says. Written once by the caller; each channel takes the part it can carry. */
export interface NotificationMessage {
  /** E-mail subject line. */
  readonly subject: string;
  /** The full plain-text body: webhook `text` and e-mail body. */
  readonly text: string;
  /** One line, for SMS: "12 yeni fiyat ihlali — Alarmlar ekranına bakın" (doc 17 §6.2). */
  readonly shortText: string;
  /** Structured items for a webhook consumer that does not want to parse `text`. */
  readonly items: readonly Record<string, unknown>[];
  /** Items left out of `items` and `text` by the per-message cap, counted instead. */
  readonly omitted: number;
}

export type ChannelReadiness = { readonly ready: true } | { readonly ready: false; readonly reason: string };

export interface ChannelFailure {
  /** For `last_error` and the log. Never contains a credential. */
  readonly detail: string;
}

export interface NotificationChannel {
  readonly code: NotificationChannelCode;
  readiness(): ChannelReadiness;
  send(message: NotificationMessage): Promise<Result<void, ChannelFailure>>;
}
