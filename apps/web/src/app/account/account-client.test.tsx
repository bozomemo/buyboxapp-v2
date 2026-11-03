import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '@/test-utils';
import { AccountClient, type AccountData } from './account-client';

/**
 * Smoke test for `/account` (doc 06 §10.3), added with the redesign's phase 3 (plan
 * `2026-11-03-ui-redesign-phase-3-rest.md`, Task 10) so the kit conversion of its row actions has
 * something pinning their behaviour. `AccountClient` reads `/api/account` on mount and posts its
 * actions to the same path.
 */

afterEach(() => cleanup());

const NOW = Date.now();

const ACCOUNT: AccountData = {
  user: {
    username: 'yonetici',
    displayName: 'Yönetici',
    roleLabel: 'Yönetici',
    lastLoginAt: NOW - 60_000,
    totpEnabled: false,
    smsEnabled: false,
    phoneVerified: false,
    phoneHint: null,
    smsAvailable: false,
    recoveryCodesLeft: 0,
  },
  sessions: [
    { id: 's-current', current: true, createdAt: NOW - 3_600_000, lastSeenAt: NOW, ip: null, userAgent: null },
    { id: 's-other', current: false, createdAt: NOW - 7_200_000, lastSeenAt: NOW - 600_000, ip: '10.0.0.2', userAgent: null },
  ],
  devices: [{ id: 'd1', label: null, createdAt: NOW - 86_400_000, expiresAt: NOW + 86_400_000, lastUsedAt: null }],
};

describe('AccountClient', () => {
  it('only other sessions can be ended', async () => {
    stubFetch({ '/api/account': { body: ACCOUNT } });

    render(<AccountClient />);

    const end = await screen.findAllByRole('button', { name: 'Sonlandır' });
    expect(end).toHaveLength(1);
    expect(end[0]!.className).toContain('h-8');
    expect(screen.getByRole('button', { name: 'Unut' }).className).toContain('h-8');
  });

  it('ending a session posts its id', async () => {
    stubFetch({ '/api/account': { body: ACCOUNT } });

    render(<AccountClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'Sonlandır' }));

    await waitFor(() => {
      const post = vi
        .mocked(globalThis.fetch)
        .mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ action: 'endSession', id: 's-other' });
    });
  });
});
