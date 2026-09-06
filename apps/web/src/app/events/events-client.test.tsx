import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { EventsClient } from './events-client';

/**
 * Smoke test for `/events` (doc 15 §6, Phase 4.6). Shape copied from `alerts-client.test.tsx`
 * (itself copied from the Phase 1c dashboard reference): one `fetch` stub per case, one stable
 * phrase asserted per case, no snapshots, no assertions on layout or class names.
 *
 * `EventsClient` fetches `/api/events` on mount and on every filter change (same route, since no
 * filter is set at mount). The listing-search autocomplete only fetches once the operator types
 * into the "İlan" field, so it needs no stub here.
 */

afterEach(() => cleanup());

describe('EventsClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ '/api/events': { pending: true } });

    render(<EventsClient />);

    expect(await screen.findByText('Olay günlüğü yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ '/api/events': { reject: new Error('network down') } });

    render(<EventsClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({ '/api/events': { body: { events: [], limit: 500 } } });

    render(<EventsClient />);

    expect(await screen.findByText('Henüz olay kaydı yok.')).toBeTruthy();
    expect(
      screen.getByText('Arka plan işleri ve pazaryeri entegrasyonları çalıştıkça burada birikir.'),
    ).toBeTruthy();
  });

  it('populated: shows an event row with its translated level and code', async () => {
    const now = Date.now();
    stubFetch({
      '/api/events': {
        body: {
          events: [
            {
              id: 'event-1',
              at: now,
              level: 'error',
              marketplaceCode: 'trendyol',
              listingId: null,
              jobRunId: null,
              code: 'SubmitPriceChangesBatchFailed',
              message: 'Fiyat gönderimi başarısız oldu.',
              context: null,
            },
          ],
          limit: 500,
        },
      },
    });

    render(<EventsClient />);

    // The raw `level` enum ('error') must not reach the screen as its own word — only its Turkish
    // label ('hata') should render.
    expect(await screen.findByText('SubmitPriceChangesBatchFailed')).toBeTruthy();
    expect(screen.getByText('Fiyat gönderimi başarısız oldu.')).toBeTruthy();
    expect(screen.getByText('hata')).toBeTruthy();
  });
});
