// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configRepo, createDb, runMigrations, type AppDatabase } from '@buybox/db';
import { isJobEnabled, jobEnabledSettingKey } from '@buybox/jobs';
import { GLOBAL_KILL_SWITCH_SETTING_KEY, SYSTEM_PAUSE_SETTING_KEY } from '@buybox/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as setJobEnabled } from './route';
import { POST as setKillSwitch } from '../../kill-switch/route';
import { POST as setMarketplaceKillSwitch } from '../../kill-switch/marketplace/route';
import { POST as setSystemPause } from '../../system-pause/route';

/**
 * The four switches that stand between the operator and the money path. Each used to write
 * `String(body.x)` unchecked, so a request missing the field stored `"undefined"` — and for a job
 * flag that read back as the job's default, which is *on* for `SubmitPriceChanges`.
 */
let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-switch-routes-'));
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

function post(body: string): Request {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('switch routes refuse anything that is not an explicit boolean', () => {
  const bad = ['{"jobName":"SubmitPriceChanges"}', '{"jobName":"SubmitPriceChanges","enabled":"true"}', 'not json', '[]'];
  for (const body of bad) {
    it(`/api/jobs/enabled 400s ${body} and stores nothing`, async () => {
      const res = await setJobEnabled(post(body));
      expect(res.status).toBe(400);
      expect(await configRepo.getAppSetting(appDb, jobEnabledSettingKey('SubmitPriceChanges'))).toBeUndefined();
    });
  }

  it('/api/jobs/enabled still stores a real boolean', async () => {
    const res = await setJobEnabled(post('{"jobName":"SubmitPriceChanges","enabled":false}'));
    expect(res.status).toBe(200);
    expect(await isJobEnabled(appDb, 'SubmitPriceChanges')).toBe(false);
  });

  it('/api/kill-switch and /api/system-pause 400 a missing `engaged` and store nothing', async () => {
    expect((await setKillSwitch(post('{}'))).status).toBe(400);
    expect((await setSystemPause(post('{"engaged":"false"}'))).status).toBe(400);
    expect(await configRepo.getAppSetting(appDb, GLOBAL_KILL_SWITCH_SETTING_KEY)).toBeUndefined();
    expect(await configRepo.getAppSetting(appDb, SYSTEM_PAUSE_SETTING_KEY)).toBeUndefined();
  });

  it('/api/kill-switch/marketplace 400s an unknown marketplace', async () => {
    expect((await setMarketplaceKillSwitch(post('{"engaged":true}'))).status).toBe(400);
    expect((await setMarketplaceKillSwitch(post('{"marketplaceCode":"amazon","engaged":true}'))).status).toBe(400);
    expect((await setMarketplaceKillSwitch(post('{"marketplaceCode":"trendyol","engaged":true}'))).status).toBe(200);
  });
});
