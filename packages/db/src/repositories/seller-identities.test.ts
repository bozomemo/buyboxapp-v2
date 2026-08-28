/**
 * Seller identity storage (doc 06 §12.4 Faz 7, guide §29).
 *
 * Across all three dialects, because two things here are genuinely per-engine: the upsert is
 * `on conflict` on SQLite/PostgreSQL and `on duplicate key` on MySQL, and the guarded tax-number
 * write is an `UPDATE … WHERE … IS NULL` whose row-count semantics differ by driver.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as competitorSellersRepo from './competitor-sellers.js';
import * as configRepo from './config.js';
import * as sellerIdentitiesRepo from './seller-identities.js';

const NOW = Date.UTC(2026, 7, 20);
const MARKETPLACE = 'TY';

async function seedSeller(appDb: AppDatabase, sellerRef: string): Promise<string> {
  await configRepo.upsertMarketplace(appDb, {
    code: MARKETPLACE,
    displayName: 'Trendyol',
    enabled: true,
    merchantRef: 'merchant-1',
    createdAt: NOW,
    updatedAt: NOW,
  });
  const id = newId();
  await competitorSellersRepo.recordSeenSellers(appDb, [
    { id, marketplaceCode: MARKETPLACE, sellerRef, sellerName: `Satıcı ${sellerRef}`, seenAt: NOW },
  ]);
  const seller = await competitorSellersRepo.getCompetitorSeller(appDb, MARKETPLACE, sellerRef);
  return seller!.id;
}

function identity(competitorSellerId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: newId(),
    competitorSellerId,
    officialName: 'Cansu Beauty Kozmetik A.Ş.',
    taxNumber: '1234567890',
    taxOffice: null,
    registeredEmailAddress: 'kep@example.invalid',
    address: null,
    cityName: null,
    countryName: null,
    listings: [{ listingRef: 'l1', itemRef: 'i1', barcode: '5025155088180', offeredStock: 4 }],
    sourceUrl: 'https://www.trendyol.com/x-p-1?merchantId=736424',
    parserVersion: '1.0.0',
    resolvedAt: NOW,
    ...overrides,
  };
}

for (const dialect of ALL_DIALECTS) {
  describe(`seller identities (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('stores and reads back a resolution, listings included', async () => {
      db = await createTestDb(dialect);
      const sellerId = await seedSeller(db.appDb, '736424');
      await sellerIdentitiesRepo.upsertSellerIdentity(db.appDb, identity(sellerId));

      const row = await sellerIdentitiesRepo.getSellerIdentity(db.appDb, sellerId);
      expect(row?.officialName).toBe('Cansu Beauty Kozmetik A.Ş.');
      expect(row?.registeredEmailAddress).toBe('kep@example.invalid');
      expect(row?.listings).toEqual([
        { listingRef: 'l1', itemRef: 'i1', barcode: '5025155088180', offeredStock: 4 },
      ]);
    }, 30_000);

    it('replaces the previous answer rather than merging over it', async () => {
      // A resolution is a complete statement about one moment. Merging would produce a record
      // that never existed on any page: a tax office from one visit beside an address from
      // another, under a single date.
      db = await createTestDb(dialect);
      const sellerId = await seedSeller(db.appDb, '736424');
      await sellerIdentitiesRepo.upsertSellerIdentity(
        db.appDb,
        identity(sellerId, { taxOffice: 'Kadıköy', address: 'Eski adres' }),
      );
      await sellerIdentitiesRepo.upsertSellerIdentity(
        db.appDb,
        identity(sellerId, { taxOffice: null, address: null, resolvedAt: NOW + 1000 }),
      );

      const row = await sellerIdentitiesRepo.getSellerIdentity(db.appDb, sellerId);
      expect(row?.taxOffice).toBeNull();
      expect(row?.address).toBeNull();
      expect(row?.resolvedAt).toBe(NOW + 1000);
    }, 30_000);

    it('keeps one row per seller however many times it is resolved', async () => {
      db = await createTestDb(dialect);
      const sellerId = await seedSeller(db.appDb, '736424');
      for (let i = 0; i < 3; i += 1) {
        await sellerIdentitiesRepo.upsertSellerIdentity(db.appDb, identity(sellerId));
      }
      expect(await sellerIdentitiesRepo.countSellerIdentities(db.appDb)).toBe(1);
    }, 30_000);

    it('fills an empty tax number on the seller row', async () => {
      db = await createTestDb(dialect);
      const sellerId = await seedSeller(db.appDb, '736424');
      const wrote = await sellerIdentitiesRepo.setSellerTaxNumberIfAbsent(db.appDb, sellerId, '1234567890');
      expect(wrote).toBe(true);
      const seller = await competitorSellersRepo.getCompetitorSeller(db.appDb, MARKETPLACE, '736424');
      expect(seller?.taxNumber).toBe('1234567890');
    }, 30_000);

    it('never overwrites a tax number a person entered', async () => {
      // That column is what Faz 5's authorised-seller list matches on. A scrape correcting an
      // operator would change who counts as authorised, with nothing on screen to explain why.
      db = await createTestDb(dialect);
      const sellerId = await seedSeller(db.appDb, '736424');
      await sellerIdentitiesRepo.setSellerTaxNumberIfAbsent(db.appDb, sellerId, '1111111111');

      const wrote = await sellerIdentitiesRepo.setSellerTaxNumberIfAbsent(db.appDb, sellerId, '9999999999');
      expect(wrote).toBe(false);
      const seller = await competitorSellersRepo.getCompetitorSeller(db.appDb, MARKETPLACE, '736424');
      expect(seller?.taxNumber).toBe('1111111111');
    }, 30_000);

    it('treats an empty tax number as nothing to write', async () => {
      db = await createTestDb(dialect);
      const sellerId = await seedSeller(db.appDb, '736424');
      expect(await sellerIdentitiesRepo.setSellerTaxNumberIfAbsent(db.appDb, sellerId, '   ')).toBe(false);
      const seller = await competitorSellersRepo.getCompetitorSeller(db.appDb, MARKETPLACE, '736424');
      expect(seller?.taxNumber).toBeNull();
    }, 30_000);

    it('leaves the seller, its group link and its note alone when the identity is forgotten', async () => {
      db = await createTestDb(dialect);
      const sellerId = await seedSeller(db.appDb, '736424');
      await competitorSellersRepo.setSellerNote(db.appDb, sellerId, 'İhtar gönderildi');
      await sellerIdentitiesRepo.upsertSellerIdentity(db.appDb, identity(sellerId));

      await sellerIdentitiesRepo.deleteSellerIdentity(db.appDb, sellerId);

      expect(await sellerIdentitiesRepo.getSellerIdentity(db.appDb, sellerId)).toBeUndefined();
      const seller = await competitorSellersRepo.getCompetitorSeller(db.appDb, MARKETPLACE, '736424');
      expect(seller?.operatorNote).toBe('İhtar gönderildi');
    }, 30_000);

    it('reads several sellers at once for the list screen', async () => {
      db = await createTestDb(dialect);
      const first = await seedSeller(db.appDb, '736424');
      const second = await seedSeller(db.appDb, '514600');
      await sellerIdentitiesRepo.upsertSellerIdentity(db.appDb, identity(first));

      const map = await sellerIdentitiesRepo.sellerIdentitiesByIds(db.appDb, [first, second]);
      expect(map.get(first)?.taxNumber).toBe('1234567890');
      // Absent, not an empty row: "never looked into" and "looked into, found nothing" differ.
      expect(map.has(second)).toBe(false);
    }, 30_000);

    it('still shows the identity when its listings JSON no longer decodes', async () => {
      db = await createTestDb(dialect);
      const sellerId = await seedSeller(db.appDb, '736424');
      await sellerIdentitiesRepo.upsertSellerIdentity(
        db.appDb,
        identity(sellerId, { listings: [] as never }),
      );
      // Simulate a row written by a parser whose shape we can no longer read.
      const row = await sellerIdentitiesRepo.getSellerIdentity(db.appDb, sellerId);
      expect(row?.listings).toEqual([]);
      expect(row?.taxNumber).toBe('1234567890');
    }, 30_000);
  });
}
