/**
 * The Stok (marka) routes, against a real migrated database (doc 17 §2).
 *
 * The rules under test are the ones an operator can break by typing: a Turkish decimal read
 * exactly, a band that no price could satisfy refused, a coherent-but-odd band saved with a
 * warning, the multiplier asked for rather than assumed, and a card that already belongs to
 * another product refused by name.
 */
// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  brandProductsRepo,
  configRepo,
  createDb,
  newId,
  runMigrations,
  trackedProductsRepo,
  type AppDatabase,
} from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as getProducts, POST as createProduct } from './route';
import { GET as getProduct, PATCH as patchProduct } from './[id]/route';
import { POST as linkCard, PATCH as patchCard, DELETE as unlinkCard } from './[id]/cards/route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-brand-products-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  appDb = createDb(`file:${dbFile}`, 'sqlite');
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

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function addProduct(body: Record<string, unknown>) {
  const response = await createProduct(post('http://localhost/api/brand-products', body));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function addCard(ref: string): Promise<string> {
  const id = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode: 'trendyol',
    productRef: ref,
    productUrl: `https://www.trendyol.com/x/y-p-${ref}`,
    label: `Kart ${ref}`,
    isActive: true,
    addedAt: 0,
  });
  return id;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('POST /api/brand-products', () => {
  /** `1.249,90` is 124 990 kuruş. Read as a decimal `1.249` it would be 1,25 ₺ — three digits out. */
  it('reads a Turkish decimal exactly, into kuruş', async () => {
    const created = await addProduct({ name: 'Mama', referencePrice: '1.249,90' });
    expect(created.status).toBe(200);

    const detail = await (
      await getProduct(new Request('http://x'), params(created.body.id as string))
    ).json();
    expect(detail.product.referencePrice).toBe('124990');
  });

  it('refuses a band no price could ever satisfy', async () => {
    const created = await addProduct({ name: 'Olmaz', referencePrice: '10,00', minPrice: '20,00' });
    expect(created.status).toBe(400);
    expect(created.body.error).toContain('üst sınırın üstünde');
  });

  it('saves a coherent but odd band and says what is odd about it', async () => {
    const created = await addProduct({ name: 'Tuhaf', referencePrice: '30,00', maxPrice: '20,00' });
    expect(created.status).toBe(200);
    expect(created.body.warnings).toEqual(['PSF, max fiyatın üstünde.']);
  });

  it('requires a name and a PSF', async () => {
    expect((await addProduct({ referencePrice: '10,00' })).body.error).toBe('Ürün adı gerekli.');
    expect((await addProduct({ name: 'Adsız fiyat' })).body.error).toBe('PSF gerekli.');
  });

  it('lists products with the card count that says whether they are wired up', async () => {
    await addProduct({ name: 'Bağsız', referencePrice: '10,00' });
    const listed = await (await getProducts(new Request('http://localhost/api/brand-products'))).json();
    expect(listed.total).toBe(1);
    expect(listed.products[0]).toMatchObject({ cardCount: 0, upperBoundIsReferencePrice: true });
  });
});

