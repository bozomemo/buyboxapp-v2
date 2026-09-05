/**
 * The brand's own price list, applied to the tracked catalogue (2026-09-03).
 *
 * A brand owner's recommended-price list exists as a spreadsheet, the same way an
 * authorised-distributor list does, so this route is the price-side twin of
 * `api/seller-policies/import`: parsing is pure and table-tested in
 * `lib/reference-price-import.ts`, and the route does the two things parsing cannot — it writes,
 * and it reports what the write actually reached.
 *
 * **All or nothing on parsing, partial by nature on matching, and the two are different.** A
 * malformed file writes nothing at all, with every bad line reported at once. A well-formed file
 * whose lines name products this install does not track writes the ones it can and *says how
 * many it could not* — that is not an error, it is the normal shape of a brand list against one
 * marketplace's catalogue, and hiding it would leave the operator believing a list is in force
 * over products it never touched.
 */
import { NextResponse } from 'next/server';
import { trackedProductsRepo } from '@buybox/db';
import { parseReferencePriceCsv } from '@/lib/reference-price-import';
import { getAppDb } from '@/lib/server/db';

interface ImportBody {
  readonly csv: string;
  /** Fills rows that give a product ref with no marketplace column. Never applied to a barcode. */
  readonly defaultMarketplaceCode?: string | null;
  /** The file name, kept beside the price so "where did this number come from" has an answer. */
  readonly source?: string | null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ImportBody;

  const parsed = parseReferencePriceCsv(body.csv ?? '', body.defaultMarketplaceCode ?? null);
  if (!parsed.ok) {
    return NextResponse.json({ errors: parsed.errors }, { status: 400 });
  }

  const result = await trackedProductsRepo.applyReferencePrices(
    getAppDb(),
    parsed.rows.map((row) => ({
      barcode: row.barcode,
      marketplaceCode: row.marketplaceCode,
      productRef: row.productRef,
      referencePrice: row.referencePrice,
    })),
    body.source?.trim() || null,
    Date.now(),
  );

  return NextResponse.json({
    ok: true,
    linesRead: parsed.rows.length,
    productsMatched: result.productsMatched,
    linesUnmatched: result.linesUnmatched,
  });
}

/**
 * Withdraws the list price from named products — the operator saying "we have not published one
 * for this", which is a different statement from correcting the number.
 */
export async function DELETE(request: Request) {
  const body = (await request.json()) as { readonly ids?: readonly string[] };
  const ids = body.ids ?? [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Silinecek ürün seçilmedi.' }, { status: 400 });
  }
  await trackedProductsRepo.clearReferencePrices(getAppDb(), ids);
  return NextResponse.json({ ok: true, cleared: ids.length });
}

/** Coverage, which is what makes "hiçbir ürün listenin altında değil" mean anything. */
export async function GET(request: Request) {
  const watchedBrandId = new URL(request.url).searchParams.get('watchedBrandId') ?? undefined;
  const coverage = await trackedProductsRepo.referencePriceCoverage(getAppDb(), watchedBrandId);
  return NextResponse.json(coverage);
}
