/**
 * Notification channel adapters (doc 17 §6.1, build plan 11.7).
 *
 * Credentials come from the environment (CLAUDE.md): `ALERTS_WEBHOOK_URL`, `SMTP_*`, and the SMS
 * provider's own variables behind `SmsSender`. Recipients are not credentials and come from
 * `app_settings` — the caller passes them in.
 *
 * No error detail may carry a credential: a webhook URL is a bearer token, so a failure names
 * the HTTP status, never the URL; an SMTP failure is reduced to the server's reply code/message.
 */
import { err, ok } from '@buybox/shared';
import type {
  ChannelFailure,
  ChannelReadiness,
  NotificationChannel,
  NotificationMessage,
} from '../ports/notification-channel.js';
import type { SmsSender } from '../ports/sms.js';

// ── Webhook ────────────────────────────────────────────────────────────────────────────────

/**
 * POSTs JSON with a `text` field a chat webhook (Slack, Teams-style) renders as-is, and the
 * structured `items` for anything programmatic — the same shape as the findings webhook.
 */
export class WebhookChannel implements NotificationChannel {
  readonly code = 'webhook' as const;

  constructor(
    private readonly url: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  readiness(): ChannelReadiness {
    return this.url ? { ready: true } : { ready: false, reason: 'webhook yapılandırılmamış (ALERTS_WEBHOOK_URL)' };
  }

  async send(message: NotificationMessage) {
    if (!this.url) return err<ChannelFailure>({ detail: 'ALERTS_WEBHOOK_URL is not set' });
    try {
      const response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message.text,
          count: message.items.length + message.omitted,
          items: message.items,
        }),
      });
      if (!response.ok) return err<ChannelFailure>({ detail: `webhook answered HTTP ${response.status}` });
      return ok<void, ChannelFailure>(undefined);
    } catch (error) {
      // The error message of a failed fetch can include the URL; keep only its class of failure.
      return err<ChannelFailure>({ detail: `webhook unreachable: ${error instanceof Error ? error.name : 'error'}` });
    }
  }
}

// ── E-mail ─────────────────────────────────────────────────────────────────────────────────

export interface SmtpSettings {
  readonly host: string;
  readonly port: number;
  readonly user: string | undefined;
  readonly password: string | undefined;
  readonly from: string;
}

/** The one call this adapter makes of an SMTP library, so a test double is three lines. */
export interface MailTransport {
  sendMail(mail: { from: string; to: string[]; subject: string; text: string }): Promise<unknown>;
}

/** `SMTP_*` from the environment, or `null` when the channel is not configured. */
export function smtpSettingsFromEnv(env: NodeJS.ProcessEnv): SmtpSettings | null {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  if (!host || !from) return null;
  const port = Number(env.SMTP_PORT ?? '587');
  return {
    host,
    port: Number.isInteger(port) && port > 0 ? port : 587,
    user: env.SMTP_USER?.trim() || undefined,
    password: env.SMTP_PASSWORD || undefined,
    from,
  };
}

/**
 * Builds an SMTP transport with `nodemailer`, loaded on first use. Port 465 is implicit TLS;
 * any other port upgrades with STARTTLS when the server offers it.
 */
export async function createSmtpTransport(settings: SmtpSettings): Promise<MailTransport> {
  // A variable specifier keeps the type checker from requiring the package at build time; the
  // shape used is the one-method `MailTransport` above.
  const specifier = 'nodemailer';
  const mod = (await import(specifier)) as {
    default?: { createTransport(options: unknown): MailTransport };
    createTransport?(options: unknown): MailTransport;
  };
  const createTransport = mod.createTransport ?? mod.default?.createTransport;
  if (!createTransport) throw new Error('nodemailer is not installed');
  return createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    auth: settings.user ? { user: settings.user, pass: settings.password ?? '' } : undefined,
  });
}

export class EmailChannel implements NotificationChannel {
  readonly code = 'email' as const;

  constructor(
    private readonly settings: SmtpSettings | null,
    private readonly recipients: readonly string[],
    private readonly transportFactory: (settings: SmtpSettings) => Promise<MailTransport> = createSmtpTransport,
  ) {}

  readiness(): ChannelReadiness {
    if (!this.settings) return { ready: false, reason: 'e-posta yapılandırılmamış (SMTP_HOST, SMTP_FROM)' };
    if (this.recipients.length === 0) return { ready: false, reason: 'e-posta alıcısı tanımlanmamış' };
    return { ready: true };
  }

  async send(message: NotificationMessage) {
    if (!this.settings || this.recipients.length === 0) {
      return err<ChannelFailure>({ detail: 'e-mail channel not configured' });
    }
    try {
      const transport = await this.transportFactory(this.settings);
      await transport.sendMail({
        from: this.settings.from,
        to: [...this.recipients],
        subject: message.subject,
        text: message.text,
      });
      return ok<void, ChannelFailure>(undefined);
    } catch (error) {
      return err<ChannelFailure>({ detail: smtpErrorDetail(error) });
    }
  }
}

/** The server's reply code and text, without anything that could echo a credential. */
function smtpErrorDetail(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { responseCode?: number; code?: string; response?: string };
    const parts = [e.code, e.responseCode?.toString(), e.response?.slice(0, 200)].filter(Boolean);
    if (parts.length > 0) return `SMTP: ${parts.join(' ')}`;
  }
  return `SMTP: ${error instanceof Error ? error.name : 'error'}`;
}

// ── SMS ────────────────────────────────────────────────────────────────────────────────────

/**
 * A one-line digest to every configured number (doc 17 §6.2): an SMS costs money per message
 * and is read on a phone. The channel succeeds when at least one number was sent to; numbers
 * that failed are named in the detail of a total failure only.
 */
export class SmsChannel implements NotificationChannel {
  readonly code = 'sms' as const;

  constructor(
    private readonly sender: SmsSender,
    private readonly numbers: readonly string[],
  ) {}

  readiness(): ChannelReadiness {
    if (!this.sender.available) return { ready: false, reason: 'SMS sağlayıcısı seçilmemiş' };
    if (this.numbers.length === 0) return { ready: false, reason: 'SMS alıcısı tanımlanmamış' };
    return { ready: true };
  }

  async send(message: NotificationMessage) {
    let sent = 0;
    const failures: string[] = [];
    for (const number of this.numbers) {
      const result = await this.sender.send(number, message.shortText);
      if (result.ok) sent += 1;
      else failures.push(result.error.kind);
    }
    if (sent === 0) return err<ChannelFailure>({ detail: `SMS: ${failures.join(', ') || 'no recipients'}` });
    return ok<void, ChannelFailure>(undefined);
  }
}
