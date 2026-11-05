/**
 * `commission_tariffs` (doc 17 §8.2) across all three dialects: a re-import replaces a period
 * rather than doubling it, the tariff in force is chosen by time, and kuruş tiers survive the
 * JSON round trip exactly.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as commissionTariffsRepo from './commission-tariffs.js';
import * as configRepo from './config.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 2);

const TIERS = [
  { minPrice: 426660n, maxPrice: null, rate: 16.5 },
  { minPrice: 361360n, maxPrice: 426659n, rate: 6.2 },
  { minPrice: null, maxPrice: 361359n, rate: 2.8 },
];

async function seed(appDb: AppDatabase): Promise<void> {
  await configRepo.upsertMarketplace(appDb, {
    code: 'trendyol',
    displayName: 'Trendyol',
    enabled: true,
    merchantRef: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function tariff(
  productKey: string,
  validFrom: number,
  validUntil: number,
  tiers = TIERS,
): commissionTariffsRepo.CommissionTariffRow {
  return {
    id: newId(),
    marketplaceCode: 'trendyol',
    productKey,
    barcode: `0${productKey}`,
    sellerStockCode: null,
    validFrom,
    validUntil,
    tiers,
    sourceFile: 'tarife.xlsx',
    importedAt: NOW,
  };
}

for (const dialect of ALL_DIALECTS) {
  describe(`commission tariffs (${dialect})`, () => {
    let db: TestDb;
    afterEach(async () => {
      await db.cleanup();
    }, 60_000);

    it('returns the tariff in force, tiers exact, and nothing outside its period', async () => {
      db = await createTestDb(dialect);
      await seed(db.appDb);
      await commissionTariffsRepo.replaceTariffs(db.appDb, [
        tariff('111', NOW - DAY, NOW + DAY),
        tariff('222', NOW + DAY, NOW + 2 * DAY),
        tariff('333', NOW - 2 * DAY, NOW),
      ]);

      const current = await commissionTariffsRepo.currentTariffs(
        db.appDb,
        'trendyol',
        ['111', '222', '333', '444'],
        NOW,
      );

      expect([...current.keys()]).toEqual(['111']);
      expect(current.get('111')).toEqual(TIERS);
    }, 60_000);

    it('replaces a re-imported period instead of doubling it, and leaves other periods alone', async () => {
      db = await createTestDb(dialect);
      await seed(db.appDb);
      await commissionTariffsRepo.replaceTariffs(db.appDb, [
        tariff('111', NOW - DAY, NOW + DAY),
        tariff('111', NOW + DAY, NOW + 2 * DAY),
      ]);
      const corrected = [{ minPrice: null, maxPrice: null, rate: 9 }];
      await commissionTariffsRepo.replaceTariffs(db.appDb, [tariff('111', NOW - DAY, NOW + DAY, corrected)]);

      expect(
        (await commissionTariffsRepo.currentTariffs(db.appDb, 'trendyol', ['111'], NOW)).get('111'),
      ).toEqual(corrected);
      const periods = await commissionTariffsRepo.listTariffPeriods(db.appDb);
      expect(periods.map((p) => [p.validFrom, p.products])).toEqual([
        [NOW + DAY, 1],
        [NOW - DAY, 1],
      ]);
    }, 60_000);

    it('prefers the later-starting of two overlapping periods', async () => {
      db = await createTestDb(dialect);
      await seed(db.appDb);
      const newer = [{ minPrice: null, maxPrice: null, rate: 5 }];
      await commissionTariffsRepo.replaceTariffs(db.appDb, [
        tariff('111', NOW - 3 * DAY, NOW + 3 * DAY),
        tariff('111', NOW - DAY, NOW + DAY, newer),
      ]);

      expect(
        (await commissionTariffsRepo.currentTariffs(db.appDb, 'trendyol', ['111'], NOW)).get('111'),
      ).toEqual(newer);
    }, 60_000);
  });
}
