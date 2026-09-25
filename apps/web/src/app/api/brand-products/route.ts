/**
 * The brand manager's own products — Stok (marka), doc 17 §2, doc 06 §12.5.
 *
 * Money is `bigint` kuruş everywhere below the wire; amounts arrive as decimal strings and are
 * parsed by the same exact parser the price-list import uses (`parseTurkishDecimal`), never
 * `parseFloat` — "1.249,90" is 124.990 kuruş and reading it as 1,25 ₺ would misprice a catalogue
 * by three digits. They leave as kuruş strings, which is how every other route on this app
 * serialises money.
 *
 * Validation of the band itself (min above the effective upper bound, a non-positive amount, PSF
 * outside the manager's own band) is `checkBrandProductPrices` in `packages/core`: the same rule
 * the Excel import will apply, in one place, so a row typed here and a row imported cannot be
 * judged differently.
 */
import { NextResponse } from 'next/server';
import {
  checkBrandProductPrices,
  classifyBarcode,
  type BrandPriceError,
  type BrandPriceWarning,
} from '@buybox/core';
import { brandProductsRepo, newId } from '@buybox/db';
import { parseTurkishDecimal } from '@/lib/reference-price-import';
import { getAppDb } from '@/lib/server/db';
import { pageLimit, pageOffset } from '@/lib/pagination';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export interface BrandProductBody {
  readonly name?: string;
  /** Decimal major units as typed, e.g. "1.249,90" or "1249.90". Required. */
  readonly referencePrice?: string;
  readonly minPrice?: string | null;
  readonly maxPrice?: string | null;
  readonly barcode?: string | null;
  readonly referencePriceSource?: string | null;
}

const PRICE_ERRORS: Record<BrandPriceError, string> = {
  nonPositive: 'Fiyatlar sıfırdan büyük olmalı.',
  tooLarge: 'Fiyat çok büyük — en fazla 100.000.000 ₺ girilebilir.',
  minAboveUpper: 'Min fiyat, üst sınırın üstünde olamaz — hiçbir fiyat aralıkta kalmaz.',
};

const BARCODE_SCIENTIFIC =
  'Barkod bilimsel gösterimde (ör. 8.69E+12) — Excel rakamları yuvarlamış. Barkodu tam haliyle yazın.';

const PRICE_WARNINGS: Record<BrandPriceWarning, string> = {
  referenceBelowMin: 'PSF, min fiyatın altında.',
  referenceAboveMax: 'PSF, max fiyatın üstünde.',
};

export interface ParsedFields {
  readonly fields: {
    name: string;
    referencePrice: bigint;
    minPrice: bigint | null;
    maxPrice: bigint | null;
    barcode: string | null;
    referencePriceSource: string | null;
  };
  readonly warnings: string[];
}

/**
 * `string` is the error to answer with; anything else is the row to write.
 *
 * `storedBarcode` is the barcode already on the row being edited. A scientific-notation barcode
 * is refused only when it is being *entered*: one already stored (the import accepted them until
 * 2026-09-25) must not block an unrelated price edit — it is warned about instead.
 */
export function parseBrandProductBody(
  body: BrandProductBody,
  storedBarcode: string | null = null,
): ParsedFields | string {
  const name = (body.name ?? '').trim();
  if (name === '') return 'Ürün adı gerekli.';
  if (name.length > 255) return 'Ürün adı en fazla 255 karakter olabilir.';

  const amount = (raw: string | null | undefined): bigint | null | 'invalid' => {
    const text = (raw ?? '').trim();
    if (text === '') return null;
    const parsed = parseTurkishDecimal(text);
    return parsed === null ? 'invalid' : parsed;
  };

  const referencePrice = amount(body.referencePrice);
  if (referencePrice === 'invalid') return 'PSF okunamadı.';
  if (referencePrice === null) return 'PSF gerekli.';
  const minPrice = amount(body.minPrice);
  if (minPrice === 'invalid') return 'Min fiyat okunamadı.';
  const maxPrice = amount(body.maxPrice);
  if (maxPrice === 'invalid') return 'Max fiyat okunamadı.';

  const check = checkBrandProductPrices({ referencePrice, minPrice, maxPrice });
  if (check.errors.length > 0) return PRICE_ERRORS[check.errors[0]!];

  const barcode = (body.barcode ?? '').trim() || null;
  const barcodeWarnings: string[] = [];
  if (barcode !== null) {
    const kind = classifyBarcode(barcode);
    if (kind === 'scientific' && barcode !== storedBarcode) return BARCODE_SCIENTIFIC;
    if (kind === 'scientific') barcodeWarnings.push(BARCODE_SCIENTIFIC);
    if (kind === 'other')
      barcodeWarnings.push('Barkod geçerli bir EAN/GTIN değil; pazaryeri kartlarıyla eşleşmez.');
  }

  return {
    fields: {
      name,
      referencePrice,
      minPrice,
      maxPrice,
      barcode,
      referencePriceSource: (body.referencePriceSource ?? '').trim() || null,
    },
    warnings: [...check.warnings.map((warning) => PRICE_WARNINGS[warning]), ...barcodeWarnings],
  };
}

export function serialiseBrandProduct(row: brandProductsRepo.BrandProductListRow) {
  return {
    id: row.id,
    name: row.name,
    referencePrice: row.referencePrice.toString(),
    minPrice: row.minPrice?.toString() ?? null,
    maxPrice: row.maxPrice?.toString() ?? null,
    // The effective upper bound is derived, never stored (doc 17 §2.3) — and the screen marks it
    // _PSF_ when it is standing in for an unset max, so it needs to be told which it is.
    upperBound: (row.maxPrice ?? row.referencePrice).toString(),
    upperBoundIsReferencePrice: row.maxPrice === null,
    barcode: row.barcode,
    source: row.source,
    referencePriceSource: row.referencePriceSource,
    cardCount: row.cardCount,
    marketplaceCodes: row.marketplaceCodes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const limit = pageLimit(params.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = pageOffset(params.get('offset'));
  const { rows, total } = await brandProductsRepo.queryBrandProducts(getAppDb(), {
    text: params.get('text') ?? undefined,
    unlinkedOnly: params.get('unlinkedOnly') === 'true',
    limit,
    offset,
  });
  return NextResponse.json({ total, limit, offset, products: rows.map(serialiseBrandProduct) });
}

export async function POST(request: Request) {
  const body = await readJsonBody<BrandProductBody>(request);
  if (body === null) return invalidBody();
  const parsed = parseBrandProductBody(body);
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });

  const now = Date.now();
  const id = newId();
  await brandProductsRepo.insertBrandProduct(getAppDb(), {
    id,
    ...parsed.fields,
    // Typed on the screen. `excel` is the import's (doc 17 §3), `migration` the old per-card
    // price's (§2.5) — the three stay distinguishable because they answer different questions
    // about where a number came from.
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json({ ok: true, id, warnings: parsed.warnings });
}
