/**
 * Stok (marka) → _Mevcut ürünleri indir_: every product, in the import template (doc 17 §3.1).
 *
 * The point of the file is to be uploaded back. The import reads an empty cell as "clear this
 * value", so a manager who wants to add Birim Fiyat and Desi to two hundred products needs every
 * other column already filled with what is stored — otherwise the upload erases mins, maxes and
 * barcodes. Hence the shape is the template's, column for column, and the values are written the
 * way the importer reads them:
 *
 * - money as a Turkish decimal with no thousands separator (`1249,90`), divided as `bigint`;
 * - desi with a decimal comma (`4,5`);
 * - each marketplace's **primary** card as an absolute link, because that is what the importer
 *   matches a row to an existing product by. A card found by a catalogue sweep stores only its
 *   path, and a bare path would not match.
 *
 * Semicolons and a BOM, like the template: Turkish Excel's list separator is `;`, and without the
 * BOM `Ürün Adı` opens as mojibake.
 */
import { NextResponse } from 'next/server';
import { brandProductsRepo } from '@buybox/db';
import { TEMPLATE_HEADERS } from '@/lib/brand-product-import';
import { formatDesi } from '@/lib/desi';
import { kurusToDecimal } from '@/lib/format';
import { marketplaceProductUrl } from '@/lib/product-url';
import { getAppDb } from '@/lib/server/db';
import { withPermission } from '@/lib/server/auth/guard';

const PAGE = 500;

function money(kurus: bigint | null): string {
  return kurusToDecimal(kurus).replace('.', ',');
}

/** Quoted only when it has to be, so an ordinary row reads exactly like the template's. */
function cell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function getHandler() {
  const appDb = getAppDb();
  const products: brandProductsRepo.BrandProductListRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { rows, total } = await brandProductsRepo.queryBrandProducts(appDb, { limit: PAGE, offset });
    products.push(...rows);
    if (rows.length === 0 || offset + PAGE >= total) break;
  }

  const links = new Map<string, string>();
  for (const link of await brandProductsRepo.primaryCardLinks(
    appDb,
    products.map((p) => p.id),
  )) {
    const url = marketplaceProductUrl(link.marketplaceCode, link.productUrl);
    if (url !== null) links.set(`${link.brandProductId}::${link.marketplaceCode}`, url);
  }

  const lines = [TEMPLATE_HEADERS.join(';')];
  for (const p of products) {
    lines.push(
      [
        p.name,
        money(p.referencePrice),
        money(p.minPrice),
        money(p.maxPrice),
        links.get(`${p.id}::trendyol`) ?? '',
        links.get(`${p.id}::hepsiburada`) ?? '',
        p.barcode ?? '',
        money(p.unitPrice),
        formatDesi(p.desi),
      ]
        .map(cell)
        .join(';'),
    );
  }

  const csv = '\uFEFF' + lines.join('\r\n') + '\r\n';
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': 'attachment; filename="stok-urunleri.csv"',
    },
  });
}

export const GET = withPermission('view', getHandler);
