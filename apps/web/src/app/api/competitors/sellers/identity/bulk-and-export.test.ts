// @vitest-environment node
/**
 * _Seçilenlerin kimliğini çöz_ and _Kimlikleri Excel'e aktar_ (2026-11-25, product owner).
 *
 * The bulk route queues **one** run per marketplace naming the ticked sellers, and leaves out the
 * ones there is nothing to do for; the export reads only what resolutions already stored.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  competitorSellersRepo,
  configRepo,
  createDb,
  jobsRepo,
  runMigrations,
  sellerIdentitiesRepo,
  type AppDatabase,
} from '@buybox/db';
import { IDENTITY_BULK_MAX_SELLERS, RESOLVE_SELLER_IDENTITIES_JOB } from '@buybox/jobs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { POST as bulkResolve } from './bulk/route';
import { GET as exportIdentities } from './export/route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };
let cookie: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-identity-bulk-'));
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
  await competitorSellersRepo.recordSeenSellers(appDb, [
    { id: 's1', marketplaceCode: 'trendyol', sellerRef: '111', sellerName: 'Birinci', seenAt: 0 },
    { id: 's2', marketplaceCode: 'trendyol', sellerRef: '222', sellerName: 'İkinci', seenAt: 0 },
  ]);
});

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

const post = (body: unknown) =>
  bulkResolve(
    withCookie(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), cookie),
    routeContext(),
  );

async function storeIdentity(competitorSellerId: string): Promise<void> {
  await sellerIdentitiesRepo.upsertSellerIdentity(appDb, {
    id: `id-${competitorSellerId}`,
    competitorSellerId,
    officialName: 'Birinci Ticaret Ltd. Şti.',
    taxNumber: '1234567890',
    taxOffice: 'Kadıköy',
    registeredEmailAddress: 'birinci@hs01.kep.tr',
    address: 'Moda Cd. 1',
    cityName: 'İstanbul',
    countryName: 'Türkiye',
    listings: [],
    sourceUrl: 'https://www.trendyol.com/x-p-1?merchantId=111',
    parserVersion: '1.0.0',
    resolvedAt: Date.UTC(2026, 10, 25, 9, 0),
  });
}

async function queuedRuns() {
  return (await jobsRepo.listActiveJobsCovering(appDb, RESOLVE_SELLER_IDENTITIES_JOB, {})).map(
    (job) => job.payload as { marketplaceCode: string; sellerRefs: string[] },
  );
}

const ticked = (...refs: string[]) => ({
  sellers: refs.map((sellerRef) => ({ marketplaceCode: 'trendyol', sellerRef })),
});

describe('POST /api/competitors/sellers/identity/bulk', () => {
  it('queues one run naming every ticked seller', async () => {
    const res = await post(ticked('111', '222'));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ queued: 2, alreadyResolved: 0, missing: 0 });
    expect(await queuedRuns()).toEqual([
      expect.objectContaining({ marketplaceCode: 'trendyol', sellerRefs: ['111', '222'] }),
    ]);
  });

  it('leaves out a seller already resolved, and one that is not registered', async () => {
    await storeIdentity('s1');

    const res = await post(ticked('111', '222', '999'));

    expect(await res.json()).toMatchObject({ queued: 1, alreadyResolved: 1, missing: 1 });
    expect((await queuedRuns())[0]?.sellerRefs).toEqual(['222']);
  });

  it('every ticked seller already resolved: nothing is queued', async () => {
    await storeIdentity('s1');

    const res = await post(ticked('111'));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ queued: 0, alreadyResolved: 1 });
    expect(await queuedRuns()).toEqual([]);
  });

  it('a second selection while one is queued is refused, not queued behind it', async () => {
    await post(ticked('111'));
    const res = await post(ticked('222'));

    expect(res.status).toBe(409);
    expect(await queuedRuns()).toHaveLength(1);
  });

  it('nothing ticked is a 400', async () => {
    expect((await post({ sellers: [] })).status).toBe(400);
  });

  it('a selection above the ceiling is refused whole rather than truncated', async () => {
    const refs = Array.from({ length: IDENTITY_BULK_MAX_SELLERS + 1 }, (_, i) => `r${i}`);
    const res = await post(ticked(...refs));

    expect(res.status).toBe(400);
    expect(await queuedRuns()).toEqual([]);
  });
});

describe('GET /api/competitors/sellers/identity/export', () => {
  it('lists the stored identities with their storefronts, and nobody never resolved', async () => {
    await storeIdentity('s1');

    const res = await exportIdentities(withCookie(new Request('http://x'), cookie), routeContext());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { identities: Record<string, unknown>[] };
    expect(body.identities).toEqual([
      expect.objectContaining({
        marketplaceCode: 'trendyol',
        sellerRef: '111',
        sellerName: 'Birinci',
        officialName: 'Birinci Ticaret Ltd. Şti.',
        taxNumber: '1234567890',
        registeredEmailAddress: 'birinci@hs01.kep.tr',
      }),
    ]);
  });
});
