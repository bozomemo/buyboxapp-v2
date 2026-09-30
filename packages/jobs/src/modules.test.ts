import { configRepo, newId, repricingRepo, type AppDatabase } from '@buybox/db';
import { MODULE_SETTING_KEYS, type AppModule, type EnabledModules } from '@buybox/shared';
import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock.js';
import { isJobEnabled, JOB_CATALOG, jobEnabledSettingKey } from './job-catalog.js';
import {
  BRAND_SCAN_JOBS,
  enableBrandScanJobsAtSetup,
  isJobDispatchable,
  JOB_MODULES,
  jobModule,
  readDispatchGate,
  type DispatchGate,
} from './modules.js';
import { Scheduler } from './scheduler.js';
import { createSqliteTestDb, NOW, seedListing, seedMarketplace } from './test-helpers.js';

function gate(modules: EnabledModules, awaitingConfirmation = 0): DispatchGate {
  return { modules, awaitingConfirmation };
}

const SELLER_ONLY: EnabledModules = { seller: true, brand: false };
const BRAND_ONLY: EnabledModules = { seller: false, brand: true };
const BOTH: EnabledModules = { seller: true, brand: true };

async function setModule(appDb: AppDatabase, module: AppModule, enabled: boolean): Promise<void> {
  await configRepo.setAppSetting(
    appDb,
    { key: MODULE_SETTING_KEYS[module], value: String(enabled), updatedBy: 'test', updatedAt: NOW },
    newId(),
  );
}

describe('JOB_MODULES', () => {
  it('assigns every catalogue job a module — a missing seller job would run with the module off', () => {
    for (const entry of JOB_CATALOG) {
      expect(JOB_MODULES[entry.jobName], entry.jobName).toBeDefined();
    }
  });

  it('files ScrapeCompetitors under the seller: it reads the sellers on our own listings', () => {
    expect(jobModule('ScrapeCompetitors')).toBe('seller');
    expect(jobModule('SweepTrackedProducts')).toBe('brand');
    expect(jobModule('PruneHistory')).toBe('core');
  });
});

describe('isJobDispatchable', () => {
  it.each([
    ['a seller job, both modules on', 'Reprice', gate(BOTH), true],
    ['a seller job, seller on', 'SubmitPriceChanges', gate(SELLER_ONLY), true],
    ['a seller job, seller off', 'SubmitPriceChanges', gate(BRAND_ONLY), false],
    ['a brand job, brand off', 'SweepTrackedProducts', gate(SELLER_ONLY), false],
    ['a brand job, brand on', 'SweepTrackedProducts', gate(BRAND_ONLY), true],
    ['a core job runs whatever is enabled', 'PruneHistory', gate(BRAND_ONLY), true],
    ['ConfirmSubmissions, seller off, nothing awaiting', 'ConfirmSubmissions', gate(BRAND_ONLY, 0), false],
    [
      'ConfirmSubmissions, seller off, a batch awaiting — drains it',
      'ConfirmSubmissions',
      gate(BRAND_ONLY, 2),
      true,
    ],
    ['the drain exception is ConfirmSubmissions only', 'SubmitPriceChanges', gate(BRAND_ONLY, 2), false],
  ])('%s', (_label, jobName, g, expected) => {
    expect(isJobDispatchable(jobName, g)).toBe(expected);
  });
});

describe('readDispatchGate', () => {
  it('counts submissions awaiting confirmation only when the seller module is off', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await seedMarketplace(appDb);
      const listingId = await seedListing(appDb);
      const id = newId();
      await repricingRepo.insertPriceSubmission(appDb, {
        id,
        listingId,
        marketplaceCode: 'trendyol',
        oldPrice: 2000n,
        newPrice: 2100n,
        reason: 'Climbing',
        explanation: 'test',
        priority: 1,
        decidedAt: NOW,
        state: 'queued',
        submittedAt: null,
        confirmedAt: null,
        marketplaceHandle: null,
        failureCode: null,
        failureMessage: null,
        attempts: 0,
        unitCost: null,
        floorPrice: null,
        buyboxPrice: null,
        secondPrice: null,
        rank: null,
        commissionRate: null,
        vatRate: null,
      });
      await repricingRepo.markSubmitted(appDb, id, 'batch-1', NOW + 1);

      expect(await readDispatchGate(appDb)).toEqual({ modules: BOTH, awaitingConfirmation: 0 });

      await setModule(appDb, 'seller', false);
      const g = await readDispatchGate(appDb);
      expect(g).toEqual({ modules: BRAND_ONLY, awaitingConfirmation: 1 });
      expect(isJobDispatchable('ConfirmSubmissions', g)).toBe(true);

      await repricingRepo.markConfirmed(appDb, id, NOW + 2);
      expect(isJobDispatchable('ConfirmSubmissions', await readDispatchGate(appDb))).toBe(false);
    } finally {
      cleanup();
    }
  });
});

