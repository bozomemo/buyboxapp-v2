/**
 * Open/resolved state for audit findings (2026-09-03).
 *
 * Across all three dialects, because the reconciliation leans on two things the engines differ
 * about: `is null` on a nullable timestamp (the notifier's work list), and a multi-row insert
 * followed immediately by a read of what was inserted.
 *
 * The properties under test are the ones whose failure is silent. A finding that re-opens every
 * run notifies every run; one that never re-opens after clearing hides a competitor coming back;
 * and a send recorded before it succeeded loses the finding for good.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as brandFindingsRepo from './brand-findings.js';
import * as configRepo from './config.js';
import * as watchedBrandsRepo from './watched-brands.js';

const NOW = Date.UTC(2026, 8, 3);
const HOUR = 60 * 60_000;
const MARKETPLACE = 'TY';

async function seedBrand(appDb: AppDatabase): Promise<string> {
  await configRepo.upsertMarketplace(appDb, {
    code: MARKETPLACE,
    displayName: 'Trendyol',
    enabled: true,
    merchantRef: 'merchant-1',
    createdAt: NOW,
    updatedAt: NOW,
  });
  const groupId = newId();
  await watchedBrandsRepo.createWatchedBrandGroup(appDb, {
    id: groupId,
    name: 'Mars',
    note: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const brandId = newId();
  await watchedBrandsRepo.createWatchedBrand(appDb, {
    id: brandId,
    groupId,
    marketplaceCode: MARKETPLACE,
    label: 'Whiskas',
    brandRef: null,
    searchTerm: 'whiskas',
    isActive: true,
    lastSweptAt: null,
    lastSweepProductCount: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return brandId;
}

function derived(
  key: string,
  over: Partial<brandFindingsRepo.DerivedFinding> = {},
): brandFindingsRepo.DerivedFinding {
  return {
    key,
    kind: 'blockedSellerPresent',
    basis: 'stated',
    magnitude: 1,
    payload: JSON.stringify({ subject: { kind: 'seller', name: 'Bir Mağaza' } }),
    ...over,
  };
}

for (const dialect of ALL_DIALECTS) {
  describe(`brand findings (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('opens a finding it has not seen before', async () => {
      db = await createTestDb(dialect);
      const brandId = await seedBrand(db.appDb);

      const result = await brandFindingsRepo.reconcileBrandFindings(db.appDb, brandId, [derived('a')], NOW);

      expect(result.opened.map((r) => r.findingKey)).toEqual(['a']);
      expect(result.unchanged).toBe(0);
      const open = await brandFindingsRepo.openFindings(db.appDb, brandId);
      expect(open).toHaveLength(1);
      expect(open[0]!.notifiedAt).toBeNull();
    }, 30_000);

    /**
     * The property the notification rests on: a condition that is still true must not be
     * reported as new, or an hourly job announces it hourly.
     */
    it('does not re-open a finding that is still true', async () => {
      db = await createTestDb(dialect);
      const brandId = await seedBrand(db.appDb);
      await brandFindingsRepo.reconcileBrandFindings(db.appDb, brandId, [derived('a')], NOW);

      const second = await brandFindingsRepo.reconcileBrandFindings(
        db.appDb,
        brandId,
        [derived('a')],
        NOW + HOUR,
      );

      expect(second.opened).toHaveLength(0);
      expect(second.unchanged).toBe(1);
      const open = await brandFindingsRepo.openFindings(db.appDb, brandId);
      expect(open[0]!.firstSeenAt).toBe(NOW);
      expect(open[0]!.lastSeenAt).toBe(NOW + HOUR);
    }, 30_000);

    it('refreshes the numbers on a finding that is still true', async () => {
      db = await createTestDb(dialect);
      const brandId = await seedBrand(db.appDb);
      await brandFindingsRepo.reconcileBrandFindings(db.appDb, brandId, [derived('a')], NOW);

      await brandFindingsRepo.reconcileBrandFindings(
        db.appDb,
        brandId,
        [derived('a', { magnitude: 9, payload: '{"subject":{"name":"Yeni"}}' })],
        NOW + HOUR,
      );

      // The span is what is being tracked; the figures inside it are a snapshot of now.
      const open = await brandFindingsRepo.openFindings(db.appDb, brandId);
      expect(open[0]!.magnitude).toBe(9);
      expect(open[0]!.payload).toContain('Yeni');
    }, 30_000);

    it('resolves a finding the archive no longer produces', async () => {
      db = await createTestDb(dialect);
      const brandId = await seedBrand(db.appDb);
      await brandFindingsRepo.reconcileBrandFindings(db.appDb, brandId, [derived('a')], NOW);

      const second = await brandFindingsRepo.reconcileBrandFindings(db.appDb, brandId, [], NOW + HOUR);

      expect(second.resolved).toBe(1);
      expect(await brandFindingsRepo.openFindings(db.appDb, brandId)).toHaveLength(0);
    }, 30_000);

    /**
     * A competitor who leaves and comes back is two spans, not an edited one. Collapsing them
     * would erase that it happened twice — and would leave the second occurrence unnotified,
     * because the row would already be marked as sent.
     */
    it('opens a second span when a resolved finding returns', async () => {
      db = await createTestDb(dialect);
      const brandId = await seedBrand(db.appDb);
      await brandFindingsRepo.reconcileBrandFindings(db.appDb, brandId, [derived('a')], NOW);
      await brandFindingsRepo.reconcileBrandFindings(db.appDb, brandId, [], NOW + HOUR);

      const third = await brandFindingsRepo.reconcileBrandFindings(
        db.appDb,
        brandId,
        [derived('a')],
        NOW + 2 * HOUR,
      );

      expect(third.opened).toHaveLength(1);
      expect(third.opened[0]!.firstSeenAt).toBe(NOW + 2 * HOUR);
      expect(await brandFindingsRepo.openFindings(db.appDb, brandId)).toHaveLength(1);
    }, 30_000);

    it('keeps one brand out of another brand reconciliation', async () => {
      db = await createTestDb(dialect);
      const first = await seedBrand(db.appDb);
      const second = await seedBrand(db.appDb);
      await brandFindingsRepo.reconcileBrandFindings(db.appDb, first, [derived('a')], NOW);

      // An empty run for the *other* brand must not resolve the first brand's finding.
      await brandFindingsRepo.reconcileBrandFindings(db.appDb, second, [], NOW + HOUR);

      expect(await brandFindingsRepo.openFindings(db.appDb, first)).toHaveLength(1);
    }, 30_000);

    it('lists what nobody has been told about, and stops listing it once told', async () => {
      db = await createTestDb(dialect);
      const brandId = await seedBrand(db.appDb);
      const { opened } = await brandFindingsRepo.reconcileBrandFindings(
        db.appDb,
        brandId,
        [derived('a'), derived('b')],
        NOW,
      );

      expect(await brandFindingsRepo.unnotifiedFindings(db.appDb, 10)).toHaveLength(2);

      await brandFindingsRepo.markFindingsNotified(db.appDb, [opened[0]!.id], NOW);

      const left = await brandFindingsRepo.unnotifiedFindings(db.appDb, 10);
      expect(left).toHaveLength(1);
      expect(left[0]!.id).toBe(opened[1]!.id);
    }, 30_000);

    it('orders open findings by magnitude, most extreme first', async () => {
      db = await createTestDb(dialect);
      const brandId = await seedBrand(db.appDb);
      await brandFindingsRepo.reconcileBrandFindings(
        db.appDb,
        brandId,
        [derived('small', { magnitude: 1 }), derived('big', { magnitude: 50 })],
        NOW,
      );

      const open = await brandFindingsRepo.openFindings(db.appDb, brandId);
      expect(open.map((f) => f.findingKey)).toEqual(['big', 'small']);
    }, 30_000);

    it('does nothing at all for a brand with no findings and none stored', async () => {
      db = await createTestDb(dialect);
      const brandId = await seedBrand(db.appDb);

      expect(await brandFindingsRepo.reconcileBrandFindings(db.appDb, brandId, [], NOW)).toEqual({
        opened: [],
        resolved: 0,
        unchanged: 0,
      });
    }, 30_000);
  });
}
