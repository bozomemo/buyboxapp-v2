/**
 * Notification channels (doc 17 §6.1): readiness says why a channel cannot send, a failed send is
 * a recorded failure rather than a throw, and no failure detail carries a credential.
 */
import { err, ok } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import type { NotificationMessage } from '../ports/notification-channel.js';
import type { SmsSender } from '../ports/sms.js';
import {
  EmailChannel,
  SmsChannel,
  WebhookChannel,
  createSmtpTransport,
  smtpSettingsFromEnv,
  type MailTransport,
} from './channels.js';

const MESSAGE: NotificationMessage = {
  subject: '2 yeni fiyat ihlali',
  text: 'gövde',
  shortText: '2 yeni fiyat ihlali — Alarmlar ekranına bakın',
  items: [{ id: 'v1' }, { id: 'v2' }],
  omitted: 0,
};

const SECRET_URL = 'https://hooks.example.invalid/T000/B000/secret-token';

describe('WebhookChannel', () => {
  it('not ready without a URL', () => {
    expect(new WebhookChannel(undefined).readiness()).toEqual({ ready: false, reason: expect.stringContaining('webhook') });
  });

  it('posts text, count and items as JSON', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const result = await new WebhookChannel(SECRET_URL, fetchImpl).send(MESSAGE);

    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ url: SECRET_URL, body: { text: 'gövde', count: 2, items: [{ id: 'v1' }, { id: 'v2' }] } }]);
  });

  it.each([
    { name: 'HTTP error', fetchImpl: async () => new Response(null, { status: 500 }) },
    {
      name: 'network error naming the URL',
      fetchImpl: async () => {
        throw new TypeError(`fetch failed for ${SECRET_URL}`);
      },
    },
  ])('$name: a failure, and the detail never contains the URL', async ({ fetchImpl }) => {
    const result = await new WebhookChannel(SECRET_URL, fetchImpl as unknown as typeof fetch).send(MESSAGE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.detail).not.toContain('secret-token');
  });
});

describe('smtpSettingsFromEnv', () => {
  it.each([
    { name: 'unset', env: {}, expected: null },
    { name: 'host without from', env: { SMTP_HOST: 'smtp.x' }, expected: null },
    {
      name: 'host and from, default port',
      env: { SMTP_HOST: 'smtp.x', SMTP_FROM: 'a@x' },
      expected: { host: 'smtp.x', port: 587, user: undefined, password: undefined, from: 'a@x' },
    },
    {
      name: 'everything',
      env: { SMTP_HOST: 'smtp.x', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASSWORD: 'p', SMTP_FROM: 'a@x' },
      expected: { host: 'smtp.x', port: 465, user: 'u', password: 'p', from: 'a@x' },
    },
  ])('$name', ({ env, expected }) => {
    expect(smtpSettingsFromEnv(env)).toEqual(expected);
  });
});

describe('EmailChannel', () => {
  const settings = { host: 'smtp.x', port: 587, user: 'u', password: 'hunter2', from: 'alarm@x' };

  it.each([
    { name: 'no SMTP settings', channel: new EmailChannel(null, ['a@x']), reason: 'e-posta sunucusu ayarlanmamış' },
    { name: 'no recipients', channel: new EmailChannel(settings, []), reason: 'e-posta alıcısı' },
  ])('not ready: $name', ({ channel, reason }) => {
    expect(channel.readiness()).toEqual({ ready: false, reason: expect.stringContaining(reason) });
  });

  it('sends one mail to every recipient', async () => {
    const sent: unknown[] = [];
    const transport: MailTransport = { sendMail: async (mail) => sent.push(mail) };
    const result = await new EmailChannel(settings, ['a@x', 'b@x'], async () => transport).send(MESSAGE);
    expect(result.ok).toBe(true);
    expect(sent).toEqual([{ from: 'alarm@x', to: ['a@x', 'b@x'], subject: '2 yeni fiyat ihlali', text: 'gövde' }]);
  });

  it('a refused send is a failure with the server reply, not the password', async () => {
    const transport: MailTransport = {
      sendMail: async () => {
        throw Object.assign(new Error('Invalid login: hunter2'), { code: 'EAUTH', responseCode: 535, response: '535 auth failed' });
      },
    };
    const result = await new EmailChannel(settings, ['a@x'], async () => transport).send(MESSAGE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail).toContain('535');
      expect(result.error.detail).not.toContain('hunter2');
    }
  });
});

describe('SmsChannel', () => {
  function sender(outcomes: Record<string, boolean>, sent: string[] = []): SmsSender {
    return {
      name: 'test',
      available: true,
      send: async (to, text) => {
        sent.push(`${to}:${text}`);
        return outcomes[to] ? ok({ providerRef: 'r' }) : err({ kind: 'rejected' as const, detail: 'no' });
      },
    };
  }

  it('not ready without a provider or without numbers', () => {
    const disabled: SmsSender = { name: 'disabled', available: false, send: async () => err({ kind: 'unavailable', detail: '' }) };
    expect(new SmsChannel(disabled, ['+905']).readiness()).toEqual({ ready: false, reason: 'SMS sağlayıcısı seçilmemiş' });
    expect(new SmsChannel(sender({}), []).readiness()).toEqual({ ready: false, reason: 'SMS alıcısı tanımlanmamış' });
  });

  it('sends the one-line digest to every number; one success is a success', async () => {
    const sent: string[] = [];
    const result = await new SmsChannel(sender({ '+9051': true, '+9052': false }, sent), ['+9051', '+9052']).send(MESSAGE);
    expect(result.ok).toBe(true);
    expect(sent).toEqual([
      '+9051:2 yeni fiyat ihlali — Alarmlar ekranına bakın',
      '+9052:2 yeni fiyat ihlali — Alarmlar ekranına bakın',
    ]);
  });

  it('every number refused is a failure', async () => {
    const result = await new SmsChannel(sender({}), ['+9051']).send(MESSAGE);
    expect(result).toEqual({ ok: false, error: { detail: 'SMS: rejected' } });
  });
});

describe('createSmtpTransport', () => {
  // nodemailer is loaded on first send, so nothing failed until the web build bundled the
  // adapters: it was never declared, and a clean install's `next build` could not resolve it
  // (user-guide review 2026-11-18). Building a transport opens no connection.
  // The first import of nodemailer is a cold load of a large package: seconds on a busy release
  // build (v0.2.11 timed out at vitest's 5 s default, 2026-11-24), which is not what this checks.
  it('builds a transport from the declared nodemailer package', async () => {
    const transport = await createSmtpTransport({
      host: 'smtp.example.test',
      port: 587,
      user: 'u',
      password: 'p',
      from: 'buybox@example.test',
    });
    expect(typeof transport.sendMail).toBe('function');
  }, 60_000);
});
