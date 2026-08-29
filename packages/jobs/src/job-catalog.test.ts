import { newId } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  getJobCadenceMs,
  jobCadenceSettingKey,
  jobDefaultCadenceMs,
  JOB_CATALOG,
  MIN_JOB_CADENCE_MS,
} from './job-catalog.js';
import { ConfirmSubmissionsPayloadSchema } from './pipeline/confirm-submissions.js';
import { IMPORT_BUNDLES_JOB, ImportBundlesPayloadSchema } from './pipeline/import-bundles.js';
import { IMPORT_LISTINGS_JOB, ImportListingsPayloadSchema } from './pipeline/import-listings.js';
import { IMPORT_STOCK_ITEMS_JOB } from './pipeline/import-stock-items.js';
import { ObserveBuyboxPayloadSchema } from './pipeline/observe-buybox.js';
import { PruneHistoryPayloadSchema } from './pipeline/prune-history-job.js';
import { RepricePayloadSchema } from './pipeline/reprice.js';
import { ResetBudgetPayloadSchema } from './pipeline/reset-budget.js';
import { ResolveProductBarcodesPayloadSchema } from './pipeline/resolve-product-barcodes.js';
import { ScrapeCompetitorsPayloadSchema } from './pipeline/scrape-competitors.js';
import { SubmitPriceChangesPayloadSchema } from './pipeline/submit-price-changes.js';
import { SweepBrandCataloguePayloadSchema } from './pipeline/sweep-brand-catalogue.js';
import { createSqliteTestDb } from './test-helpers.js';

describe('job cadence (doc 07 §8, doc 08 §12, R-JOB-2)', () => {
  it('falls back to the catalogue default when nothing is stored', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      expect(await getJobCadenceMs(appDb, IMPORT_LISTINGS_JOB)).toBe(jobDefaultCadenceMs(IMPORT_LISTINGS_JOB));
    } finally {
      cleanup();
    }
  });

  it('an operator override wins over the catalogue default', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const { configRepo } = await import('@buybox/db');
      await configRepo.setAppSetting(
        appDb,
        {
          key: jobCadenceSettingKey(IMPORT_LISTINGS_JOB),
          value: JSON.stringify(15 * 60_000),
          updatedBy: 'operator',
          updatedAt: 1000,
        },
        newId(),
      );
      expect(await getJobCadenceMs(appDb, IMPORT_LISTINGS_JOB)).toBe(15 * 60_000);
    } finally {
      cleanup();
    }
  });

  it('a corrupt or below-floor stored value falls back to the default rather than throwing', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const { configRepo } = await import('@buybox/db');
      await configRepo.setAppSetting(
        appDb,
        { key: jobCadenceSettingKey(IMPORT_LISTINGS_JOB), value: 'not json', updatedBy: 'operator', updatedAt: 1000 },
        newId(),
      );
      expect(await getJobCadenceMs(appDb, IMPORT_LISTINGS_JOB)).toBe(jobDefaultCadenceMs(IMPORT_LISTINGS_JOB));

      await configRepo.setAppSetting(
        appDb,
        {
          key: jobCadenceSettingKey(IMPORT_LISTINGS_JOB),
          value: JSON.stringify(MIN_JOB_CADENCE_MS - 1),
          updatedBy: 'operator',
          updatedAt: 2000,
        },
        newId(),
      );
      expect(await getJobCadenceMs(appDb, IMPORT_LISTINGS_JOB)).toBe(jobDefaultCadenceMs(IMPORT_LISTINGS_JOB));
    } finally {
      cleanup();
    }
  });

  it('a job with no cadence at all never accepts an override — ImportBundles is always null', async () => {
    const { appDb, cleanup } = await createSqliteTestDb();
    try {
      const { configRepo } = await import('@buybox/db');
      expect(jobDefaultCadenceMs(IMPORT_BUNDLES_JOB)).toBeNull();
      await configRepo.setAppSetting(
        appDb,
        {
          key: jobCadenceSettingKey(IMPORT_BUNDLES_JOB),
          value: JSON.stringify(60_000),
          updatedBy: 'operator',
          updatedAt: 1000,
        },
        newId(),
      );
      expect(await getJobCadenceMs(appDb, IMPORT_BUNDLES_JOB)).toBeNull();
    } finally {
      cleanup();
    }
  });
});

/**
 * The Jobs screen builds a "run now" payload out of `defaultPayload` plus a marketplace code
 * (`/api/jobs/run-now`), so a catalogue default that its own handler rejects is a button that
 * can only ever fail. `ImportBundles` carried a copy of the product-source payload — a schema it
 * has nothing to do with — until 2026-08-29.
 */
describe('catalogue default payloads are runnable', () => {
  const SCHEMAS: Record<string, z.ZodTypeAny> = {
    ImportListings: ImportListingsPayloadSchema,
    ObserveBuybox: ObserveBuyboxPayloadSchema,
    Reprice: RepricePayloadSchema,
    SubmitPriceChanges: SubmitPriceChangesPayloadSchema,
    ConfirmSubmissions: ConfirmSubmissionsPayloadSchema,
    ResetBudget: ResetBudgetPayloadSchema,
    PruneHistory: PruneHistoryPayloadSchema,
    ImportBundles: ImportBundlesPayloadSchema,
    ScrapeCompetitors: ScrapeCompetitorsPayloadSchema,
    SweepBrandCatalogue: SweepBrandCataloguePayloadSchema,
    ResolveProductBarcodes: ResolveProductBarcodesPayloadSchema,
  };

  for (const entry of JOB_CATALOG) {
    // The one exception, and it is documented on the entry itself: this job's payload is the
    // configured product source, which `resolveImportStockItemsPayload` reads at trigger time.
    if (entry.jobName === IMPORT_STOCK_ITEMS_JOB) continue;

    it(`${entry.jobName}'s default payload satisfies its handler`, () => {
      const schema = SCHEMAS[entry.jobName];
      expect(schema, `no schema wired up for ${entry.jobName}`).toBeDefined();
      const payload = {
        ...entry.defaultPayload,
        ...(entry.perMarketplace ? { marketplaceCode: 'trendyol' } : {}),
      };
      expect(schema!.safeParse(payload).success).toBe(true);
    });
  }
});
