import { afterEach, describe, expect, it } from 'vitest';
import { checkSchemaVersion, runMigrations } from './migrate.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from './test-helpers.js';

describe.each(ALL_DIALECTS)('migrations on %s', (dialect) => {
  let testDb: TestDb | undefined;

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it('migrates a fresh database cleanly and reports the schema as up to date', async () => {
    testDb = await createTestDb(dialect); // createTestDb already runs migrations once
    const status = await checkSchemaVersion(testDb.appDb);
    expect(status.upToDate).toBe(true);
    expect(status.appliedCount).toBeGreaterThan(0);
    expect(status.appliedCount).toBe(status.expectedCount);
  }, 30_000);

  it('running the same migrations twice is a no-op', async () => {
    testDb = await createTestDb(dialect);
    const before = await checkSchemaVersion(testDb.appDb);
    await runMigrations(testDb.appDb); // second run
    const after = await checkSchemaVersion(testDb.appDb);
    expect(after.appliedCount).toBe(before.appliedCount);
    expect(after.upToDate).toBe(true);
  }, 30_000);
});
