/**
 * Parsing a brand owner's price list into per-product reference prices (2026-09-03).
 *
 * ## Why this exists at all
 *
 * Every other price figure on the brand-audit screens is *measured*: piyasa sapması, makas and
 * the period band are all statements about whoever happened to be on the page when we looked.
 * They move with the window, with the sample and with a threshold someone chose, which is why
 * `audit-findings.ts` files them as `measured` and ranks them below anything an operator wrote
 * down. A recommended retail price is the missing `stated` half — the brand owner *published* a
 * number, and a seller under it is a fact about that published number rather than an
 * interpretation of a sample. It is the one price finding an auditor can act on directly.
 *
 * ## What it will not do
 *
 * **It never matches a product by name.** A row must carry a barcode, or a marketplace and that
 * marketplace's product ref. Names differ by punctuation, pack size and spelling between a
 * brand's own price list and a marketplace's catalogue, and a name match would attach a price
 * to the wrong article while looking like it worked — the same rule, for the same reason, that
 * `seller-policy-import.ts` applies to sellers (doc 05 §5).
 *
 * **It rejects the whole file rather than importing part of it.** A half-applied price list is
 * the worst of the three outcomes: the operator believes the list is in force, and the products
 * that failed are the ones that then produce no findings and are never looked at again.
 *
 * **It reads a Turkish decimal.** `1.249,90` and `1249.90` are the same price and both appear in
 * real files; a reader that took the first as `1.24` would silently under-price a whole
 * catalogue and make every product look violated. Parsing goes through an exact decimal string
 * into `Money` — never a float, never `parseFloat` (CLAUDE.md: money is bigint kuruş).
 */
import { Money } from '@buybox/shared';
import { parseCsvTable } from './csv-parse';

export interface ImportedReferencePriceRow {
  /** 1-based line in the file as the operator sees it in Excel, header included. */
  readonly line: number;
  readonly barcode: string | null;
  readonly marketplaceCode: string | null;
  readonly productRef: string | null;
  /** Kuruş. Exact — see the module header. */
  readonly referencePrice: bigint;
  /** Read for display only. Never used to match a product — see the module header. */
  readonly label: string | null;
}

export interface ReferencePriceImportError {
  readonly line: number;
  readonly message: string;
}

export type ReferencePriceImportResult =
  | { readonly ok: true; readonly rows: readonly ImportedReferencePriceRow[] }
  | { readonly ok: false; readonly errors: readonly ReferencePriceImportError[] };

/**
 * Header names accepted for each field, folded by `foldHeader`.
 *
 * Turkish and English both, and for the price several of the words a brand actually prints on a
 * price list: `tavsiye edilen satış fiyatı`, `TESF`, `liste fiyatı`, `MSRP`.
 */
const HEADERS = {
  barcode: ['barkod', 'barcode', 'ean', 'gtin'],
  marketplaceCode: ['pazaryeri', 'marketplace', 'marketplacecode'],
  productRef: ['urun kodu', 'urunkodu', 'urun no', 'productref', 'product ref', 'contentid', 'sku'],
  referencePrice: [
    'tavsiye edilen satis fiyati',
    'tavsiye edilen fiyat',
    'tavsiye fiyat',
    'tesf',
    'liste fiyati',
    'referans fiyat',
    'reference price',
    'list price',
    'msrp',
    'rrp',
    'fiyat',
  ],
  label: ['urun', 'urun adi', 'aciklama', 'product', 'name', 'label'],
} as const;

/**
 * A price as Excel wrote it → exact kuruş.
 *
 * The whole difficulty is that `.` and `,` swap roles by locale and both appear as *thousands*
 * separators too. The rule applied: whichever of the two occurs **last** is the decimal
 * separator, and every other occurrence of either is a grouping mark. That reads `1.249,90`,
 * `1,249.90`, `1249,90` and `1249.90` all as 1249.90, and it is decidable without knowing the
 * file's locale — which is the point, because the file does not say.
 *
 * One exception, and it is the one that would otherwise cost a catalogue two orders of
 * magnitude: exactly three digits after the only separator is a **thousands group**, not a
 * fraction. `1.249` is one thousand two hundred and forty-nine lira; read as a decimal it would
 * be 1.25 ₺ and every seller alive would violate it.
 *
 * A trailing currency word or symbol is stripped: `249,90 TL` is what a price list contains.
 * Anything still unparseable returns `null` — never a silent zero.
 */
