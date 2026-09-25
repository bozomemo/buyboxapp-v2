/**
 * Brand products and card links (doc 17 §2) — across all three dialects, because the rules this
 * file guards are enforced by the repository inside a transaction, and transactions are exactly
 * where the three engines differ (SQLite runs them synchronously, PostgreSQL and MySQL lock the
 * product row). Money is also a sortable text encoding on SQLite and a native `bigint` elsewhere.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from '../client.js';
import { newId } from '../id.js';
import { ALL_DIALECTS, createTestDb, type TestDb } from '../test-helpers.js';
import * as brandProductsRepo from './brand-products.js';
import * as configRepo from './config.js';
import * as trackedProductsRepo from './tracked-products.js';

const NOW = Date.UTC(2026, 8, 19);

async function seedMarketplaces(appDb: AppDatabase): Promise<void> {
  for (const [code, name] of [
    ['TY', 'Trendyol'],
    ['HB', 'Hepsiburada'],
  ] as const) {
    await configRepo.upsertMarketplace(appDb, {
      code,
      displayName: name,
      enabled: true,
      merchantRef: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
}

async function addCard(appDb: AppDatabase, marketplaceCode: string, productRef: string): Promise<string> {
  const id = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode,
    productRef,
    productUrl: `/urun-p-${productRef}`,
    label: `Kart ${productRef}`,
    isActive: true,
    addedAt: NOW,
  });
  return id;
}

async function addProduct(
  appDb: AppDatabase,
  overrides: Partial<brandProductsRepo.BrandProductRow> = {},
): Promise<string> {
  const id = newId();
  await brandProductsRepo.insertBrandProduct(appDb, {
    id,
    name: 'Ton Balıklı 85g',
    referencePrice: 49_90n,
    minPrice: null,
    maxPrice: null,
    barcode: null,
    source: 'manual',
    referencePriceSource: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
  return id;
}

function link(
  brandProductId: string,
  trackedProductId: string,
  overrides: Partial<brandProductsRepo.LinkCardInput> = {},
): brandProductsRepo.LinkCardInput {
  return {
    id: newId(),
    brandProductId,
    trackedProductId,
    unitMultiplier: 1,
    isPrimary: false,
    linkSource: 'manual',
    linkedAt: NOW,
    ...overrides,
  };
}

for (const dialect of ALL_DIALECTS) {
  describe(`brand products (${dialect})`, () => {
    let db: TestDb | undefined;
    afterEach(async () => {
      await db?.cleanup();
      db = undefined;
    }, 30_000);

    it('round-trips per-unit prices exactly, nulls included', async () => {
      db = await createTestDb(dialect);
      const id = await addProduct(db.appDb, {
        referencePrice: 1_249_90n,
        minPrice: 999_99n,
        maxPrice: null,
        barcode: '8690632000015',
        referencePriceSource: 'liste.xlsx',
      });

      expect(await brandProductsRepo.getBrandProduct(db.appDb, id)).toMatchObject({
        referencePrice: 1_249_90n,
        minPrice: 999_99n,
        maxPrice: null,
        barcode: '8690632000015',
        referencePriceSource: 'liste.xlsx',
        source: 'manual',
      });
    }, 30_000);

    /** doc 17 §3.4: the statement is complete — an absent min is a cleared min. */
    it('replaces every stated field on update, clearing what is now absent', async () => {
      db = await createTestDb(dialect);
      const id = await addProduct(db.appDb, { minPrice: 40_00n, maxPrice: 60_00n, barcode: '1' });

      await brandProductsRepo.updateBrandProduct(
        db.appDb,
        id,
        {
          name: 'Yeni ad',
          referencePrice: 55_00n,
          minPrice: null,
          maxPrice: null,
          barcode: null,
          referencePriceSource: 'yeni.xlsx',
        },
        NOW + 1_000,
      );

      expect(await brandProductsRepo.getBrandProduct(db.appDb, id)).toMatchObject({
        name: 'Yeni ad',
        referencePrice: 55_00n,
        minPrice: null,
        maxPrice: null,
        barcode: null,
        referencePriceSource: 'yeni.xlsx',
        createdAt: NOW,
        updatedAt: NOW + 1_000,
      });
    }, 30_000);

    it('links a card, copying its marketplace from the tracked product', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const product = await addProduct(db.appDb);
      const card = await addCard(db.appDb, 'HB', 'HBCV1');

      const result = await brandProductsRepo.linkCard(
        db.appDb,
        link(product, card, { unitMultiplier: 3, isPrimary: true, linkSource: 'excel' }),
      );

      expect(result).toMatchObject({ ok: true, demotedCardId: null });
      const cards = await brandProductsRepo.listBrandProductCards(db.appDb, product);
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({
        trackedProductId: card,
        marketplaceCode: 'HB',
        unitMultiplier: 3,
        isPrimary: true,
        linkSource: 'excel',
      });
    }, 30_000);

    /** A card in two products would count the same buybox and the same stock twice. */
    it('refuses a card that is already linked, naming the product that holds it', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const first = await addProduct(db.appDb);
      const second = await addProduct(db.appDb);
      const card = await addCard(db.appDb, 'TY', '1');
      await brandProductsRepo.linkCard(db.appDb, link(first, card));

      expect(await brandProductsRepo.linkCard(db.appDb, link(second, card))).toEqual({
        ok: false,
        reason: 'cardAlreadyLinked',
        brandProductId: first,
      });
      // The same product too: changing a link is its own action, not a re-link.
      expect(await brandProductsRepo.linkCard(db.appDb, link(first, card))).toMatchObject({
        ok: false,
        reason: 'cardAlreadyLinked',
      });
      expect(await brandProductsRepo.listBrandProductCards(db.appDb, second)).toHaveLength(0);
    }, 30_000);

    it('says which side is missing rather than writing a dangling link', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const product = await addProduct(db.appDb);
      const card = await addCard(db.appDb, 'TY', '1');

      expect(await brandProductsRepo.linkCard(db.appDb, link('no-such-product', card))).toEqual({
        ok: false,
        reason: 'productNotFound',
      });
      expect(await brandProductsRepo.linkCard(db.appDb, link(product, 'no-such-card'))).toEqual({
        ok: false,
        reason: 'cardNotFound',
      });
    }, 30_000);

    it.each([0, -1, 1.5])(
      'refuses multiplier %s before touching the database',
      async (multiplier) => {
        db = await createTestDb(dialect);
        await seedMarketplaces(db.appDb);
        const product = await addProduct(db.appDb);
        const card = await addCard(db.appDb, 'TY', '1');

        await expect(
          brandProductsRepo.linkCard(db.appDb, link(product, card, { unitMultiplier: multiplier })),
        ).rejects.toThrow(RangeError);
        expect(await brandProductsRepo.listBrandProductCards(db.appDb, product)).toHaveLength(0);
      },
      30_000,
    );

    /**
     * doc 17 §2.1 / §3.3: at most one primary per (product, marketplace), and a new primary
     * leaves the old one linked as an ordinary card. The other marketplace's primary is not
     * touched.
     */
    it('demotes the previous primary on the same marketplace only', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const product = await addProduct(db.appDb);
      const tyOld = await addCard(db.appDb, 'TY', '1');
      const tyNew = await addCard(db.appDb, 'TY', '2');
      const hb = await addCard(db.appDb, 'HB', 'HBCV1');
      const oldLink = link(product, tyOld, { isPrimary: true });
      await brandProductsRepo.linkCard(db.appDb, oldLink);
      await brandProductsRepo.linkCard(db.appDb, link(product, hb, { isPrimary: true }));

      const result = await brandProductsRepo.linkCard(db.appDb, link(product, tyNew, { isPrimary: true }));

      expect(result).toMatchObject({ ok: true, demotedCardId: oldLink.id });
      const cards = await brandProductsRepo.listBrandProductCards(db.appDb, product);
      const byCard = new Map(cards.map((c) => [c.trackedProductId, c.isPrimary]));
      expect(byCard).toEqual(
        new Map([
          [tyOld, false],
          [tyNew, true],
          [hb, true],
        ]),
      );
    }, 30_000);

    it('promotes a card to primary and demotes the one before it', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const product = await addProduct(db.appDb);
      const primary = link(product, await addCard(db.appDb, 'TY', '1'), { isPrimary: true });
      const extra = link(product, await addCard(db.appDb, 'TY', '2'), { unitMultiplier: 3 });
      await brandProductsRepo.linkCard(db.appDb, primary);
      await brandProductsRepo.linkCard(db.appDb, extra);

      expect(await brandProductsRepo.setPrimaryCard(db.appDb, extra.id)).toEqual({
        ok: true,
        demotedCardId: primary.id,
      });
      expect((await brandProductsRepo.getBrandProductCard(db.appDb, primary.id))?.isPrimary).toBe(false);
      expect((await brandProductsRepo.getBrandProductCard(db.appDb, extra.id))?.isPrimary).toBe(true);

      // Already primary: nothing to demote.
      expect(await brandProductsRepo.setPrimaryCard(db.appDb, extra.id)).toEqual({
        ok: true,
        demotedCardId: null,
      });
      expect(await brandProductsRepo.setPrimaryCard(db.appDb, 'nope')).toEqual({
        ok: false,
        reason: 'cardNotFound',
      });
    }, 30_000);

    it('changes a multiplier, and refuses an invalid one', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const product = await addProduct(db.appDb);
      const card = link(product, await addCard(db.appDb, 'TY', '1'));
      await brandProductsRepo.linkCard(db.appDb, card);

      await brandProductsRepo.setCardMultiplier(db.appDb, card.id, 6);
      expect((await brandProductsRepo.getBrandProductCard(db.appDb, card.id))?.unitMultiplier).toBe(6);
      await expect(brandProductsRepo.setCardMultiplier(db.appDb, card.id, 0)).rejects.toThrow(RangeError);
    }, 30_000);

    it('keeps the tracked product when a link or a whole product is removed', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const product = await addProduct(db.appDb);
      const a = await addCard(db.appDb, 'TY', '1');
      const b = await addCard(db.appDb, 'TY', '2');
      const linkA = link(product, a);
      await brandProductsRepo.linkCard(db.appDb, linkA);
      await brandProductsRepo.linkCard(db.appDb, link(product, b));

      await brandProductsRepo.unlinkCard(db.appDb, linkA.id);
      expect(await brandProductsRepo.listBrandProductCards(db.appDb, product)).toHaveLength(1);

      await brandProductsRepo.deleteBrandProduct(db.appDb, product);
      expect(await brandProductsRepo.getBrandProduct(db.appDb, product)).toBeUndefined();
      expect(await brandProductsRepo.cardLinksForTrackedProducts(db.appDb, [a, b])).toEqual(new Map());
      expect(await trackedProductsRepo.getTrackedProduct(db.appDb, a)).toBeDefined();
      expect(await trackedProductsRepo.getTrackedProduct(db.appDb, b)).toBeDefined();

      // A freed card can be linked again.
      const again = await addProduct(db.appDb);
      expect((await brandProductsRepo.linkCard(db.appDb, link(again, a))).ok).toBe(true);
    }, 30_000);

    it('drops the link when the tracked product is deleted', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const product = await addProduct(db.appDb);
      const card = await addCard(db.appDb, 'TY', '1');
      await brandProductsRepo.linkCard(db.appDb, link(product, card));

      await trackedProductsRepo.deleteTrackedProduct(db.appDb, card);

      expect(await brandProductsRepo.listBrandProductCards(db.appDb, product)).toHaveLength(0);
    }, 30_000);

    it('looks up each card’s link with the prices it is compared against', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const product = await addProduct(db.appDb, { name: 'Üçlü', referencePrice: 33_33n, minPrice: 30_00n });
      const linked = await addCard(db.appDb, 'TY', '1');
      const unlinked = await addCard(db.appDb, 'TY', '2');
      const cardLink = link(product, linked, { unitMultiplier: 3, isPrimary: true });
      await brandProductsRepo.linkCard(db.appDb, cardLink);

      const links = await brandProductsRepo.cardLinksForTrackedProducts(db.appDb, [linked, unlinked]);

      expect([...links.keys()]).toEqual([linked]);
      expect(links.get(linked)).toEqual({
        cardId: cardLink.id,
        brandProductId: product,
        brandProductName: 'Üçlü',
        unitMultiplier: 3,
        isPrimary: true,
        referencePrice: 33_33n,
        minPrice: 30_00n,
        maxPrice: null,
      });
    }, 30_000);

    /** doc 17 §2.5: a card has a PSF exactly when it is linked. */
    it('counts PSF coverage as linked cards', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const product = await addProduct(db.appDb);
      const a = await addCard(db.appDb, 'TY', 'a');
      await addCard(db.appDb, 'TY', 'b');
      await addCard(db.appDb, 'TY', 'c');
      await brandProductsRepo.linkCard(db.appDb, link(product, a));

      expect(await trackedProductsRepo.referencePriceCoverage(db.appDb)).toEqual({ withPrice: 1, total: 3 });
    }, 30_000);

    it('marks and unmarks a favourite, and tells the rotation which cards are linked', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const product = await addProduct(db.appDb);
      const fav = await addCard(db.appDb, 'TY', 'fav');
      const linked = await addCard(db.appDb, 'TY', 'linked');
      const plain = await addCard(db.appDb, 'TY', 'plain');
      await brandProductsRepo.linkCard(db.appDb, link(product, linked));

      await trackedProductsRepo.setTrackedProductFavourite(db.appDb, fav, true, NOW);
      expect(await trackedProductsRepo.getTrackedProduct(db.appDb, fav)).toMatchObject({
        isFavourite: true,
        favouritedAt: NOW,
      });

      const rows = await trackedProductsRepo.listProductsToScrape(db.appDb, {
        marketplaceCode: 'TY',
        notScrapedSinceMs: NOW + 1,
      });
      const byId = new Map(rows.map((r) => [r.id, { fav: r.isFavourite, linked: r.isLinked }]));
      expect(byId).toEqual(
        new Map([
          [fav, { fav: true, linked: false }],
          [linked, { fav: false, linked: true }],
          [plain, { fav: false, linked: false }],
        ]),
      );

      await trackedProductsRepo.setTrackedProductFavourite(db.appDb, fav, false, NOW + 1);
      expect(await trackedProductsRepo.getTrackedProduct(db.appDb, fav)).toMatchObject({
        isFavourite: false,
        favouritedAt: null,
      });
    }, 30_000);

    /**
     * The İlanlar set (doc 17 §4.1), the grid's half of what `SweepListedProducts` walks. Across
     * dialects because it is an `exists` subquery rather than a join — and because the `count()`
     * beside it is what a join would have broken: a product with two cards must be one row and
     * one in the total, not two.
     */
    it('lists only linked and favourite cards, counting a twice-linked product once', async () => {
      db = await createTestDb(dialect);
      await seedMarketplaces(db.appDb);
      const product = await addProduct(db.appDb);
      const linked = await addCard(db.appDb, 'TY', 'linked');
      const alsoLinked = await addCard(db.appDb, 'HB', 'also-linked');
      const fav = await addCard(db.appDb, 'TY', 'fav');
      await addCard(db.appDb, 'TY', 'plain');
      // One product, a card on each marketplace — the model's whole point (doc 17 §2).
      await brandProductsRepo.linkCard(db.appDb, link(product, linked));
      await brandProductsRepo.linkCard(db.appDb, link(product, alsoLinked));
      await trackedProductsRepo.setTrackedProductFavourite(db.appDb, fav, true, NOW);

      const listed = await trackedProductsRepo.queryTrackedProducts(db.appDb, {
        listedOnly: true,
        limit: 50,
        offset: 0,
      });

      expect(listed.total).toBe(3);
      expect(listed.rows.map((r) => r.id).sort()).toEqual([alsoLinked, fav, linked].sort());

      // Without the filter the plain card is back, so the filter is doing the work.
      const all = await trackedProductsRepo.queryTrackedProducts(db.appDb, { limit: 50, offset: 0 });
      expect(all.total).toBe(4);
    }, 30_000);
  });
}
