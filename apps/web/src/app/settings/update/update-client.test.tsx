import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '@/test-utils';
import { UpdateClient } from './update-client';

/**
 * Settings > Güncelleme (auto-update spec §5.3): the running version, the ready release and its
 * one install button, and what the updater did last time.
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const READY = {
  available: true,
  currentVersion: '0.2.0',
  inProgress: false,
  state: {
    lastCheckAt: '2026-11-11T00:00:00.000Z',
    lastResult: 'ready',
    lastError: null,
    ready: { version: '0.2.1', notes: 'Hata düzeltmeleri', downloadBytes: 31_457_280, components: ['app'] },
  },
  status: {
    phase: 'rolled-back',
    step: null,
    history: [{ at: '2026-11-10T00:00:00.000Z', from: '0.1.22', to: '0.2.0', outcome: 'rolled-back', reason: 'sağlık kontrolü' }],
  },
};

describe('UpdateClient', () => {
  it('says plainly when this install has no self-update, and nothing else', async () => {
    stubFetch({ '/api/update': { body: { available: false, currentVersion: null, state: null, status: null, inProgress: false } } });
    render(<UpdateClient />);
    expect(await screen.findByText('Bu kurulumda otomatik güncelleme yok.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Şimdi kur' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Şimdi kontrol et' })).toBeNull();
  });

  it('shows the ready release with its size and the install button', async () => {
    stubFetch({ '/api/update': { body: READY } });
    render(<UpdateClient />);
    expect(await screen.findByText('0.2.1')).toBeTruthy();
    expect(screen.getByText('30.0 MB')).toBeTruthy();
    expect(screen.getByText('Hata düzeltmeleri')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Şimdi kur' })).toBeTruthy();
  });

  it('asks before installing, then posts the ready version and reports installing', async () => {
    stubFetch({ '/api/update': { body: READY }, '/api/update/apply': { status: 202, body: { started: true } }, '/api/health': { pending: true } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UpdateClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'Şimdi kur' }));
    expect(confirm).toHaveBeenCalledWith(
      'Servis 2–3 dakika duracak. Fiyat işleri yeni sürüm doğrulanana kadar duraklatılmış kalacak.',
    );
    expect(await screen.findByText('Kuruluyor…')).toBeTruthy();
    const post = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/api/update/apply'));
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ version: '0.2.1' });
  });

  it('shows a refusal and does not claim to be installing', async () => {
    stubFetch({ '/api/update': { body: READY }, '/api/update/apply': { status: 409, body: { error: 'Bir güncelleme zaten sürüyor.' } } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UpdateClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'Şimdi kur' }));
    expect(await screen.findByText('Bir güncelleme zaten sürüyor.')).toBeTruthy();
    expect(screen.queryByText('Kuruluyor…')).toBeNull();
  });

  it('labels the history in Turkish', async () => {
    stubFetch({ '/api/update': { body: READY } });
    render(<UpdateClient />);
    await waitFor(() => expect(screen.getByText('Geri dönüldü')).toBeTruthy());
    expect(screen.getByText('sağlık kontrolü')).toBeTruthy();
  });
});
