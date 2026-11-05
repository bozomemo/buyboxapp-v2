// @vitest-environment node
/**
 * İlanlar (doc 17 §4.1) against a real migrated database.
 *
 * The cases are the ones that decide what an operator believes: who is on the list at all, that
 * a ×6 card is judged against six times the band rather than a divided price, that an unlinked
 * favourite is shown without a verdict it cannot have, and that a card nobody could read is
 * "bilinmiyor" rather than a breach.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  brandProductsRepo,
  commissionTariffsRepo,
  configRepo,
  createDb,
  newId,
  runMigrations,
  trackedProductsRepo,
  type AppDatabase,
} from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { saveSellerProfitSettings } from '@/lib/server/seller-profit-settings';
import { GET } from './route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };
const NOW = 1_750_000_000_000;

/** Signed in as a Yönetici: these tests are about the route, the guard has its own (doc 18 §7.2). */
let cookie: string;
const authedRequest = (input: string, init?: RequestInit): Request => withCookie(new Request(input, init), cookie);

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-brand-listings-'));
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

interface ListingResponse {
  total: number;
  listings: {
    id: string;
    label: string;
    isFavourite: boolean;
    bandStatus: string;
    buyboxPrice: string | null;
    buyboxPriceSource: string | null;
    unitPrice: string | null;
    referencePrice: string | null;
    minPrice: string | null;
    upperBound: string | null;
    upperBoundIsReferencePrice: boolean;
    sellerCount: number;
    brandProduct: { name: string; unitMultiplier: number } | null;
    profit: { commissionRate: number; profit: string; breakEvenPrice: string | null; cost: string } | null;
    profitMissing: string | null;
  }[];
}

async function listings(query = ''): Promise<ListingResponse> {
  const response = await GET(authedRequest(`http://localhost/api/brand/listings${query}`), routeContext());
  return (await response.json()) as ListingResponse;
}

async function addCard(id: string): Promise<void> {
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode: 'trendyol',
    productRef: id,
    productUrl: `https://www.trendyol.com/x-p-${id}`,
    label: id,
    isActive: true,
    addedAt: NOW,
  });
}

/** Links `cardId` to a new brand product with the given per-unit band. */
async function linkTo(
  cardId: string,
  name: string,
  prices: { referencePrice: bigint; minPrice?: bigint | null; maxPrice?: bigint | null },
  unitMultiplier = 1,
  extras: { barcode?: string; unitPrice?: bigint; desi?: number } = {},
): Promise<void> {
  const brandProductId = `bp-${cardId}`;
  await brandProductsRepo.insertBrandProduct(appDb, {
    id: brandProductId,
    name,
    referencePrice: prices.referencePrice,
    minPrice: prices.minPrice ?? null,
    maxPrice: prices.maxPrice ?? null,
    barcode: extras.barcode ?? null,
    referencePriceSource: null,
    unitPrice: extras.unitPrice ?? null,
    desi: extras.desi ?? null,
    source: 'manual',
    createdAt: NOW,
    updatedAt: NOW,
  });
  const linked = await brandProductsRepo.linkCard(appDb, {
    id: `card-${cardId}`,
    brandProductId,
    trackedProductId: cardId,
    unitMultiplier,
    isPrimary: true,
    linkSource: 'manual',
    linkedAt: NOW,
  });
  if (!linked.ok) throw new Error(`link failed: ${linked.reason}`);
}

/** One look at a card: the rank-1 offer plus however many others. */
async function look(
  cardId: string,
  offers: readonly { rank: number; seller: string; price: bigint | null; finalPrice?: bigint | null }[],
  status: 'ok' | 'fetchFailed' = 'ok',
): Promise<void> {
  await trackedProductsRepo.recordTrackedProductLook(appDb, {
    trackedProductId: cardId,
    observedAt: NOW,
    offersHash: status === 'ok' ? `hash-${cardId}-${offers.length}` : null,
    rows: offers.map((offer) => ({
      id: newId(),
      trackedProductId: cardId,
      observedAt: NOW,
      status,
      rank: offer.rank,
      sellerName: offer.seller,
      sellerRef: offer.seller,
      price: offer.price,
      finalPrice: offer.finalPrice ?? null,
      offeredStock: null,
    })),
  });
}

