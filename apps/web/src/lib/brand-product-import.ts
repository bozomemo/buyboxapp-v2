/**
 * Reading a brand manager's product file into rows the planner can judge (doc 17 §3.1–§3.2).
 *
 * This module does the three things the pure planner must not: it reads a file, it folds header
 * names, and it turns cells into amounts and marketplace refs. Everything after that — which
 * product a row updates, what is an error and what is a warning — is `planBrandProductImport` in
 * `packages/core`, so the rules have one home and this has none of them.
 *
 * Amounts go through `parseTurkishDecimal`, the same exact parser the price-list import uses:
 * `1.249,90` and `1249.90` both read as 124 990 kuruş, and three digits after the only separator
 * are a **thousands group** rather than a fraction. No amount is ever a float.
 */
import { parseProductLinkForMarketplace } from '@buybox/adapters';
import type { AmountCell, ImportMarketplace, ImportRowInput, LinkCell } from '@buybox/core';
import { foldHeader, parseCsvTable } from './csv-parse';
import { parseTurkishDecimal } from './reference-price-import';

/** Accepted header names per column, folded by `foldHeader` (doc 17 §3.1). */
const HEADERS = {
  name: ['urun adi', 'urun', 'ad', 'isim', 'product', 'product name', 'name'],
  referencePrice: ['psf', 'tavsiye edilen satis fiyati', 'tavsiye fiyat', 'liste fiyati', 'reference price'],
  maxPrice: ['max fiyat', 'maksimum fiyat', 'ust fiyat', 'max price', 'max'],
  minPrice: ['min fiyat', 'minimum fiyat', 'alt fiyat', 'min price', 'min'],
  trendyolLink: ['trendyol linki', 'trendyol link', 'trendyol url', 'trendyol'],
  hepsiburadaLink: ['hepsiburada linki', 'hepsiburada link', 'hepsiburada url', 'hepsiburada', 'hb linki'],
  barcode: ['barkod', 'barcode', 'ean', 'gtin'],
} as const;

export type ImportColumn = keyof typeof HEADERS;

/** The template the screen offers, and the header row every example in doc 17 §3.1 describes. */
export const TEMPLATE_HEADERS = [
  'Ürün Adı',
  'PSF',
  'Min Fiyat',
  'Max Fiyat',
  'Trendyol Linki',
  'Hepsiburada Linki',
  'Barkod',
] as const;

export interface BrandImportFile {
  /** The workbook or CSV, base64-encoded, as the browser uploaded it. */
  readonly fileBase64: string;
  readonly fileName: string;
}

export type BrandImportParse =
  | { readonly ok: true; readonly rows: readonly ImportRowInput[]; readonly headerLine: number }
  /** The file could not be read as a table at all — there are no rows to preview (doc 17 §3.5). */
  | { readonly ok: false; readonly error: string };

interface Table {
  readonly headerLine: number;
  readonly headers: readonly string[];
  readonly rows: readonly { readonly line: number; readonly fields: readonly string[] }[];
}

function amountCell(text: string): AmountCell {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  const parsed = parseTurkishDecimal(trimmed);
  return parsed === null ? { kind: 'invalid', text: trimmed } : { kind: 'amount', value: parsed };
}

function linkCell(text: string, marketplace: ImportMarketplace): LinkCell {
  const parsed = parseProductLinkForMarketplace(text, marketplace);
  if (parsed.ok) return { kind: 'ref', contentId: parsed.contentId, url: parsed.url };
  switch (parsed.problem) {
    case 'empty':
      return { kind: 'empty' };
    case 'wrongMarketplace':
      return { kind: 'wrongMarketplace' };
    case 'parentProduct':
      return parsed.parentRef === undefined
        ? { kind: 'parentProduct' }
        : { kind: 'parentProduct', parentRef: parsed.parentRef };
    default:
      return { kind: 'unrecognised' };
  }
}

/** Reads the uploaded file into a table, whichever of the two formats it is. */
export async function readBrandImportTable(file: BrandImportFile): Promise<Table | { error: string }> {
  const isCsv = /\.csv$/i.test(file.fileName.trim());
  if (isCsv) {
    // The BOM our own exports write, and Excel's Turkish semicolons, are handled by `parseCsvTable`.
    const text = Buffer.from(file.fileBase64, 'base64').toString('utf8');
    const table = parseCsvTable(text);
    if (!table) return { error: 'Dosya boş.' };
    return { headerLine: table.headerLine, headers: table.headers, rows: table.rows };
  }

  // Imported here rather than at module scope: `exceljs` is a server-side dependency, and this
  // module's pure half is also read by the column-name documentation on the screen.
  const { readXlsxTable } = await import('@buybox/adapters');
  const table = await readXlsxTable(file.fileBase64);
  if (!table) return { error: 'Çalışma sayfası okunamadı ya da boş.' };
  return { headerLine: table.headerLine, headers: table.headers.map(foldHeader), rows: table.rows };
}

/**
 * Turns the uploaded file into planner rows.
 *
 * A file whose header names no product column and no PSF column is refused **outright** rather
 * than reported row by row: there is nothing to preview, and one message about the header is a
 * better answer than three thousand identical ones about the rows (doc 17 §3.5).
 */
export async function parseBrandImportFile(file: BrandImportFile): Promise<BrandImportParse> {
  const table = await readBrandImportTable(file);
  if ('error' in table) return { ok: false, error: table.error };

  const folded = table.headers.map((header) => foldHeader(header));
  const columnOf = (column: ImportColumn): number =>
    folded.findIndex((header) => (HEADERS[column] as readonly string[]).includes(header));

  const columns = {
    name: columnOf('name'),
    referencePrice: columnOf('referencePrice'),
    minPrice: columnOf('minPrice'),
    maxPrice: columnOf('maxPrice'),
    trendyolLink: columnOf('trendyolLink'),
    hepsiburadaLink: columnOf('hepsiburadaLink'),
    barcode: columnOf('barcode'),
  };

  if (columns.name === -1 || columns.referencePrice === -1) {
    return {
      ok: false,
      error:
        `Başlık satırında (${table.headerLine}. satır) gerekli sütunlar bulunamadı. ` +
        `Beklenen: ${TEMPLATE_HEADERS.join(', ')}. ` +
        'Başlıklar dosyanın ilk dolu satırında olmalı — üstte başlık/açıklama satırı varsa silin. ' +
        'Şablonu indirip kullanabilirsiniz.',
    };
  }
  if (columns.trendyolLink === -1 && columns.hepsiburadaLink === -1) {
    return {
      ok: false,
      error:
        'Dosyada link sütunu yok. En az bir tanesi gerekli: "Trendyol Linki" ya da "Hepsiburada Linki". ' +
        'Bir ürün, bağlı olduğu pazaryeri kartı olmadan izlenemez.',
    };
  }

  const at = (fields: readonly string[], index: number): string =>
    index === -1 ? '' : (fields[index] ?? '').toString();

  const rows = table.rows.map((row) => ({
    line: row.line,
    name: at(row.fields, columns.name).trim(),
    referencePrice: amountCell(at(row.fields, columns.referencePrice)),
    minPrice: amountCell(at(row.fields, columns.minPrice)),
    maxPrice: amountCell(at(row.fields, columns.maxPrice)),
    trendyolLink: linkCell(at(row.fields, columns.trendyolLink), 'trendyol'),
    hepsiburadaLink: linkCell(at(row.fields, columns.hepsiburadaLink), 'hepsiburada'),
    barcode: at(row.fields, columns.barcode).trim(),
  }));

  return { ok: true, rows, headerLine: table.headerLine };
}
