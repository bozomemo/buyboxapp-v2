import { newId } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import {
  getScrapeRateLimit,
  setScrapeRateLimit,
  SCRAPE_BURST_MAX,
  SCRAPE_RATE_MAX_PER_MINUTE,
  SCRAPE_TIMEOUT_MAX_MS,
  SCRAPE_TIMEOUT_MIN_MS,
} from './scrape-rate-settings.js';
import { createSqliteTestDb } from './test-helpers.js';

describe('scrape rate settings (doc 08 §12)', () => {
  it('is undefined when nothing has been stored — caller falls back to its own default', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      expect(await getScrapeRateLimit(appDb, 'trendyol')).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('persists an operator override, read back exactly, independent of the other marketplace', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await setScrapeRateLimit(appDb, 'trendyol', { requestsPerMinute: 6, burst: 2 }, 'operator', 1000, newId());

      expect(await getScrapeRateLimit(appDb, 'trendyol')).toEqual({ requestsPerMinute: 6, burst: 2 });
      expect(await getScrapeRateLimit(appDb, 'hepsiburada')).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('carries an optional request timeout beside the rate', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await setScrapeRateLimit(
        appDb,
        'trendyol',
        { requestsPerMinute: 6, burst: 2, requestTimeoutMs: 45_000 },
        'operator',
        1000,
        newId(),
      );

      expect(await getScrapeRateLimit(appDb, 'trendyol')).toEqual({
        requestsPerMinute: 6,
        burst: 2,
        requestTimeoutMs: 45_000,
      });
    } finally {
      cleanup();
    }
  });

  /**
   * A setting written before the timeout existed carries none, and "none" has to keep meaning
   * "each source's own default" — never zero, which would abandon every request instantly.
   */
  it('reads a stored value with no timeout as a rate-only override', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const { configRepo } = await import('@buybox/db');
      await configRepo.setAppSetting(
        appDb,
        {
          key: 'scrape.trendyol.rateLimit',
          value: JSON.stringify({ requestsPerMinute: 6, burst: 2 }),
          updatedBy: 'operator',
          updatedAt: 1000,
        },
        newId(),
      );

      const stored = await getScrapeRateLimit(appDb, 'trendyol');
      expect(stored).toEqual({ requestsPerMinute: 6, burst: 2 });
      expect(stored?.requestTimeoutMs).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  /** The rate is the part a run cannot proceed without, so an unusable timeout drops alone. */
  it.each([0, -1, SCRAPE_TIMEOUT_MIN_MS - 1, SCRAPE_TIMEOUT_MAX_MS + 1])(
    'drops an out-of-range timeout (%d) but keeps the rate',
    async (requestTimeoutMs) => {
      const { appDb, cleanup } = await createSqliteTestDb();
      try {
        const { configRepo } = await import('@buybox/db');
        await configRepo.setAppSetting(
          appDb,
          {
            key: 'scrape.trendyol.rateLimit',
            value: JSON.stringify({ requestsPerMinute: 6, burst: 2, requestTimeoutMs }),
            updatedBy: 'operator',
            updatedAt: 1000,
          },
          newId(),
        );

        expect(await getScrapeRateLimit(appDb, 'trendyol')).toEqual({ requestsPerMinute: 6, burst: 2 });
      } finally {
        cleanup();
      }
    },
  );

  it('a malformed stored value behaves as "no override" rather than throwing', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const { configRepo } = await import('@buybox/db');
      await configRepo.setAppSetting(
        appDb,
        { key: 'scrape.trendyol.rateLimit', value: 'not json', updatedBy: 'operator', updatedAt: 1000 },
        newId(),
      );
      expect(await getScrapeRateLimit(appDb, 'trendyol')).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('clamps a stored rate above the ceiling instead of honouring it', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await setScrapeRateLimit(
        appDb,
        'trendyol',
        { requestsPerMinute: 100_000, burst: 500 },
        'operator',
        1000,
        newId(),
      );
      expect(await getScrapeRateLimit(appDb, 'trendyol')).toEqual({
        requestsPerMinute: SCRAPE_RATE_MAX_PER_MINUTE,
        burst: SCRAPE_BURST_MAX,
      });
    } finally {
      cleanup();
    }
  });
});