describe('GET /api/brand/listings — who is on the list', () => {
  it('lists linked cards and favourites, and nothing else', async () => {
    await addCard('linked');
    await addCard('starred');
    await addCard('noise');
    await linkTo('linked', 'Mama', { referencePrice: 100_00n });
    await trackedProductsRepo.setTrackedProductFavourite(appDb, 'starred', true, NOW);

    const body = await listings();

    expect(body.total).toBe(2);
    expect(body.listings.map((row) => row.id).sort()).toEqual(['linked', 'starred']);
  });

  /**
   * The two halves are independent (doc 17 §4.1): a favourite need not be the manager's own
   * product. It is listed, and its band columns are empty rather than carrying a verdict it has
   * no PSF to support.
   */
  it('shows an unlinked favourite with no band and no verdict', async () => {
    await addCard('starred');
    await trackedProductsRepo.setTrackedProductFavourite(appDb, 'starred', true, NOW);
    await look('starred', [{ rank: 1, seller: 'Rakip', price: 50_00n }]);

    const [row] = (await listings()).listings;

    expect(row).toMatchObject({
      isFavourite: true,
      brandProduct: null,
      referencePrice: null,
      minPrice: null,
      upperBound: null,
      unitPrice: null,
      bandStatus: 'unknown',
    });
    // The market is still reported — it is the card's own price, it just is not judged.
    expect(row!.buyboxPrice).toBe('5000');
    expect(row!.sellerCount).toBe(1);
  });

  it('keeps a card that is both linked and starred on the list once', async () => {
    await addCard('both');
    await linkTo('both', 'Mama', { referencePrice: 100_00n });
    await trackedProductsRepo.setTrackedProductFavourite(appDb, 'both', true, NOW);

    const body = await listings();

    expect(body.total).toBe(1);
    expect(body.listings).toHaveLength(1);
  });

  it('drops a card whose link was removed, unless it is starred', async () => {
    await addCard('unlinked-later');
    await linkTo('unlinked-later', 'Mama', { referencePrice: 100_00n });
    const cards = await brandProductsRepo.cardsOfProducts(appDb, ['bp-unlinked-later']);
    await brandProductsRepo.unlinkCard(appDb, cards.get('bp-unlinked-later')![0]!.id);

    expect((await listings()).total).toBe(0);
  });
});

describe('GET /api/brand/listings — the verdict', () => {
  it('judges a ×6 card against six times the band, in kuruş', async () => {
    await addCard('six');
    await linkTo('six', 'Mama 6lı', { referencePrice: 49_90n, minPrice: 39_90n }, 6);
    await look('six', [{ rank: 1, seller: 'Bayi', price: 299_40n }]);

    const [row] = (await listings()).listings;

    expect(row).toMatchObject({
      bandStatus: 'inBand',
      buyboxPrice: '29940',
      // Display only: the card price divided by six, rounded.
      unitPrice: '4990',
      // The band itself stays per unit, so it reads beside the unit price.
      referencePrice: '4990',
      minPrice: '3990',
      upperBound: '4990',
      upperBoundIsReferencePrice: true,
    });
    expect(row!.brandProduct).toMatchObject({ name: 'Mama 6lı', unitMultiplier: 6 });
  });

  /**
   * The case `unitPriceForDisplay`'s doc comment warns about: one kuruş above six times the PSF
   * rounds to exactly the PSF per unit. The verdict must come from the multiplied threshold, so
   * the row reads "49,90 birim fiyat" and still says _max üstünde_.
   */
  it('catches a breach the rounded unit price hides', async () => {
    await addCard('edge');
    await linkTo('edge', 'Mama 6lı', { referencePrice: 49_90n }, 6);
    await look('edge', [{ rank: 1, seller: 'Bayi', price: 299_41n }]);

    const [row] = (await listings()).listings;

    expect(row).toMatchObject({ unitPrice: '4990', bandStatus: 'aboveMax' });
  });

  it('judges the coupon price when there is one, and says which it used', async () => {
    await addCard('coupon');
    await linkTo('coupon', 'Mama', { referencePrice: 100_00n, minPrice: 80_00n });
    await look('coupon', [{ rank: 1, seller: 'Bayi', price: 95_00n, finalPrice: 79_99n }]);

    const [row] = (await listings()).listings;

    expect(row).toMatchObject({
      bandStatus: 'belowMin',
      buyboxPrice: '7999',
      buyboxPriceSource: 'finalPrice',
    });
  });

  it('judges the buybox holder, not the cheapest seller', async () => {
    await addCard('ranked');
    await linkTo('ranked', 'Mama', { referencePrice: 100_00n, minPrice: 80_00n });
    await look('ranked', [
      { rank: 1, seller: 'Buybox', price: 90_00n },
      { rank: 2, seller: 'Ucuzcu', price: 70_00n },
    ]);

    const [row] = (await listings()).listings;

    // The rank-2 seller is under the floor; the buybox is not, so the card is in band. Who
    // undercuts is the audit findings' question (doc 06 §12.4), not this screen's.
    expect(row).toMatchObject({ bandStatus: 'inBand', buyboxPrice: '9000', sellerCount: 2 });
  });

  it('reports a card nobody has looked at as unknown, never as a breach', async () => {
    await addCard('unseen');
    await linkTo('unseen', 'Mama', { referencePrice: 100_00n, minPrice: 80_00n });

    const [row] = (await listings()).listings;

    expect(row).toMatchObject({ bandStatus: 'unknown', buyboxPrice: null, sellerCount: 0 });
  });

  it('reports a failed look as unknown', async () => {
    await addCard('unreadable');
    await linkTo('unreadable', 'Mama', { referencePrice: 100_00n, minPrice: 80_00n });
    await look('unreadable', [{ rank: 1, seller: 'Bayi', price: null }], 'fetchFailed');

    const [row] = (await listings()).listings;

    expect(row).toMatchObject({ bandStatus: 'unknown', buyboxPrice: null });
  });
});

