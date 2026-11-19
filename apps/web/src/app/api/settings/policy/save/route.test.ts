/**
 * An amount the policy form cannot read answered 500 ("Kaydedilemedi (HTTP 500)"): the parse
 * threw out of the handler. It is a 400 with the parse's own Turkish sentence (2026-11-19).
 */
// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configRepo, createDb, runMigrations, type AppDatabase } from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { POST } from './route';

let dir: string;
let appDb: AppDatabase;
let cookie: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-policy-save-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  cookie = await signIn(appDb);
  await configRepo.upsertMarketplace(appDb, {
    code: 'trendyol',
    displayName: 'Trendyol',
    enabled: true,
    merchantRef: null,
    createdAt: 0,
    updatedAt: 0,
  });
});

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

const FORM = {
  code: 'trendyol',
  coarseStepMode: 'percent',
  coarseStepPercent: '5',
  coarseStepAbsolute: '',
  refineTolerance: '0,50',
  seekStrategy: 'direct',
  undercutBy: '0,10',
  seekStep: '1,00',
  soleSellerMarginPct: '10',
  lowStockGuardEnabled: false,
  lowStockThreshold: '3',
  lowStockMarginPct: '5',
  stockMode: 'ignoreStock',
  minPhysicalStock: '0',
  settleDurationMinutes: '1',
  competitorPriceDelta: '0,10',
  pollIntervalMinutes: '5',
  concurrency: '1',
  budgetReservePct: '20',
  enabled: false,
};

async function save(patch: Record<string, unknown>) {
  const request = withCookie(
    new Request('http://localhost/api/settings/policy/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...FORM, ...patch }),
    }),
    cookie,
  );
  const response = await POST(request, routeContext());
  return { status: response.status, body: (await response.json()) as { error?: string } };
}

describe('POST /api/settings/policy/save', () => {
  it('saves amounts typed the Turkish way', async () => {
    expect((await save({})).status).toBe(200);
    expect((await configRepo.getRepricingPolicy(appDb, 'trendyol'))?.refineTolerance).toBe(50n);
  });

  it('answers an unreadable amount with 400 and a sentence', async () => {
    const { status, body } = await save({ refineTolerance: 'abc' });
    expect(status).toBe(400);
    expect(body.error).toMatch(/geçerli bir tutar değil/);
  });
});
