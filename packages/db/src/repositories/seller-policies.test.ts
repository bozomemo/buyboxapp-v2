/**
 * `seller_policies` storage (doc 06 §12.4, Faz 5).
 *
 * Across all three dialects, and the reason is specific: the two invariants this repository
 * carries are the ones no engine enforces. `watched_brand_id IS NULL` versus `= NULL` behaves
 * the same everywhere only if it is written correctly everywhere, and "one rule per identity per
 * scope" is upheld by a query rather than a constraint — so a single-dialect run would prove
 * nothing about the other two.
 *
 * The *meaning* of these rows is tested without a database, in
 * `packages/core/src/brand/seller-policy.test.ts`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as competitorSellersRepo from './competitor-sellers.js';
import * as configRepo from './config.js';
import * as sellerPoliciesRepo from './seller-policies.js';
import * as watchedBrandsRepo from './watched-brands.js';

const NOW = Date.UTC(2026, 7, 28);
const MARKETPLACE = 'TY';

async function seed(appDb: AppDatabase): Promise<{ groupId: string; whiskas: string; royalCanin: string }> {
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
  const ids: string[] = [];
  for (const label of ['Whiskas', 'Royal Canin']) {
    const id = newId();
    ids.push(id);
    await watchedBrandsRepo.createWatchedBrand(appDb, {
      id,
      groupId,
      marketplaceCode: MARKETPLACE,
      label,
      brandRef: null,
      searchTerm: label.toLowerCase(),
      isActive: true,
      lastSweptAt: null,
      lastSweepProductCount: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  return { groupId, whiskas: ids[0]!, royalCanin: ids[1]! };
}

const sellerIdentity = { marketplaceCode: MARKETPLACE, sellerRef: 'm-1' } as const;

for (const dialect of ALL_DIALECTS) {
  describe(`seller policies (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('stores a brand rule and reads it back', async () => {
      db = await createTestDb(dialect);
      const { groupId, whiskas } = await seed(db.appDb);
      const { created } = await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
        id: newId(),
        watchedBrandGroupId: groupId,
        watchedBrandId: whiskas,
        identity: sellerIdentity,
        status: 'authorised',
        note: '2024 bayilik sözleşmesi',
        nowMs: NOW,
      });
      expect(created).toBe(true);

      const rows = await sellerPoliciesRepo.listSellerPolicies(db.appDb, {
        watchedBrandGroupId: groupId,
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        watchedBrandId: whiskas,
        marketplaceCode: MARKETPLACE,
        sellerRef: 'm-1',
        taxNumber: null,
        status: 'authorised',
        note: '2024 bayilik sözleşmesi',
      });
    }, 30_000);

    it('replaces the statement instead of adding a second one', async () => {
      // Two contradictory statements about one seller and one brand are not a history — they are
      // an ambiguity the resolver would then have to break arbitrarily.
      db = await createTestDb(dialect);
      const { groupId, whiskas } = await seed(db.appDb);
      const first = await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
        id: newId(),
        watchedBrandGroupId: groupId,
        watchedBrandId: whiskas,
        identity: sellerIdentity,
        status: 'authorised',
        note: null,
        nowMs: NOW,
      });
      const second = await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
        id: newId(),
        watchedBrandGroupId: groupId,
        watchedBrandId: whiskas,
        identity: sellerIdentity,
        status: 'blocked',
        note: 'sözleşme feshedildi',
        nowMs: NOW + 1000,
      });

      expect(second.created).toBe(false);
      expect(second.id).toBe(first.id);
      const rows = await sellerPoliciesRepo.listSellerPolicies(db.appDb, {});
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('blocked');
      // Kept from the original: "since when have we had a view on this seller" survives a change
      // of mind about what that view is.
      expect(rows[0]!.createdAt).toBe(NOW);
      expect(rows[0]!.updatedAt).toBe(NOW + 1000);
    }, 30_000);

    it('does not confuse a group default with a brand rule for the same seller', async () => {
      // The invariant no engine enforces. A `UNIQUE` index over the identity columns treats
      // `NULL` as distinct on every engine here, so it would happily store two group defaults —
      // and `= NULL` in the lookup would match neither.
      db = await createTestDb(dialect);
      const { groupId, whiskas } = await seed(db.appDb);
      await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
        id: newId(),
        watchedBrandGroupId: groupId,
        watchedBrandId: null,
        identity: sellerIdentity,
        status: 'authorised',
        note: null,
        nowMs: NOW,
      });
      await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
        id: newId(),
        watchedBrandGroupId: groupId,
        watchedBrandId: whiskas,
        identity: sellerIdentity,
        status: 'blocked',
        note: null,
        nowMs: NOW,
      });

      const rows = await sellerPoliciesRepo.listSellerPolicies(db.appDb, {});
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.watchedBrandId === null)).toHaveLength(1);
    }, 30_000);

    it('keeps one group default per seller, not one per write', async () => {
      db = await createTestDb(dialect);
      const { groupId } = await seed(db.appDb);
      for (const status of ['authorised', 'blocked', 'authorised'] as const) {
        await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
          id: newId(),
          watchedBrandGroupId: groupId,
          watchedBrandId: null,
          identity: sellerIdentity,
          status,
          note: null,
          nowMs: NOW,
        });
      }
      const rows = await sellerPoliciesRepo.listSellerPolicies(db.appDb, {});
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('authorised');
    }, 30_000);

    it('treats a tax-number rule as a different rule from a seller-ref one', async () => {
      db = await createTestDb(dialect);
      const { groupId, whiskas } = await seed(db.appDb);
      await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
        id: newId(),
        watchedBrandGroupId: groupId,
        watchedBrandId: whiskas,
        identity: sellerIdentity,
        status: 'authorised',
        note: null,
        nowMs: NOW,
      });
      await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
        id: newId(),
        watchedBrandGroupId: groupId,
        watchedBrandId: whiskas,
        identity: { taxNumber: '1234567890' },
        status: 'blocked',
        note: null,
        nowMs: NOW,
      });
      expect(await sellerPoliciesRepo.listSellerPolicies(db.appDb, {})).toHaveLength(2);
    }, 30_000);

    describe('identity validation', () => {
      it('refuses a rule with no identity at all', async () => {
        db = await createTestDb(dialect);
        const { groupId, whiskas } = await seed(db.appDb);
        await expect(
          sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
            id: newId(),
            watchedBrandGroupId: groupId,
            watchedBrandId: whiskas,
            identity: { taxNumber: '   ' } as never,
            status: 'blocked',
            note: null,
            nowMs: NOW,
          }),
        ).rejects.toBeInstanceOf(sellerPoliciesRepo.SellerPolicyIdentityError);
      }, 30_000);

      it('refuses a seller ref with no marketplace', async () => {
        // The same digits are different companies on different marketplaces, so half the pair is
        // not half an answer — it is no answer.
        db = await createTestDb(dialect);
        const { groupId, whiskas } = await seed(db.appDb);
        await expect(
          sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
            id: newId(),
            watchedBrandGroupId: groupId,
            watchedBrandId: whiskas,
            identity: { sellerRef: 'm-1' } as never,
            status: 'blocked',
            note: null,
            nowMs: NOW,
          }),
        ).rejects.toBeInstanceOf(sellerPoliciesRepo.SellerPolicyIdentityError);
      }, 30_000);

      it('refuses a rule naming both a storefront and a firm', async () => {
        db = await createTestDb(dialect);
        const { groupId, whiskas } = await seed(db.appDb);
        await expect(
          sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
            id: newId(),
            watchedBrandGroupId: groupId,
            watchedBrandId: whiskas,
            identity: { ...sellerIdentity, taxNumber: '1234567890' } as never,
            status: 'blocked',
            note: null,
            nowMs: NOW,
          }),
        ).rejects.toBeInstanceOf(sellerPoliciesRepo.SellerPolicyIdentityError);
      }, 30_000);

      it('refuses a status outside the two that are stored', async () => {
        db = await createTestDb(dialect);
        const { groupId, whiskas } = await seed(db.appDb);
        await expect(
          sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
            id: newId(),
            watchedBrandGroupId: groupId,
            watchedBrandId: whiskas,
            identity: sellerIdentity,
            status: 'undefined' as never,
            note: null,
            nowMs: NOW,
          }),
        ).rejects.toBeInstanceOf(sellerPoliciesRepo.SellerPolicyStatusError);
      }, 30_000);
    });

    describe('listSellerPolicies', () => {
      it('always includes the group defaults when filtering by brand', async () => {
        // A rule scoped to the whole group is in force for every brand named; dropping it would
        // report a seller as undefined when the group has plainly ruled on them.
        db = await createTestDb(dialect);
        const { groupId, whiskas, royalCanin } = await seed(db.appDb);
        await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
          id: newId(),
          watchedBrandGroupId: groupId,
          watchedBrandId: null,
          identity: sellerIdentity,
          status: 'authorised',
          note: null,
          nowMs: NOW,
        });
        await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
          id: newId(),
          watchedBrandGroupId: groupId,
          watchedBrandId: royalCanin,
          identity: sellerIdentity,
          status: 'blocked',
          note: null,
          nowMs: NOW,
        });

        const forWhiskas = await sellerPoliciesRepo.listSellerPolicies(db.appDb, {
          watchedBrandIds: [whiskas],
        });
        expect(forWhiskas).toHaveLength(1);
        expect(forWhiskas[0]!.watchedBrandId).toBeNull();

        const forBoth = await sellerPoliciesRepo.listSellerPolicies(db.appDb, {
          watchedBrandIds: [whiskas, royalCanin],
        });
        expect(forBoth).toHaveLength(2);

        // An empty brand list still gets the defaults: it means "no brand named", not "no rules".
        const defaultsOnly = await sellerPoliciesRepo.listSellerPolicies(db.appDb, {
          watchedBrandIds: [],
        });
        expect(defaultsOnly).toHaveLength(1);
      }, 30_000);
    });

    it('deletes a rule, which is the only way back to the undefined state', async () => {
      db = await createTestDb(dialect);
      const { groupId, whiskas } = await seed(db.appDb);
      const { id } = await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
        id: newId(),
        watchedBrandGroupId: groupId,
        watchedBrandId: whiskas,
        identity: sellerIdentity,
        status: 'blocked',
        note: null,
        nowMs: NOW,
      });
      await sellerPoliciesRepo.deleteSellerPolicy(db.appDb, id);
      expect(await sellerPoliciesRepo.listSellerPolicies(db.appDb, {})).toEqual([]);
    }, 30_000);

    it('drops a brand rule with its brand, and a group rule with its group', async () => {
      db = await createTestDb(dialect);
      const { groupId, whiskas } = await seed(db.appDb);
      await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
        id: newId(),
        watchedBrandGroupId: groupId,
        watchedBrandId: whiskas,
        identity: sellerIdentity,
        status: 'blocked',
        note: null,
        nowMs: NOW,
      });
      await sellerPoliciesRepo.upsertSellerPolicy(db.appDb, {
        id: newId(),
        watchedBrandGroupId: groupId,
        watchedBrandId: null,
        identity: sellerIdentity,
        status: 'authorised',
        note: null,
        nowMs: NOW,
      });

      // Cascade, not set-null: a rule about a brand that no longer exists is not a rule about
      // nothing, it is a rule that has stopped meaning anything.
      await watchedBrandsRepo.deleteWatchedBrand(db.appDb, whiskas);
      const afterBrand = await sellerPoliciesRepo.listSellerPolicies(db.appDb, {});
      expect(afterBrand).toHaveLength(1);
      expect(afterBrand[0]!.watchedBrandId).toBeNull();

      await watchedBrandsRepo.deleteWatchedBrandGroup(db.appDb, groupId);
      expect(await sellerPoliciesRepo.listSellerPolicies(db.appDb, {})).toEqual([]);
    }, 30_000);

    describe('setSellerTaxNumber', () => {
      async function seedSeller(appDb: AppDatabase): Promise<void> {
        await competitorSellersRepo.recordSeenSellers(appDb, [
          {
            id: newId(),
            marketplaceCode: MARKETPLACE,
            sellerRef: 'm-1',
            sellerName: 'Bayi A.Ş.',
            seenAt: NOW,
          },
        ]);
      }

      it('records the firm behind a storefront', async () => {
        db = await createTestDb(dialect);
        await seed(db.appDb);
        await seedSeller(db.appDb);
        await sellerPoliciesRepo.setSellerTaxNumber(
          db.appDb,
          { marketplaceCode: MARKETPLACE, sellerRef: 'm-1' },
          ' 1234567890 ',
        );
        const seller = (await competitorSellersRepo.listCompetitorSellers(db.appDb, {}))[0]!;
        expect(seller.taxNumber).toBe('1234567890');
      }, 30_000);

      it('survives a scrape, which never writes it', async () => {
        // Operator-owned, like `group_id` and `operator_note` beside it. A scrape that
        // overwrote this would undo the one piece of data no automatic process can reproduce
        // until Faz 7 — and Faz 7 must still only fill it where it is null.
        db = await createTestDb(dialect);
        await seed(db.appDb);
        await seedSeller(db.appDb);
        await sellerPoliciesRepo.setSellerTaxNumber(
          db.appDb,
          { marketplaceCode: MARKETPLACE, sellerRef: 'm-1' },
          '1234567890',
        );
        await competitorSellersRepo.recordSeenSellers(db.appDb, [
          {
            id: newId(),
            marketplaceCode: MARKETPLACE,
            sellerRef: 'm-1',
            sellerName: 'Bayi Ticaret A.Ş.',
            seenAt: NOW + 1000,
          },
        ]);
        const seller = (await competitorSellersRepo.listCompetitorSellers(db.appDb, {}))[0]!;
        expect(seller.sellerName).toBe('Bayi Ticaret A.Ş.');
        expect(seller.taxNumber).toBe('1234567890');
      }, 30_000);

      it('clears it back to unknown', async () => {
        db = await createTestDb(dialect);
        await seed(db.appDb);
        await seedSeller(db.appDb);
        await sellerPoliciesRepo.setSellerTaxNumber(
          db.appDb,
          { marketplaceCode: MARKETPLACE, sellerRef: 'm-1' },
          '1234567890',
        );
        await sellerPoliciesRepo.setSellerTaxNumber(
          db.appDb,
          { marketplaceCode: MARKETPLACE, sellerRef: 'm-1' },
          '  ',
        );
        const seller = (await competitorSellersRepo.listCompetitorSellers(db.appDb, {}))[0]!;
        expect(seller.taxNumber).toBeNull();
      }, 30_000);
    });
  });
}
