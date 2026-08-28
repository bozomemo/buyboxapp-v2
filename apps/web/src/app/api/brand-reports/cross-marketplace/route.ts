/**
 * The same product on two marketplaces (doc 06 §12.5, Faz 8).
 *
 * Returns the barcode-joined matches **and** the coverage figures that say how much of each
 * catalogue could take part. The two are one response on purpose: a list of 40 matches over a
 * 564-product brand is a very different fact from 40 matches over 40 products, and a screen that
 * had to ask twice would eventually show the first without the second.
 *
 * ⚠️ There is no name matching here and there is none anywhere behind it. A brand owner acts on
 * these rows — it is how they see the same article priced differently on two marketplaces — and
 * a confidently wrong row is worse than an absent one. Products whose barcode is unknown are
 * counted in `coverage.pending`, never guessed into a match.
 */
import { NextResponse } from 'next/server';
import { productBarcodesRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const left = params.get('left') ?? 'trendyol';
  const right = params.get('right') ?? 'hepsiburada';
  const limit = Math.min(Number(params.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT);

  const appDb = getAppDb();
  const [matches, leftCoverage, rightCoverage] = await Promise.all([
    productBarcodesRepo.crossMarketplaceMatches(appDb, left, right, limit),
    productBarcodesRepo.barcodeCoverage(appDb, left),
    productBarcodesRepo.barcodeCoverage(appDb, right),
  ]);

  return NextResponse.json({
    left: { marketplaceCode: left, coverage: leftCoverage },
    right: { marketplaceCode: right, coverage: rightCoverage },
    matches,
    // Whether the list was cut off, so the screen can say so rather than implying this is all.
    truncated: matches.length >= limit,
  });
}
