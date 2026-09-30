// @vitest-environment node
/**
 * The Excel import end to end, against a real migrated database (doc 17 §3).
 *
 * The cases are the ones that cost money if they go wrong: a Turkish decimal read exactly, a
 * re-import matching on the primary card instead of creating a second product, an empty cell
 * clearing a min while an empty *link* column changes nothing, and a file with bad rows in it
 * importing the good ones and no more.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  brandProductsRepo,
  configRepo,
  createDb,
  runMigrations,
  trackedProductsRepo,
  type AppDatabase,
} from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { GET, POST } from './route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };

/** Signed in as a Yönetici: these tests are about the route, the guard has its own (doc 18 §7.2). */
let cookie: string;
const authedRequest = (input: string, init?: RequestInit): Request => withCookie(new Request(input, init), cookie);

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-brand-import-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  cookie = await signIn(appDb);
  // Only Trendyol, so the "marketplace this install does not know" case below is real rather than
  // simulated. The tests that need Hepsiburada add it themselves.
  await addMarketplace('trendyol');
});

async function addMarketplace(code: string): Promise<void> {
  await configRepo.upsertMarketplace(appDb, {
    code,
    displayName: code,
    enabled: true,
    merchantRef: null,
    createdAt: 0,
    updatedAt: 0,
  });
}

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

const HEADER = 'Ürün Adı;PSF;Min Fiyat;Max Fiyat;Trendyol Linki;Hepsiburada Linki;Barkod';
const tyLink = (id: string) => `https://www.trendyol.com/marka/urun-p-${id}`;

function csvFile(...lines: string[]): { fileBase64: string; fileName: string } {
  return {
    fileBase64: Buffer.from(['\uFEFF' + HEADER, ...lines].join('\r\n'), 'utf8').toString('base64'),
    fileName: 'liste.csv',
  };
}

async function post(body: Record<string, unknown>) {
  const response = await POST(
    authedRequest('http://localhost/api/brand-products/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }), routeContext()
  );
  return { status: response.status, body: (await response.json()) as Record<string, never> };
}

async function importCsv(...lines: string[]) {
  return post({ ...csvFile(...lines), confirm: true });
}

async function products() {
  const { rows } = await brandProductsRepo.queryBrandProducts(appDb, { limit: 100, offset: 0 });
  return rows;
}

describe('POST /api/brand-products/import — preview', () => {
  it('writes nothing and says what the file would do', async () => {
    const preview = await post(csvFile(`Mama;49,90;;;${tyLink('1')};;`));

    expect(preview.body).toMatchObject({
      preview: true,
      summary: { totalRows: 1, newProducts: 1, updatedProducts: 0, cardsToCreate: 1, errorRows: 0 },
    });
    expect(await products()).toHaveLength(0);
  });

  it('refuses a file whose header names no product column at all', async () => {
    const response = await post({
      fileBase64: Buffer.from('bir;iki;üç\n1;2;3', 'utf8').toString('base64'),
      fileName: 'yanlis.csv',
    });
    expect(response.status).toBe(400);
    expect(String(response.body.error)).toContain('gerekli sütunlar bulunamadı');
  });

  it('reads an .xlsx workbook, cells as text', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ürünler');
    sheet.addRow(['Ürün Adı', 'PSF', 'Min Fiyat', 'Max Fiyat', 'Trendyol Linki']);
    sheet.addRow(['Mama', '1.249,90', '', '', tyLink('7')]);
    const buffer = await workbook.xlsx.writeBuffer();

    const result = await post({
      fileBase64: Buffer.from(buffer).toString('base64'),
      fileName: 'liste.xlsx',
      confirm: true,
    });

    expect(result.body).toMatchObject({ applied: { newProducts: 1 } });
    // 1.249,90 — three digits after the separator are a thousands group, not a fraction.
    expect((await products())[0]).toMatchObject({ referencePrice: 124990n });
  });
});