describe('POST /api/brand-products/[id]/cards', () => {
  it('asks for the multiplier rather than assuming one', async () => {
    const product = (await addProduct({ name: 'Ürün', referencePrice: '49,90' })).body.id as string;
    const card = await addCard('1');

    const response = await linkCard(
      post('http://localhost/api/brand-products/x/cards', { trackedProductId: card }),
      params(product),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Adet çarpanı gerekli.');
  });

  it('scales the band to the card by multiplying, so a ×3 card is held to three units', async () => {
    const product = (await addProduct({ name: 'Üçlü', referencePrice: '33,33', minPrice: '30,00' })).body
      .id as string;
    const card = await addCard('3');
    await linkCard(post('http://x', { trackedProductId: card, unitMultiplier: 3 }), params(product));

    const detail = await (await getProduct(new Request('http://x'), params(product))).json();
    expect(detail.cards[0]).toMatchObject({
      unitMultiplier: 3,
      cardReferencePrice: '9999',
      cardMinPrice: '9000',
      cardUpperBound: '9999',
    });
  });

  it('refuses a card that belongs to another product, and names that product', async () => {
    const first = (await addProduct({ name: 'İlk ürün', referencePrice: '10,00' })).body.id as string;
    const second = (await addProduct({ name: 'İkinci ürün', referencePrice: '10,00' })).body.id as string;
    const card = await addCard('1');
    await linkCard(post('http://x', { trackedProductId: card, unitMultiplier: 1 }), params(first));

    const response = await linkCard(
      post('http://x', { trackedProductId: card, unitMultiplier: 1 }),
      params(second),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('İlk ürün');
  });

  /** doc 17 §2.4: the old primary stays linked as an ordinary card. */
  it('hands the primary over without unlinking the card that held it', async () => {
    const product = (await addProduct({ name: 'Ürün', referencePrice: '10,00' })).body.id as string;
    const older = await addCard('1');
    const newer = await addCard('2');
    await linkCard(
      post('http://x', { trackedProductId: older, unitMultiplier: 1, isPrimary: true }),
      params(product),
    );
    await linkCard(
      post('http://x', { trackedProductId: newer, unitMultiplier: 1, isPrimary: true }),
      params(product),
    );

    const detail = await (await getProduct(new Request('http://x'), params(product))).json();
    const byRef = new Map(
      detail.cards.map((c: { productRef: string; isPrimary: boolean }) => [c.productRef, c.isPrimary]),
    );
    expect(byRef.get('1')).toBe(false);
    expect(byRef.get('2')).toBe(true);
    expect(detail.cards).toHaveLength(2);
  });

  it('creates the tracked product for a pasted link that is not tracked yet', async () => {
    const product = (await addProduct({ name: 'Ürün', referencePrice: '10,00' })).body.id as string;

    const response = await linkCard(
      post('http://x', { link: 'https://www.trendyol.com/marka/urun-p-757251065', unitMultiplier: 1 }),
      params(product),
    );

    expect(response.status).toBe(200);
    const detail = await (await getProduct(new Request('http://x'), params(product))).json();
    expect(detail.cards[0].productRef).toBe('757251065');
    expect(await trackedProductsRepo.findTrackedProductByRef(appDb, 'trendyol', '757251065')).toBeDefined();
  });

  it('changes a multiplier and unlinks without deleting the tracked product', async () => {
    const product = (await addProduct({ name: 'Ürün', referencePrice: '10,00' })).body.id as string;
    const card = await addCard('1');
    const linked = await (
      await linkCard(post('http://x', { trackedProductId: card, unitMultiplier: 1 }), params(product))
    ).json();

    await patchCard(post('http://x', { cardId: linked.cardId, unitMultiplier: 4 }));
    let detail = await (await getProduct(new Request('http://x'), params(product))).json();
    expect(detail.cards[0].unitMultiplier).toBe(4);

    await unlinkCard(new Request(`http://x?cardId=${linked.cardId}`, { method: 'DELETE' }));
    detail = await (await getProduct(new Request('http://x'), params(product))).json();
    expect(detail.cards).toHaveLength(0);
    expect(await trackedProductsRepo.getTrackedProduct(appDb, card)).toBeDefined();
  });
});

describe('PATCH /api/brand-products/[id]', () => {
  const patch = (id: string, body: unknown) =>
    patchProduct(
      new Request('http://x', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      params(id),
    );

  /** Exactly what the edit form sends — it has no field for the PSF's source. */
  it('keeps every field the request leaves out, including the PSF source', async () => {
    const id = (
      await addProduct({
        name: 'Mama',
        referencePrice: '1.249,90',
        minPrice: '1.100,00',
        maxPrice: '1.300,50',
        barcode: '8690000000001',
        referencePriceSource: '2026 Eylül fiyat listesi',
      })
    ).body.id as string;

    expect((await patch(id, { name: 'Mama', referencePrice: '1.299,90', minPrice: '1.100,00', maxPrice: '1.300,50', barcode: '8690000000001' })).status).toBe(200);
    let detail = (await (await getProduct(new Request('http://x'), params(id))).json()).product;
    expect(detail.referencePrice).toBe('129990');
    expect(detail.referencePriceSource).toBe('2026 Eylül fiyat listesi');

    expect((await patch(id, { referencePrice: '1.199,90' })).status).toBe(200);
    detail = (await (await getProduct(new Request('http://x'), params(id))).json()).product;
    expect(detail).toMatchObject({
      name: 'Mama',
      referencePrice: '119990',
      minPrice: '110000',
      maxPrice: '130050',
      barcode: '8690000000001',
      referencePriceSource: '2026 Eylül fiyat listesi',
    });
  });

  it('clears a field only when it is sent empty', async () => {
    const id = (await addProduct({ name: 'Mama', referencePrice: '100', maxPrice: '120', barcode: '8690000000001' })).body.id as string;
    expect((await patch(id, { maxPrice: '', barcode: null })).status).toBe(200);
    const detail = (await (await getProduct(new Request('http://x'), params(id))).json()).product;
    expect(detail.maxPrice).toBeNull();
    expect(detail.barcode).toBeNull();
    expect(detail.referencePrice).toBe('10000');
  });
});

describe('barcode on a manually entered product (2026-09-25)', () => {
  it('refuses a scientific-notation barcode and warns on a non-GTIN one', async () => {
    const refused = await addProduct({ name: 'Mama', referencePrice: '10', barcode: '8.69E+12' });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain('bilimsel');

    const warned = await addProduct({ name: 'Mama', referencePrice: '10', barcode: 'ÖZEL-17' });
    expect(warned.status).toBe(200);
    expect(warned.body.warnings).toEqual(['Barkod geçerli bir EAN/GTIN değil; pazaryeri kartlarıyla eşleşmez.']);
  });

  it('does not block a price edit on a product already stored with one', async () => {
    const id = newId();
    await brandProductsRepo.insertBrandProduct(appDb, {
      id,
      name: 'Eski',
      referencePrice: 100_00n,
      minPrice: null,
      maxPrice: null,
      barcode: '8.69E+12',
      referencePriceSource: null,
      source: 'excel',
      createdAt: 0,
      updatedAt: 0,
    });
    const res = await patchProduct(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Eski', referencePrice: '110', minPrice: '', maxPrice: '', barcode: '8.69E+12' }),
      }),
      params(id),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { warnings: string[] }).warnings[0]).toContain('bilimsel');
  });
});

