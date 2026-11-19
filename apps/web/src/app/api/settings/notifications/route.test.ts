// @vitest-environment node
/**
 * Settings > Bildirimler (doc 17 §6.1) against a real migrated database: readiness never exposes
 * a credential, recipients are validated and normalised before they are stored, and a test send
 * to an unconfigured channel is refused with the reason rather than attempted.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, runMigrations, type AppDatabase } from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { GET, POST } from './route';
import { POST as TEST } from './test/route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };
let cookie: string;

const request = (url: string, init?: RequestInit) => withCookie(new Request(url, init), cookie);
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-notifications-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  delete process.env.ALERTS_WEBHOOK_URL;
  delete process.env.SMTP_HOST;
  delete process.env.SMS_PROVIDER;
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  cookie = await signIn(appDb);
});

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

describe('/api/settings/notifications', () => {
  it('nothing configured: every channel says why, recipients empty', async () => {
    const body = (await (await GET(request('http://x/api/settings/notifications'), routeContext())).json()) as {
      channels: { code: string; ready: boolean; reason: string | null }[];
      recipients: unknown;
    };
    expect(body.channels).toEqual([
      { code: 'webhook', ready: false, reason: expect.stringContaining('webhook adresi ayarlanmamış') },
      { code: 'email', ready: false, reason: expect.stringContaining('e-posta sunucusu ayarlanmamış') },
      { code: 'sms', ready: false, reason: 'SMS sağlayıcısı seçilmemiş' },
    ]);
    expect(body.recipients).toEqual({ email: [], sms: [] });
  });

  it('a configured webhook reads as ready and the URL is never returned', async () => {
    process.env.ALERTS_WEBHOOK_URL = 'https://hooks.example.invalid/secret-token';
    const text = await (await GET(request('http://x/api/settings/notifications'), routeContext())).text();
    expect(text).toContain('"code":"webhook","ready":true');
    expect(text).not.toContain('secret-token');
  });

  it('stores normalised recipients and refuses a bad one', async () => {
    const saved = await POST(
      request('http://x/api/settings/notifications', json({ email: [' A@X.com '], sms: ['0532 123 45 67'] })),
      routeContext(),
    );
    expect(saved.status).toBe(200);
    const body = (await (await GET(request('http://x/api/settings/notifications'), routeContext())).json()) as {
      recipients: unknown;
    };
    expect(body.recipients).toEqual({ email: ['a@x.com'], sms: ['+905321234567'] });

    const refused = await POST(request('http://x/api/settings/notifications', json({ email: ['nope'] })), routeContext());
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toContain('Geçersiz e-posta adresi: nope');
  });

  it('test send to an unconfigured channel is refused with the reason, not attempted', async () => {
    const response = await TEST(request('http://x/api/settings/notifications/test', json({ channel: 'email' })), routeContext());
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toContain('e-posta sunucusu ayarlanmamış');
  });
});
