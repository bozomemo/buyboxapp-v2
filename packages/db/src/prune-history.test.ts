import { afterEach, describe, expect, it } from 'vitest';
import { newId } from './id.js';
import { DEFAULT_RETENTION_WINDOWS, pruneHistory } from './prune-history.js';
import * as configRepo from './repositories/config.js';
import * as eventsRepo from './repositories/events.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from './test-helpers.js';

const NOW = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

describe.each(ALL_DIALECTS)('pruneHistory on %s', (dialect) => {
  let testDb: TestDb | undefined;

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it('enforces every configured retention window in one call', async () => {
    testDb = await createTestDb(dialect);
    const { appDb } = testDb;
    await configRepo.upsertMarketplace(appDb, {
      code: 'TY',
      displayName: 'Trendyol',
      enabled: true,
      merchantRef: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const oldEventId = newId();
    await eventsRepo.logEvent(appDb, {
      id: oldEventId,
      at: NOW - 200 * DAY_MS, // well past the 90-day info/debug window
      level: 'info',
      marketplaceCode: null,
      listingId: null,
      jobRunId: null,
      code: 'old.event',
      message: 'stale',
      context: null,
    });
    const recentEventId = newId();
    await eventsRepo.logEvent(appDb, {
      id: recentEventId,
      at: NOW - DAY_MS,
      level: 'info',
      marketplaceCode: null,
      listingId: null,
      jobRunId: null,
      code: 'recent.event',
      message: 'fresh',
      context: null,
    });

    await pruneHistory(appDb, DEFAULT_RETENTION_WINDOWS, NOW);

    const remaining = await eventsRepo.listRecentEvents(appDb, 10);
    const ids = remaining.map((e) => e.id);
    expect(ids).not.toContain(oldEventId);
    expect(ids).toContain(recentEventId);
  }, 30_000);
});