describe('POST /api/brand-products/[id]/cards — links as this app shows them (2026-09-25)', () => {
  const link = async (product: string, text: string) => {
    const res = await linkCard(post('http://x', { link: text, unitMultiplier: 1 }), params(product));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it('reads the host-less Trendyol path a tracked product is displayed with', async () => {
    const product = (await addProduct({ name: 'Ürün', referencePrice: '10,00' })).body.id as string;
    const card = await addCard('1092756157');
    const res = await link(product, '/orijen/acana-kitten-p-1092756157?boutiqueId=61&merchantId=1114093');
    expect(res.status).toBe(200);
    const detail = await (await getProduct(new Request('http://x'), params(product))).json();
    expect(detail.cards[0].trackedProductId).toBe(card);
  });

  it('resolves a Hepsiburada -pm- link to the one tracked variant, and explains when it cannot', async () => {
    await configRepo.upsertMarketplace(appDb, {
      code: 'hepsiburada',
      displayName: 'Hepsiburada',
      enabled: true,
      merchantRef: null,
      createdAt: 0,
      updatedAt: 0,
    });
    const variant = newId();
    await trackedProductsRepo.addTrackedProduct(appDb, {
      id: variant,
      marketplaceCode: 'hepsiburada',
      productRef: 'HBCV00002GD91J',
      productUrl: '/orijen-kitten-pm-HBC00002GD91I',
      label: 'Orijen Kitten',
      isActive: true,
      addedAt: 0,
    });
    const product = (await addProduct({ name: 'Ürün', referencePrice: '10,00' })).body.id as string;

    expect((await link(product, 'https://www.hepsiburada.com/orijen-kitten-pm-HBC00002GD91I')).status).toBe(200);
    const detail = await (await getProduct(new Request('http://x'), params(product))).json();
    expect(detail.cards[0].trackedProductId).toBe(variant);

    const unknown = await link(product, 'https://www.hepsiburada.com/baska-pm-HBC99999ZZZZZ');
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toContain('ürün ailesini');
  });
});

describe('ceilings on what is typed (2026-09-25)', () => {
  it('answers an absurd price with 400, not a 500 from the database layer', async () => {
    const res = await addProduct({ name: 'Mama', referencePrice: '99999999999999999999' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('çok büyük');
  });

  it('refuses a card multiplier above 1000', async () => {
    const product = (await addProduct({ name: 'Ürün', referencePrice: '10,00' })).body.id as string;
    const card = await addCard('42');
    const res = await linkCard(post('http://x', { trackedProductId: card, unitMultiplier: 1_000_000 }), params(product));
    expect(res.status).toBe(400);
    expect((await linkCard(post('http://x', { trackedProductId: card, unitMultiplier: 1000 }), params(product))).status).toBe(200);
  });
});