describe('POST /api/brand-products/import — applying', () => {
  it('creates the product, the card and the ×1 primary link', async () => {
    await importCsv(`Mama;49,90;39,90;;${tyLink('750104')};;8690000000001`);

    const [product] = await products();
    expect(product).toMatchObject({
      name: 'Mama',
      referencePrice: 49_90n,
      minPrice: 39_90n,
      maxPrice: null,
      barcode: '8690000000001',
      source: 'excel',
      cardCount: 1,
    });
    const [card] = await brandProductsRepo.listBrandProductCardDetails(appDb, product!.id);
    expect(card).toMatchObject({
      productRef: '750104',
      unitMultiplier: 1,
      isPrimary: true,
      linkSource: 'excel',
    });
  });

  /** doc 17 §3.3: the primary card is the key — a re-import updates, it does not duplicate. */
  it('updates the product its primary card names, on a second run', async () => {
    await importCsv(`Mama;49,90;39,90;;${tyLink('750104')};;`);
    await importCsv(`Mama Yeni Ad;59,90;;;${tyLink('750104')};;`);

    const all = await products();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      name: 'Mama Yeni Ad',
      referencePrice: 59_90n,
      // §3.4: an empty cell clears. The min the first run set is gone.
      minPrice: null,
      cardCount: 1,
    });
  });

  it('adds the other marketplace’s card to the product the Trendyol link matched', async () => {
    await addMarketplace('hepsiburada');
    await importCsv(`Mama;49,90;;;${tyLink('750104')};;`);
    await importCsv(`Mama;49,90;;;${tyLink('750104')};https://www.hepsiburada.com/x-p-HBCV1;`);

    const [product] = await products();
    expect(product!.cardCount).toBe(2);
    expect(product!.marketplaceCodes).toEqual(['hepsiburada', 'trendyol']);
  });

  /** §3.4: a link column is how a row is matched, not a field — an empty one changes nothing. */
  it('leaves a linked card alone when the file omits its link', async () => {
    await addMarketplace('hepsiburada');
    await importCsv(`Mama;49,90;;;${tyLink('750104')};https://www.hepsiburada.com/x-p-HBCV1;`);
    await importCsv(`Mama;44,90;;;${tyLink('750104')};;`);

    const [product] = await products();
    expect(product).toMatchObject({ referencePrice: 44_90n, cardCount: 2 });
  });

  it('reuses a card the install already tracks instead of duplicating it', async () => {
    const existing = await trackedProductsRepo.findTrackedProductByRef(appDb, 'trendyol', '750104');
    expect(existing).toBeUndefined();
    await importCsv(`Mama;49,90;;;${tyLink('750104')};;`);
    const created = await trackedProductsRepo.findTrackedProductByRef(appDb, 'trendyol', '750104');

    await importCsv(`Başka Ürün;19,90;;;${tyLink('750104')};;`); // same card, now a primary elsewhere

    const stillOne = await trackedProductsRepo.findTrackedProductByRef(appDb, 'trendyol', '750104');
    expect(stillOne?.id).toBe(created?.id);
  });

  /** The reason the confirmation step exists: the good rows land, the bad ones are reported. */
  it('imports the valid rows and skips the rest, in one go', async () => {
    const result = await importCsv(
      `İyi 1;49,90;;;${tyLink('1')};;`,
      `Adsız;10,00;;;${tyLink('2')};;`.replace('Adsız', ''),
      `Linksiz;10,00;;;;;`,
      `İyi 2;10,00;;;${tyLink('3')};;`,
    );

    expect(result.body).toMatchObject({
      applied: { newProducts: 2, skippedRows: 2, linkedCards: 2, createdCards: 2 },
    });
    expect(await products()).toHaveLength(2);
  });

  /**
   * `tracked_products.marketplace_code` is a foreign key, so a row naming a marketplace this
   * install has never enabled would fail the transaction. It is refused as a **row**, in the
   * preview as well as the write — so the operator sees it before pressing, and the rest of the
   * file still imports.
   */
  it('skips a row naming a marketplace this install does not know, and imports the rest', async () => {
    const preview = await post(
      csvFile(`Mama;49,90;;;;https://www.hepsiburada.com/x-p-HBCV1;`, `İyi;10,00;;;${tyLink('9')};;`),
    );
    const problems = preview.body.problems as unknown as { line: number; errors: { code: string }[] }[];
    expect(problems.map((problem) => problem.errors[0]!.code)).toEqual(['marketplaceNotConfigured']);

    const result = await post({
      ...csvFile(`Mama;49,90;;;;https://www.hepsiburada.com/x-p-HBCV1;`, `İyi;10,00;;;${tyLink('9')};;`),
      confirm: true,
    });

    expect(result.body).toMatchObject({ applied: { newProducts: 1, skippedRows: 1 } });
    expect(await products()).toHaveLength(1);
    expect(await trackedProductsRepo.findTrackedProductByRef(appDb, 'hepsiburada', 'HBCV1')).toBeUndefined();
  });

  it('reports the problems with each bad row, by line and column', async () => {
    const preview = await post(csvFile(`;abc;;;https://example.com/x;;`));

    const problems = preview.body.problems as unknown as { line: number; errors: { code: string }[] }[];
    expect(problems).toHaveLength(1);
    expect(problems[0]!.line).toBe(2);
    expect(problems[0]!.errors.map((error) => error.code)).toEqual([
      'missingName',
      'unparseableReferencePrice',
      'linkUnrecognised',
    ]);
  });
});

