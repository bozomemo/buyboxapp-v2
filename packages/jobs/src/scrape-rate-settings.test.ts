import { newId } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { getScrapeRateLimit, setScrapeRateLimit } from './scrape-rate-settings.js';
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
});
