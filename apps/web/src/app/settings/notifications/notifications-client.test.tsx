import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { NotificationsClient } from './notifications-client';

/** Smoke test for `/settings/notifications` (doc 15 §6): one `fetch` stub, one stable phrase per case. */

afterEach(() => cleanup());

const DATA = {
  channels: [
    { code: 'webhook', ready: true, reason: null },
    { code: 'email', ready: false, reason: 'e-posta yapılandırılmamış (SMTP_HOST, SMTP_FROM)' },
    { code: 'sms', ready: false, reason: 'SMS sağlayıcısı seçilmemiş' },
  ],
  recipients: { email: ['a@x.com'], sms: [] },
  counts: [{ channel: 'email', state: 'pending', n: 3 }],
};

describe('NotificationsClient', () => {
  it('loading', async () => {
    stubFetch({ '/api/settings/notifications': { pending: true } });
    render(<NotificationsClient />);
    expect(await screen.findByText('Bildirim ayarları yükleniyor…')).toBeTruthy();
  });

  it('error', async () => {
    stubFetch({ '/api/settings/notifications': { reject: new Error('network down') } });
    render(<NotificationsClient />);
    expect(await screen.findByText('network down')).toBeTruthy();
  });

  it('shows each channel state, why an unready one waits, and its pending count', async () => {
    stubFetch({ '/api/settings/notifications': { body: DATA } });
    render(<NotificationsClient />);
    expect(await screen.findByText(/· hazır/)).toBeTruthy();
    expect(screen.getByText(/e-posta yapılandırılmamış/)).toBeTruthy();
    expect(screen.getByText('3 bekliyor')).toBeTruthy();
    expect(screen.getByDisplayValue('a@x.com')).toBeTruthy();
  });
});
