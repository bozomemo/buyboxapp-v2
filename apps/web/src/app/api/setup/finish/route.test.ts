// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configRepo, createDb, newId, runMigrations, type AppDatabase } from '@buybox/db';
import { jobEnabledSettingKey } from '@buybox/jobs';
import { MODULE_SETTING_KEYS } from '@buybox/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-setup-finish-'));
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

async function setting(key: string): Promise<string | undefined> {
  return (await configRepo.getAppSetting(appDb, key))?.value;
}

describe('POST /api/setup/finish', () => {
  it('switches the brand scanning jobs on for a brand-only install, and never ScrapeCompetitors', async () => {
    await configRepo.setAppSetting(
      appDb,
      { key: MODULE_SETTING_KEYS.seller, value: 'false', updatedBy: 'test', updatedAt: 0 },
      newId(),
    );

    const body = await (await POST()).json();

    expect(body.enabledJobs.sort()).toEqual([
      'ResolveProductBarcodes',
      'SweepBrandCatalogue',
      'SweepListedProducts',
      'SweepTrackedProducts',
    ]);
    expect(await setting(jobEnabledSettingKey('SweepTrackedProducts'))).toBe('true');
    expect(await setting(jobEnabledSettingKey('ScrapeCompetitors'))).toBeUndefined();
  });

  it('leaves them off on a seller-only install', async () => {
    await configRepo.setAppSetting(
      appDb,
      { key: MODULE_SETTING_KEYS.brand, value: 'false', updatedBy: 'test', updatedAt: 0 },
      newId(),
    );

    expect((await (await POST()).json()).enabledJobs).toEqual([]);
    expect(await setting(jobEnabledSettingKey('SweepTrackedProducts'))).toBeUndefined();
  });
});
