import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { RetentionClient } from './retention-client';

/**
 * Smoke test for `/settings/retention` (doc 15 §6, Phase 5 — Tier D).
 *
 * The response is always a full set of nine windows — there is no empty collection here.
 * "Empty" is read as `isDefault: true` (nobody has customised retention yet); "populated" is
 * `isDefault: false` (a saved, customised set of windows).
 */

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/settings/retention';

const WINDOWS = {
  priceSubmissionsDays: 90,
  buyboxObservationsDays: 90,
  competitorObservationsDays: 90,
  trackedProductObservationsDays: 90,
  trackedProductMetricsDays: 90,
  appEventsInfoDebugDays: 14,
  appEventsWarnErrorDays: 90,
  jobRunsDays: 30,
  jobQueueFinishedDays: 7,
};

describe('RetentionClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true } });

    render(<RetentionClient />);

    expect(await screen.findByText('Saklama ayarları yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { reject: new Error('network down') } });

    render(<RetentionClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the default-windows banner', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: { windows: WINDOWS, isDefault: true } } });

    render(<RetentionClient />);

    expect(
      await screen.findByText('Şu anda varsayılan pencereler kullanılıyor (doc 05 §10).', { exact: false }),
    ).toBeTruthy();
  });

  it('populated: shows the customised-windows banner and a saved value', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { body: { windows: WINDOWS, isDefault: false } } });

    render(<RetentionClient />);

    expect(
      await screen.findByText('Özelleştirilmiş pencereler kullanılıyor.', { exact: false }),
    ).toBeTruthy();
    expect(screen.getByDisplayValue('14')).toBeTruthy();
  });
});