describe('GET /api/brand/listings — reseller profit estimate (doc 17 §8)', () => {
  // The product owner's sample: Acana Indoor Entree 4,5 Kg. Unit price 3.000 ₺, desi 7 → cargo
  // 100 ₺ + operation 50 ₺, fixed fee 12,50 ₺.
  const ACANA_TIERS = [
    { minPrice: 426660n, maxPrice: null, rate: 16.5 },
    { minPrice: 361360n, maxPrice: 426659n, rate: 6.2 },
    { minPrice: 313565n, maxPrice: 361359n, rate: 2.8 },
    { minPrice: null, maxPrice: 313564n, rate: 2.7 },
  ];
  const DAY = 86_400_000;

  async function saveSettings(): Promise<void> {
    await saveSellerProfitSettings(
      appDb,
      {
        fixedSaleFee: '1250',
        desiBands: [
          { maxDesi: 5, cargo: '8000', operation: '3000' },
          { maxDesi: null, cargo: '10000', operation: '5000' },
        ],
      },
      'test',
      NOW,
    );
  }

  /** The route picks the tariff in force at the real clock, so the period is built around it. */
  async function loadTariff(productKey: string, validUntil = Date.now() + DAY): Promise<void> {
    await commissionTariffsRepo.replaceTariffs(appDb, [
      {
        id: newId(),
        marketplaceCode: 'trendyol',
        productKey,
        barcode: `0${productKey}`,
        sellerStockCode: null,
        validFrom: Date.now() - DAY,
        validUntil,
        tiers: ACANA_TIERS,
        sourceFile: 'tarife.xlsx',
        importedAt: NOW,
      },
    ]);
  }

  async function acanaCard(id: string, unitMultiplier = 1): Promise<void> {
    await addCard(id);
    await linkTo(id, 'Acana Indoor Entree 4,5 Kg', { referencePrice: 6000_00n }, unitMultiplier, {
      barcode: '064992714512',
      unitPrice: 3000_00n,
      desi: 7,
    });
  }

  it('estimates the buybox holder\'s profit from the shelf price, matching the tariff by folded barcode', async () => {
    await saveSettings();
    // Stored without the leading zero, as Excel leaves a barcode typed as a number.
    await loadTariff('64992714512');
    await acanaCard('acana');
    // A coupon below the shelf price: the band judges the coupon, the estimate the shelf price.
    await look('acana', [{ rank: 1, seller: 'Bayi', price: 5000_00n, finalPrice: 4800_00n }]);

    const [row] = (await listings()).listings;

    expect(row!.buyboxPriceSource).toBe('finalPrice');
    expect(row!.profitMissing).toBeNull();
    // 5.000 − 825 (16,5 %) − 100 − 50 − 12,50 − 3.000 = 1.012,50
    expect(row!.profit).toMatchObject({
      commissionRate: 16.5,
      profit: '101250',
      cost: '300000',
      breakEvenPrice: '325361',
    });
  });

  it('picks the tier the price falls in — one kuruş under the 16,5 % limit is the 6,2 % tier', async () => {
    await saveSettings();
    await loadTariff('64992714512');
    await acanaCard('edge');
    await look('edge', [{ rank: 1, seller: 'Bayi', price: 4266_59n }]);

    const [row] = (await listings()).listings;

    expect(row!.profit).toMatchObject({ commissionRate: 6.2, profit: '83956' });
  });

  it.each([
    ['noSettings', async () => loadTariff('64992714512')],
    ['noTariff', async () => saveSettings()],
    [
      'noTariff',
      async () => {
        await saveSettings();
        await loadTariff('64992714512', Date.now() - 1);
      },
    ],
  ] as const)('says %s rather than estimating', async (missing, setUp) => {
    await setUp();
    await acanaCard('missing');
    await look('missing', [{ rank: 1, seller: 'Bayi', price: 5000_00n }]);

    const [row] = (await listings()).listings;

    expect(row).toMatchObject({ profit: null, profitMissing: missing });
  });

  it('does not estimate a pack card, whose price no single-product tariff covers', async () => {
    await saveSettings();
    await loadTariff('64992714512');
    await acanaCard('pack', 2);
    await look('pack', [{ rank: 1, seller: 'Bayi', price: 10000_00n }]);

    const [row] = (await listings()).listings;

    expect(row).toMatchObject({ profit: null, profitMissing: 'packCard' });
  });

  it('says there is no buybox price on a card nobody has read, and nothing on an unlinked favourite', async () => {
    await saveSettings();
    await acanaCard('unseen');
    await addCard('starred');
    await trackedProductsRepo.setTrackedProductFavourite(appDb, 'starred', true, NOW);
    await look('starred', [{ rank: 1, seller: 'Rakip', price: 50_00n }]);

    const rows = (await listings()).listings;

    expect(rows.find((row) => row.id === 'unseen')).toMatchObject({ profit: null, profitMissing: 'noBuyboxPrice' });
    expect(rows.find((row) => row.id === 'starred')).toMatchObject({ profit: null, profitMissing: null });
  });

  it('exports the estimate', async () => {
    await saveSettings();
    await loadTariff('64992714512');
    await acanaCard('exported');
    await look('exported', [{ rank: 1, seller: 'Bayi', price: 5000_00n }]);

    const text = await (await GET(authedRequest('http://localhost/api/brand/listings?format=csv'), routeContext())).text();

    expect(text).toContain('Tahmini Kâr');
    expect(text).toContain('"1012,50"');
    expect(text).toContain('"3253,61"');
  });
});

describe('GET /api/brand/listings — export', () => {
  it('exports the filtered list as a spreadsheet Turkish Excel reads', async () => {
    await addCard('exported');
    await linkTo('exported', 'Mama 6lı', { referencePrice: 49_90n }, 6);
    await look('exported', [{ rank: 1, seller: 'Bayi', price: 299_40n }]);

    const response = await GET(authedRequest('http://localhost/api/brand/listings?format=csv'), routeContext());
    const text = await response.text();

    expect(response.headers.get('Content-Disposition')).toContain('ilanlar.csv');
    expect(text).toContain('Buybox Fiyat');
    // Comma decimals and the Turkish verdict, so the file reads like the screen.
    expect(text).toContain('"299,40"');
    expect(text).toContain('"Aralıkta"');
    // A BOM, checked in bytes: `Response.text()` decodes UTF-8 and strips a leading BOM.
    const bytes = new Uint8Array(
      await (await GET(authedRequest('http://localhost/api/brand/listings?format=csv'), routeContext())).arrayBuffer(),
    );
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
