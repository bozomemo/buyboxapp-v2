import { describe, expect, it } from 'vitest';
import { ALL_DIALECTS, createTestDb } from '../test-helpers.js';
import { acquireOrRenewSchedulerLock, releaseSchedulerLock } from './jobs.js';

describe.each(ALL_DIALECTS)('scheduler lock (%s)', (dialect) => {
  it('grants the lock to the first acquirer and refuses a second instance', async () => {
    const { appDb, cleanup } = await createTestDb(dialect);
    try {
      expect(await acquireOrRenewSchedulerLock(appDb, 'instance-a', 1000, 30_000)).toBe(true);
      expect(await acquireOrRenewSchedulerLock(appDb, 'instance-b', 1000, 30_000)).toBe(false);
    } finally {
      await cleanup();
    }
  }, 30_000);

  it('lets the current holder renew (heartbeat) indefinitely', async () => {
    const { appDb, cleanup } = await createTestDb(dialect);
    try {
      expect(await acquireOrRenewSchedulerLock(appDb, 'instance-a', 1000, 30_000)).toBe(true);
      expect(await acquireOrRenewSchedulerLock(appDb, 'instance-a', 10_000, 30_000)).toBe(true);
      expect(await acquireOrRenewSchedulerLock(appDb, 'instance-a', 20_000, 30_000)).toBe(true);
    } finally {
      await cleanup();
    }
  }, 30_000);

  it('lets a new instance take over once the lock has expired (holder crashed)', async () => {
    const { appDb, cleanup } = await createTestDb(dialect);
    try {
      expect(await acquireOrRenewSchedulerLock(appDb, 'instance-a', 0, 1000)).toBe(true);
      expect(await acquireOrRenewSchedulerLock(appDb, 'instance-b', 500, 1000)).toBe(false); // still held
      expect(await acquireOrRenewSchedulerLock(appDb, 'instance-b', 2000, 1000)).toBe(true); // expired
    } finally {
      await cleanup();
    }
  }, 30_000);

  it('releasing the lock lets another instance acquire it immediately', async () => {
    const { appDb, cleanup } = await createTestDb(dialect);
    try {
      expect(await acquireOrRenewSchedulerLock(appDb, 'instance-a', 1000, 30_000)).toBe(true);
      await releaseSchedulerLock(appDb, 'instance-a', 1500);
      expect(await acquireOrRenewSchedulerLock(appDb, 'instance-b', 1600, 30_000)).toBe(true);
    } finally {
      await cleanup();
    }
  }, 30_000);

  it('releasing with the wrong owner id is a no-op', async () => {
    const { appDb, cleanup } = await createTestDb(dialect);
    try {
      expect(await acquireOrRenewSchedulerLock(appDb, 'instance-a', 1000, 30_000)).toBe(true);
      await releaseSchedulerLock(appDb, 'instance-b', 1500); // not the holder
      expect(await acquireOrRenewSchedulerLock(appDb, 'instance-b', 1600, 30_000)).toBe(false);
    } finally {
      await cleanup();
    }
  }, 30_000);
});