describe('Scheduler — module gating (doc 17 §1.3)', () => {
  const ok = async () => ({ itemsTotal: 0, itemsOk: 0, itemsFailed: 0 });

  it('does not claim a disabled module’s queued job, and runs it once the module is back', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const scheduler = new Scheduler({
        appDb,
        clock: new FakeClock(1000),
        adapters: new Map(),
        instanceId: 'a',
      });
      scheduler.register({ jobName: 'Reprice', handler: ok });
      scheduler.register({ jobName: 'SweepTrackedProducts', handler: ok });

      await setModule(appDb, 'seller', false);
      await scheduler.enqueueNow('Reprice', '{}');
      await scheduler.enqueueNow('SweepTrackedProducts', '{}');

      // The brand job runs; the seller job, queued before or after the switch, does not.
      expect((await scheduler.tick()).ran).toEqual([{ jobName: 'SweepTrackedProducts', ok: true }]);
      expect((await scheduler.tick()).ran).toEqual([]);

      await setModule(appDb, 'seller', true);
      expect((await scheduler.tick()).ran).toEqual([{ jobName: 'Reprice', ok: true }]);
    } finally {
      cleanup();
    }
  });

  it('does not enqueue a disabled module’s cadenced job', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const scheduler = new Scheduler({
        appDb,
        clock: new FakeClock(1000),
        adapters: new Map(),
        instanceId: 'a',
      });
      scheduler.register({ jobName: 'EvaluateBrandFindings', cadenceMs: 60_000, handler: ok });
      scheduler.register({ jobName: 'PruneHistory', cadenceMs: 60_000, handler: ok });

      await setModule(appDb, 'brand', false);
      expect((await scheduler.tick()).enqueued).toEqual(['PruneHistory']);
    } finally {
      cleanup();
    }
  });

  it('claims nothing, without error, when every registered job belongs to a disabled module', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const scheduler = new Scheduler({
        appDb,
        clock: new FakeClock(1000),
        adapters: new Map(),
        instanceId: 'a',
      });
      scheduler.register({ jobName: 'Reprice', handler: ok });
      await setModule(appDb, 'seller', false);
      await scheduler.enqueueNow('Reprice', '{}');
      expect((await scheduler.tick()).ran).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

describe('enableBrandScanJobsAtSetup', () => {
  it('covers exactly the brand scanning jobs that are off by default — never ScrapeCompetitors', () => {
    expect([...BRAND_SCAN_JOBS].sort()).toEqual(
      ['ResolveProductBarcodes', 'SweepBrandCatalogue', 'SweepListedProducts', 'SweepTrackedProducts'].sort(),
    );
  });

  it('switches them on when the brand module is chosen, leaving an operator choice alone', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await setModule(appDb, 'seller', false);
      await configRepo.setAppSetting(
        appDb,
        {
          key: jobEnabledSettingKey('SweepBrandCatalogue'),
          value: 'false',
          updatedBy: 'operator',
          updatedAt: NOW,
        },
        newId(),
      );

      const enabled = await enableBrandScanJobsAtSetup(appDb, NOW, 'user:test');

      expect(enabled.sort()).toEqual([
        'ResolveProductBarcodes',
        'SweepListedProducts',
        'SweepTrackedProducts',
      ]);
      expect(await isJobEnabled(appDb, 'SweepTrackedProducts')).toBe(true);
      expect(await isJobEnabled(appDb, 'SweepListedProducts')).toBe(true);
      expect(await isJobEnabled(appDb, 'ResolveProductBarcodes')).toBe(true);
      expect(await isJobEnabled(appDb, 'SweepBrandCatalogue')).toBe(false);
      expect(await isJobEnabled(appDb, 'ScrapeCompetitors')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('does nothing on a seller-only install', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      await setModule(appDb, 'brand', false);
      expect(await enableBrandScanJobsAtSetup(appDb, NOW, 'user:test')).toEqual([]);
      expect(await isJobEnabled(appDb, 'SweepTrackedProducts')).toBe(false);
    } finally {
      cleanup();
    }
  });
});
