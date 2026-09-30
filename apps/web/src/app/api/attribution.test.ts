// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authRepo, configRepo, createDb, runMigrations, type AppDatabase } from '@buybox/db';
import { SYSTEM_PAUSE_SETTING_KEY } from '@buybox/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveActorLabels } from '@/lib/server/auth/actors';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { POST as setSystemPause } from './system-pause/route';

/**
 * R-AUTH-13 (doc 18 §9.1): every write records who made it. Before sign-in, sixteen routes wrote
 * the literal `'operator'` and six the literal `'setup-wizard'`; the first test keeps either from
 * coming back, the second checks that what is written instead names the signed-in user.
 */
const API_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === 'route.ts' ? [full] : [];
  });
}

let dir: string;
let appDb: AppDatabase;
let cookie: string;
const savedEnv = { ...process.env };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-attribution-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(appDb);
  // An administrator must exist, or the install is in bootstrap mode and refuses everyone.
  await signIn(appDb, 'admin');
  cookie = await signIn(appDb, 'price_manager');
}, 30_000);

afterAll(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

describe('attribution (R-AUTH-13)', () => {
  it('no route writes a fixed actor any more', () => {
    const offenders = routeFiles(API_DIR).filter((file) =>
      /(changedBy|updatedBy|requestedBy):\s*'(operator|setup-wizard)'|'operator',\s*Date\.now\(\)/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(offenders.map((f) => path.relative(API_DIR, f))).toEqual([]);
  });

  it('a write records the signed-in user, and reads back as their name', async () => {
    const request = withCookie(
      new Request('http://localhost/api/system-pause', { method: 'POST', body: JSON.stringify({ engaged: true }) }),
      cookie,
    );
    expect((await setSystemPause(request, routeContext())).status).toBe(200);

    const setting = await configRepo.getAppSetting(appDb, SYSTEM_PAUSE_SETTING_KEY);
    expect(setting?.updatedBy).toMatch(/^user:/);
    const user = (await authRepo.listUsers(appDb)).find((u) => u.role === 'price_manager');
    expect(setting?.updatedBy).toBe(`user:${user!.id}`);

    const labels = await resolveActorLabels(appDb, [setting!.updatedBy, 'operator', 'system', null]);
    expect(labels.get(setting!.updatedBy)).toBe(user!.displayName);
    expect(labels.get('operator')).toBe('Operatör (eski kayıt)');
    expect(labels.get('system')).toBe('Sistem');
  });
});