describe('GET /api/brand-products/import', () => {
  it('offers a template with the headers this importer reads', async () => {
    const response = await GET(authedRequest('http://localhost/'), routeContext());
    const text = await response.text();

    expect(response.headers.get('Content-Disposition')).toContain('stok-urun-sablonu.csv');
    expect(text).toContain('Ürün Adı;PSF;Min Fiyat;Max Fiyat;Trendyol Linki;Hepsiburada Linki;Barkod');
    // A BOM and semicolons, so Turkish Excel opens it as a table rather than one column. Checked
    // in bytes: `Response.text()` decodes as UTF-8, and a UTF-8 decoder strips a leading BOM.
    const bytes = new Uint8Array(await (await GET(authedRequest('http://localhost/'), routeContext())).arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });
});

describe('POST /api/brand-products/import — Hepsiburada -pm- links (2026-09-25)', () => {
  const PM = '/orijen-kitten-yavru-kedi-mamasi-1-8-kg-pm-HBC00002GD91I';

  async function trackVariant(ref: string): Promise<void> {
    await trackedProductsRepo.addTrackedProduct(appDb, {
      id: `tp-${ref}`,
      marketplaceCode: 'hepsiburada',
      productRef: ref,
      productUrl: PM,
      label: ref,
      isActive: true,
      addedAt: 0,
    });
  }

  it('links the one tracked variant a -pm- link copied from our own screen stands for', async () => {
    await addMarketplace('hepsiburada');
    await trackVariant('HBCV00002GD91J');

    const result = await importCsv(`Orijen Kitten;1.899,90;;;;https://www.hepsiburada.com${PM};`);

    expect(result.body).toMatchObject({ summary: { errorRows: 0, newProducts: 1, cardsToCreate: 0 } });
    const [product] = await products();
    const detail = await brandProductsRepo.listBrandProductCardDetails(appDb, product!.id);
    expect(detail.map((card) => card.productRef)).toEqual(['HBCV00002GD91J']);
  });

  it('still refuses it when several tracked variants share the family', async () => {
    await addMarketplace('hepsiburada');
    await trackVariant('HBCV00002GD91J');
    await trackVariant('HBCV00002GD91K');

    const preview = await post(csvFile(`Orijen Kitten;1.899,90;;;;${PM};`));

    expect(preview.body).toMatchObject({ summary: { errorRows: 1 } });
    expect(JSON.stringify(preview.body)).toContain('linkParentProduct');
  });
});
