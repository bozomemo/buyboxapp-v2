import { newId } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import {
  getJobCadenceMs,
  jobCadenceSettingKey,
  jobDefaultCadenceMs,
  MIN_JOB_CADENCE_MS,
} from './job-catalog.js';
import { IMPORT_BUNDLES_JOB } from './pipeline/import-bundles.js';
import { IMPORT_LISTINGS_JOB } from './pipeline/import-listings.js';
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
