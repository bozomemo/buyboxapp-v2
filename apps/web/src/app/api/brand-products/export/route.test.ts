// @vitest-environment node
/**
 * Stok (marka) → _Mevcut ürünleri indir_.
 *
 * The file exists so a manager can fill in Birim Fiyat and Desi for the whole catalogue and load
 * it back. The import reads an empty cell as "clear this value", so the one property that matters
 * is the **round trip**: the exported file, uploaded unchanged, must match every product to itself
 * and change nothing. A file that dropped a min, a barcode or a link would silently erase it.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brandProductsRepo, configRepo, createDb, runMigrations, trackedProductsRepo, type AppDatabase } from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { POST as importPost } from '../import/route';
import { GET } from './route';

let dir: string;
let appDb: AppDatabase;
const savedEnv = { ...process.env };
let cookie: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-brand-export-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  migrating.close();
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  cookie = await signIn(appDb);
  for (const code of ['trendyol', 'hepsiburada']) {
    await configRepo.upsertMarketplace(appDb, {
      code,
      displayName: code,
      enabled: true,
      merchantRef: null,
      createdAt: 0,
      updatedAt: 0,
    });
  }
});

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

async function importCsv(csv: string, confirm: boolean) {
  const response = await importPost(
    withCookie(
      new Request('http://localhost/api/brand-products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: Buffer.from(csv, 'utf8').toString('base64'),
          fileName: 'liste.csv',
          confirm,
        }),
      }),
      cookie,
    ),
    routeContext(),
  );
  return (await response.json()) as {
    summary: { newProducts: number; updatedProducts: number; errorRows: number; cardsToCreate: number };
  };
}

async function exportCsv(): Promise<{ status: number; disposition: string | null; text: string }> {
  const response = await GET(withCookie(new Request('http://localhost/api/brand-products/export'), cookie), routeContext());
  return {
    status: response.status,
    disposition: response.headers.get('Content-Disposition'),
    text: await response.text(),
  };
}

/** Two products through the import, so the stored state is exactly what a manager would have. */
async function seed(): Promise<void> {
  await importCsv(
    '\uFEFF' +
      [
        'Ürün Adı;PSF;Min Fiyat;Max Fiyat;Trendyol Linki;Hepsiburada Linki;Barkod;Birim Fiyat;Desi',
        'Kedi Maması 2kg;1.249,90;1.000,00;1.300,00;https://www.trendyol.com/m/u-p-111;https://www.hepsiburada.com/u-p-HBC0001;8690000000001;980,50;4,5',
        'Ton Balıklı 85g;49,90;;;https://www.trendyol.com/m/u-p-222;;;;',
      ].join('\r\n'),
    true,
  );
}

describe('GET /api/brand-products/export', () => {
  it('writes every product in the import template, money and desi as the importer reads them', async () => {
    await seed();

    const { status, disposition, text } = await exportCsv();

    expect(status).toBe(200);
    expect(disposition).toContain('attachment');
    const lines = text.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines[0]).toBe('Ürün Adı;PSF;Min Fiyat;Max Fiyat;Trendyol Linki;Hepsiburada Linki;Barkod;Birim Fiyat;Desi');
    expect(lines).toContain(
      'Kedi Maması 2kg;1249,90;1000,00;1300,00;https://www.trendyol.com/m/u-p-111;https://www.hepsiburada.com/u-p-HBC0001;8690000000001;980,50;4,5',
    );
    expect(lines).toContain('Ton Balıklı 85g;49,90;;;https://www.trendyol.com/m/u-p-222;;;;');
  });

  it('uploaded back unchanged, it matches every product to itself and creates nothing', async () => {
    await seed();
    const before = await brandProductsRepo.queryBrandProducts(appDb, { limit: 50, offset: 0 });

    const { summary } = await importCsv((await exportCsv()).text, true);

    expect(summary).toMatchObject({ newProducts: 0, updatedProducts: 2, errorRows: 0, cardsToCreate: 0 });
    const after = await brandProductsRepo.queryBrandProducts(appDb, { limit: 50, offset: 0 });
    const fields = (rows: typeof before.rows) =>
      rows
        .map((r) => [r.name, r.referencePrice, r.minPrice, r.maxPrice, r.barcode, r.unitPrice, r.desi, r.cardCount])
        .sort();
    expect(fields(after.rows)).toEqual(fields(before.rows));
  });

  it('a card found by a catalogue sweep stores only a path: the file carries the full link', async () => {
    await seed();
    const product = (await brandProductsRepo.queryBrandProducts(appDb, { limit: 50, offset: 0 })).rows.find(
      (r) => r.name === 'Ton Balıklı 85g',
    )!;
    const [card] = await brandProductsRepo.listBrandProductCardDetails(appDb, product.id);
    const tracked = await trackedProductsRepo.getTrackedProduct(appDb, card!.trackedProductId);
    await trackedProductsRepo.deleteTrackedProduct(appDb, tracked!.id);
    await trackedProductsRepo.addTrackedProduct(appDb, { ...tracked!, productUrl: '/m/u-p-222' });
    await brandProductsRepo.linkCard(appDb, {
      id: 'relink',
      brandProductId: product.id,
      trackedProductId: tracked!.id,
      unitMultiplier: 1,
      isPrimary: true,
      linkSource: 'manual',
      linkedAt: 0,
    });

    expect((await exportCsv()).text).toContain('Ton Balıklı 85g;49,90;;;https://www.trendyol.com/m/u-p-222;');
  });

  it('no products: the header row alone', async () => {
    const { text } = await exportCsv();
    expect(text.replace(/^\uFEFF/, '').trim()).toBe(
      'Ürün Adı;PSF;Min Fiyat;Max Fiyat;Trendyol Linki;Hepsiburada Linki;Barkod;Birim Fiyat;Desi',
    );
  });
});
