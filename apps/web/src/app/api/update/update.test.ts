// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, runMigrations, type AppDatabase } from '@buybox/db';
import { readJsonFile, updatePaths, UpdateRequestSchema, writeJsonFileAtomic, type UpdateState } from '@buybox/jobs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { setUpdaterTaskRunnerForTests } from '@/lib/server/update';
import { GET as getUpdate } from './route';
import { POST as applyUpdate } from './apply/route';
import { POST as checkUpdate } from './check/route';

/**
 * The update routes (auto-update spec §5.3): status for an admin, "check now", and "install",
 * which only ever writes a request and starts the scheduled task — the install itself is
 * apply-update.ps1's.
 */
let dir: string;
let dataDir: string;
let appDb: AppDatabase;
const cookies: Record<string, string> = {};
let runnerCalls: number;
let runnerFails: boolean;
const savedEnv = { ...process.env };

const ready: UpdateState = {
  lastCheckAt: '2026-11-11T00:00:00.000Z',
  lastResult: 'ready',
  lastError: null,
  ready: { version: '0.2.1', notes: 'Notlar', downloadBytes: 1024, components: ['app'] },
};

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-update-route-'));
  dataDir = path.join(dir, 'data');
  mkdirSync(dataDir);
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  process.env.BUYBOX_DATA_DIR = dataDir;
  process.env.BUYBOX_INSTALL_DIR = path.join(dir, 'install');
  process.env.APP_VERSION = '0.2.0';
  process.env.UPDATE_MANIFEST_URL = '';
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(appDb);
  for (const role of ['admin', 'price_manager', 'viewer'] as const) cookies[role] = await signIn(appDb, role);
  runnerCalls = 0;
  runnerFails = false;
  setUpdaterTaskRunnerForTests(async () => {
    runnerCalls += 1;
    if (runnerFails) throw new Error('schtasks: görev bulunamadı');
  });
}, 30_000);

afterEach(() => {
  setUpdaterTaskRunnerForTests(undefined);
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  globalThis.__buyboxHasAdmin = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

const paths = () => updatePaths(dataDir);
const writeReady = () => {
  mkdirSync(paths().dir, { recursive: true });
  writeJsonFileAtomic(paths().state, ready);
};
const get = (role = 'admin') => getUpdate(withCookie(new Request('http://localhost/api/update'), cookies[role]!), routeContext());
const apply = (body: unknown, role = 'admin') =>
  applyUpdate(
    withCookie(new Request('http://localhost/api/update/apply', { method: 'POST', body: JSON.stringify(body) }), cookies[role]!),
    routeContext(),
  );
const check = (role = 'admin') =>
  checkUpdate(withCookie(new Request('http://localhost/api/update/check', { method: 'POST' }), cookies[role]!), routeContext());

describe('/api/update', () => {
  // R-AUTH-10: reads need `view`; only the two actions are admin-only.
  it.each(['price_manager', 'viewer'])('lets a %s read the status but neither check nor install', async (role) => {
    expect((await get(role)).status).toBe(200);
    expect((await check(role)).status).toBe(403);
    expect((await apply({ version: '0.2.1' }, role)).status).toBe(403);
  });

  it('reports itself unavailable on an install with no install directory', async () => {
    delete process.env.BUYBOX_INSTALL_DIR;
    const body = await (await get()).json();
    expect(body.available).toBe(false);
  });

  it('reports the running version, the ready release and no install in progress', async () => {
    writeReady();
    const body = await (await get()).json();
    expect(body).toMatchObject({ available: true, currentVersion: '0.2.0', state: ready, inProgress: false });
  });

  it('runs a check now and returns its state', async () => {
    const res = await check();
    expect(res.status).toBe(200);
    expect((await res.json()).lastResult).toBe('disabled');
  });
});

describe('/api/update/apply', () => {
  it('refuses when no release is ready', async () => {
    expect((await apply({ version: '0.2.1' })).status).toBe(409);
    expect(runnerCalls).toBe(0);
  });

  it('refuses a version other than the ready one', async () => {
    writeReady();
    expect((await apply({ version: '0.2.2' })).status).toBe(409);
  });

  it('refuses while the updater holds its lock', async () => {
    writeReady();
    writeFileSync(paths().lock, '');
    expect((await apply({ version: '0.2.1' })).status).toBe(409);
  });

  it('writes the request, starts the task once, and refuses a second click', async () => {
    writeReady();
    const res = await apply({ version: '0.2.1' });
    expect(res.status).toBe(202);
    expect(runnerCalls).toBe(1);
    const request = readJsonFile(paths().request, UpdateRequestSchema);
    expect(request?.version).toBe('0.2.1');
    expect(request?.requestedBy).toBeTruthy();

    expect((await apply({ version: '0.2.1' })).status).toBe(409);
    expect(runnerCalls).toBe(1);
  });

  it('removes the request and says why when the task cannot be started', async () => {
    writeReady();
    runnerFails = true;
    const res = await apply({ version: '0.2.1' });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('schtasks');
    expect(existsSync(paths().request)).toBe(false);
  });

  it('rejects a body without a version', async () => {
    writeReady();
    expect((await apply({})).status).toBe(400);
  });
});
