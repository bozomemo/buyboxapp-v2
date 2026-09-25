// @vitest-environment node
/**
 * The Stock screen's "import from the configured source" button, against a real migrated
 * database — because the bug it regressed on was a foreign key, which only a real database has.
 *
 * Measured 2026-09-20 on the live install's own configuration (`manual`): the handler logs an
 * event saying the source has no bulk import, `events.job_run_id` references `job_runs`, and the
 * route passed an id that named no row — so the screen reported `FOREIGN KEY constraint failed`
 * instead of the explanation.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, eventsRepo, jobsRepo, runMigrations, type AppDatabase } from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-stock-import-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  appDb = createDb(`file:${dbFile}`, 'sqlite');
});

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

function request(body: unknown): Request {
  return new Request('http://localhost/api/stock/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/stock/import', () => {
  it('answers with counts for a source that has no bulk import, and records why', async () => {
    const body = await (await POST(request({ sourceCode: 'manual', sourceConfig: {} }))).json();

    expect(body).toEqual({ ok: true, itemsTotal: 0, itemsOk: 0, itemsFailed: 0 });
    const events = await eventsRepo.listEventsFiltered(appDb, {}, 10);
    expect(events.map((e) => e.code)).toContain('StockImportNotApplicable');
  });

  it('records the run, so the event it logs has a job run to belong to', async () => {
    await POST(request({ sourceCode: 'manual', sourceConfig: {} }));

    const runs = await jobsRepo.listJobRuns(appDb, { jobName: 'ImportStockItems' }, 10);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ state: 'ok', error: null, itemsTotal: 0 });
    const events = await eventsRepo.listEventsFiltered(appDb, {}, 10);
    const logged = events.find((e) => e.code === 'StockImportNotApplicable');
    expect(logged?.jobRunId).toBe(runs[0]!.id);
  });

  it('records a failed run rather than leaving one running for ever', async () => {
    // An unknown source fails the payload schema inside the handler.
    const body = await (await POST(request({ sourceCode: 'nope', sourceConfig: {} }))).json();

    expect(body.ok).toBe(false);
    const runs = await jobsRepo.listJobRuns(appDb, { jobName: 'ImportStockItems' }, 10);
    expect(runs[0]).toMatchObject({ state: 'failed' });
    expect(runs[0]!.error).toBeTruthy();
    expect(runs[0]!.finishedAt).not.toBeNull();
  });
});
