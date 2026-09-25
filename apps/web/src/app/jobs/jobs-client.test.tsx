import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { JobsClient } from './jobs-client';

/**
 * Smoke test for `/jobs` (doc 15 §6, Phase 2.1). Shape copied from `dashboard-client.test.tsx`
 * (Phase 1c's reference): one `fetch` stub per case, one stable phrase asserted per case, no
 * snapshots, no assertions on layout or class names.
 *
 * `JobsClient` fetches four routes on mount: `/api/jobs` (the overview that gates the loading /
 * error split), `/api/jobs/scrape-rate`, `/api/settings/marketplaces`, and `/api/jobs/run-history`
 * (from the `historyFilter` effect, which also runs on mount). All four are stubbed in every case
 * — `stubFetch` rejects loudly on an unmatched path rather than hanging, so a missing route here
 * would fail fast rather than silently.
 */

afterEach(() => cleanup());

const EMPTY_SIDE_ROUTES = {
  '/api/jobs/scrape-rate': { body: { rates: [] } },
  '/api/settings/marketplaces': { body: { marketplaces: [] } },
  '/api/jobs/run-history': { body: { runs: [], limit: 200 } },
};

describe('JobsClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({
      '/api/jobs': { pending: true },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<JobsClient />);

    expect(await screen.findByText('İşler yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({
      '/api/jobs': { reject: new Error('network down') },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<JobsClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the empty-state sentence, not a bare blank', async () => {
    stubFetch({
      '/api/jobs': {
        body: {
          jobs: [],
          scheduler: { running: true, systemPaused: false },
          queueDepth: {},
          claimed: [],
          circuitBreakers: [],
        },
      },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<JobsClient />);

    expect(
      await screen.findByText(
        "Bir işi yukarıdan Çalıştır'a basarak başlatabilir ya da zamanlanmış ilk çalışmayı bekleyebilirsiniz.",
      ),
    ).toBeTruthy();
    expect(screen.getByText('Hiç tetiklenmedi.')).toBeTruthy();
  });

  it('populated: shows a job row and its last-run outcome', async () => {
    const now = Date.now();
    stubFetch({
      '/api/jobs': {
        body: {
          jobs: [
            {
              jobName: 'ImportListings',
              label: 'İlan İçe Aktarma',
              cadenceMs: 60_000,
              liveCadenceMs: 60_000,
              pendingRestart: false,
              isCadenceOverride: false,
              defaultCadenceMs: 60_000,
              perMarketplace: false,
              defaultPayload: {},
              enabled: true,
              nextRunAt: now + 60_000,
              queued: false,
              activeRun: null,
              lastRun: {
                id: 'run-1',
                startedAt: now - 120_000,
                finishedAt: now - 110_000,
                state: 'failed',
                itemsTotal: 10,
                itemsOk: 4,
                itemsFailed: 6,
                error: 'HTTP 500',
              },
            },
          ],
          scheduler: { running: true, systemPaused: false },
          queueDepth: { ready: 0, locked: 0, done: 3, failed: 1 },
          claimed: [],
          circuitBreakers: [],
        },
      },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<JobsClient />);

    // The job name appears both in the catalogue row and the history filter's <option>.
    expect((await screen.findAllByText('İlan İçe Aktarma')).length).toBeGreaterThan(0);
    // The raw `job_runs.state` ('failed') must not reach the screen — only its Turkish label.
    expect(screen.getAllByText('Başarısız').length).toBeGreaterThan(0);
  });

  // doc 17 §1.3: a brand-only install's catalogue opened on nine price jobs it never runs.
  it('keeps a disabled module’s jobs out of the catalogue until asked', async () => {
    const job = (jobName: string, label: string, moduleDisabled: boolean) => ({
      jobName,
      label,
      module: moduleDisabled ? 'seller' : 'brand',
      moduleDisabled,
      cadenceMs: null,
      liveCadenceMs: null,
      pendingRestart: false,
      isCadenceOverride: false,
      defaultCadenceMs: null,
      perMarketplace: false,
      defaultPayload: {},
      enabled: true,
      nextRunAt: null,
      queued: false,
      activeRun: null,
      lastRun: null,
    });
    stubFetch({
      '/api/jobs': {
        body: {
          jobs: [
            job('Reprice', 'Yeniden Fiyatlandırma', true),
            job('SweepBrandCatalogue', 'Marka Kataloğu', false),
          ],
          scheduler: { running: true, systemPaused: false },
          queueDepth: { ready: 0, locked: 0, done: 0, failed: 0 },
          claimed: [],
          circuitBreakers: [],
        },
      },
      ...EMPTY_SIDE_ROUTES,
    });

    render(<JobsClient />);

    // Labels also fill the run-history filter's <option>s; only a catalogue cell counts.
    const inCatalogue = (label: string) => screen.queryAllByText(label).some((el) => el.tagName === 'TD');
    await screen.findByText('Kapalı modüllerin 1 işi gizli — göster');
    expect(inCatalogue('Marka Kataloğu')).toBe(true);
    expect(inCatalogue('Yeniden Fiyatlandırma')).toBe(false);

    screen.getByText('Kapalı modüllerin 1 işi gizli — göster').click();
    expect(await screen.findByText('Modül kapalı')).toBeTruthy();
    expect(inCatalogue('Yeniden Fiyatlandırma')).toBe(true);
  });
});
