// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, runMigrations } from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from './route';

/**
 * The update hold in `/api/health` (auto-update spec §5.2). apply-update.ps1's health gate runs
 * *while* pricing is held, so the hold is reported for information and must never turn `ok`
 * into `degraded` — or no update could ever pass its own gate.
 */
let dir: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-health-'));
  const dbFile = path.join(dir, 'app.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  process.env.BUYBOX_DATA_DIR = dir;
  const appDb = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(appDb);
  appDb.close();
}, 30_000);

afterEach(() => {
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

describe('/api/health update hold', () => {
  it('reports no hold normally', async () => {
    const body = await (await GET()).json();
    expect(body.updateHold).toBe(false);
  });

  it('reports the hold, and stays ok, while an update holds pricing', async () => {
    mkdirSync(path.join(dir, 'updates'), { recursive: true });
    writeFileSync(path.join(dir, 'updates', 'hold'), '');
    const body = await (await GET()).json();
    expect(body.updateHold).toBe(true);
    expect(body.status).toBe('ok');
  });
});
