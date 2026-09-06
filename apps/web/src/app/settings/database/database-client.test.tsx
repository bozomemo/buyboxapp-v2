import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { DatabaseClient } from './database-client';

/**
 * Smoke test for `/settings/database` (doc 15 §6, Phase 5 — Tier D). Read-only diagnostics: the
 * response is never an empty collection, so this screen's "empty" is read as the degenerate
 * health state — a schema that has not caught up with the code (`upToDate: false`) — and
 * "populated" as the healthy, up-to-date state.
 */

afterEach(() => cleanup());

const PRIMARY_ROUTE = '/api/settings/database';

describe('DatabaseClient', () => {
  it('loading: shows the loading message and does not crash', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { pending: true } });

    render(<DatabaseClient />);

    expect(await screen.findByText('Veritabanı bilgisi yükleniyor…')).toBeTruthy();
  });

  it('error: shows the failure message and a retry button', async () => {
    stubFetch({ [PRIMARY_ROUTE]: { reject: new Error('network down') } });

    render(<DatabaseClient />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeTruthy();
  });

  it('empty: shows the schema-not-up-to-date state', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: {
        body: {
          dialect: 'sqlite',
          connection: 'app.db',
          schemaVersion: { upToDate: false, appliedCount: 0, expectedCount: 12 },
        },
      },
    });

    render(<DatabaseClient />);

    expect(await screen.findByText('güncel değil')).toBeTruthy();
  });

  it('populated: shows the healthy, up-to-date schema state', async () => {
    stubFetch({
      [PRIMARY_ROUTE]: {
        body: {
          dialect: 'sqlite',
          connection: 'app.db',
          schemaVersion: { upToDate: true, appliedCount: 12, expectedCount: 12 },
        },
      },
    });

    render(<DatabaseClient />);

    expect(await screen.findByText('güncel')).toBeTruthy();
    expect(screen.getByText('sqlite')).toBeTruthy();
  });
});