export function parseTurkishDecimal(raw: string): bigint | null {
  const text = raw
    .trim()
    // A non-breaking space is what a copy out of a PDF price list leaves behind. Written as an
    // escape rather than the character itself: an invisible byte in a regex is a trap.
    .replace(/\u00a0/g, ' ')
    // Currency marks, not digits: `₺`, `TL`, `TRY`.
    .replace(/(₺|tl|try)\s*$/i, '')
    .replace(/[.,-]\s*$/, '')
    .trim();
  if (text === '') return null;
  if (!/^[0-9.,]+$/.test(text)) return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  const decimalAt = Math.max(lastDot, lastComma);

  let whole: string;
  let fraction: string;
  if (decimalAt === -1) {
    whole = text;
    fraction = '';
  } else {
    whole = text.slice(0, decimalAt);
    fraction = text.slice(decimalAt + 1);
    if (fraction.length === 3 && !/[.,]/.test(whole)) {
      whole = text;
      fraction = '';
    }
  }
  const digits = whole.replace(/[.,]/g, '');
  if (digits === '' || !/^\d+$/.test(digits)) return null;
  if (fraction !== '' && !/^\d{1,2}$/.test(fraction)) return null;

  try {
    return Money.fromMajorUnitsString(fraction === '' ? digits : `${digits}.${fraction}`).toKurus();
  } catch {
    return null;
  }
}

/**
 * Parses a whole price-list file.
 *
 * `defaultMarketplaceCode` fills rows that give a product ref with no marketplace column — the
 * common case when a brand exports "our Trendyol list". It is **not** applied to a barcode row:
 * a barcode is marketplace-independent by construction, and pinning one to a marketplace would
 * quietly halve the match rate on a cross-marketplace catalogue.
 */
export function parseReferencePriceCsv(
  text: string,
  defaultMarketplaceCode: string | null,
): ReferencePriceImportResult {
  const table = parseCsvTable(text);
  if (!table) return { ok: false, errors: [{ line: 1, message: 'Dosya boş.' }] };

  const columnOf = (field: keyof typeof HEADERS): number =>
    table.headers.findIndex((h) => (HEADERS[field] as readonly string[]).includes(h));

  const columns = {
    barcode: columnOf('barcode'),
    marketplaceCode: columnOf('marketplaceCode'),
    productRef: columnOf('productRef'),
    referencePrice: columnOf('referencePrice'),
    label: columnOf('label'),
  };

  if (columns.referencePrice === -1) {
    return {
      ok: false,
      errors: [
        {
          line: table.headerLine,
          message:
            'Dosyada fiyat sütunu yok. Kabul edilen başlıklar: tavsiye edilen satış fiyatı, liste fiyatı, referans fiyat, fiyat.',
        },
      ],
    };
  }
  if (columns.barcode === -1 && columns.productRef === -1) {
    return {
      ok: false,
      errors: [
        {
          line: table.headerLine,
          message:
            'Dosyada barkod veya ürün kodu sütunu yok. Ürünler isimle eşleştirilmez — en az birini ekleyin.',
        },
      ],
    };
  }

  const rows: ImportedReferencePriceRow[] = [];
  const errors: ReferencePriceImportError[] = [];

  for (const { line, fields } of table.rows) {
    const at = (index: number): string | null => (index === -1 ? null : fields[index]?.trim() || null);

    const barcode = at(columns.barcode);
    const productRef = at(columns.productRef);
    const label = at(columns.label);
    const marketplaceCode = at(columns.marketplaceCode) ?? defaultMarketplaceCode;

    if (barcode === null && productRef === null) {
      errors.push({
        line,
        message: label
          ? `"${label}" için barkod da ürün kodu da yok. İsimle eşleştirme yapılmaz.`
          : 'Barkod da ürün kodu da yok.',
      });
      continue;
    }
    // A product ref without a marketplace is not an identity: the same digits are different
    // products on different marketplaces. A barcode needs none.
    if (barcode === null && marketplaceCode === null) {
      errors.push({ line, message: `"${productRef}" için pazaryeri belirtilmemiş.` });
      continue;
    }

    const priceText = at(columns.referencePrice);
    if (priceText === null) {
      errors.push({ line, message: 'Fiyat boş.' });
      continue;
    }
    const referencePrice = parseTurkishDecimal(priceText);
    if (referencePrice === null) {
      errors.push({ line, message: `"${priceText}" bir fiyat değil.` });
      continue;
    }
    // Zero is not a cheap price, it is a missing one — and it would make every seller on the
    // product a violation of a price nobody set.
    if (referencePrice <= 0n) {
      errors.push({ line, message: `"${priceText}" sıfır veya negatif — referans fiyat olamaz.` });
      continue;
    }

    rows.push({
      line,
      barcode,
      // A row carrying both identities is matched by barcode: it is the one that means the same
      // product on every marketplace, and carrying the ref beside it would invite two matches.
      marketplaceCode: barcode !== null ? null : marketplaceCode,
      productRef: barcode !== null ? null : productRef,
      referencePrice,
      label,
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  if (rows.length === 0) {
    return { ok: false, errors: [{ line: table.headerLine, message: 'Dosyada hiç satır yok.' }] };
  }
  return { ok: true, rows };
}
