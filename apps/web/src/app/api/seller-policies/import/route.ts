/**
 * Bulk seller policy from a spreadsheet (doc 06 §12.4, Faz 5).
 *
 * A brand owner's authorised-distributor list exists as a spreadsheet — that is how these lists
 * live in the world — so the alternative to reading one is an operator retyping forty rows into
 * a form, which is how a feature goes unused.
 *
 * Parsing is pure and table-tested in `lib/seller-policy-import.ts`. This route does the two
 * things parsing cannot: it resolves the scope, and it writes.
 *
 * **All or nothing.** The file is parsed completely before a single row is written, and a parse
 * error writes nothing. A half-applied policy list is worse than none — the operator believes
 * the list is in force, and the rows that failed are exactly the ones nobody looks at again.
 */
import { NextResponse } from 'next/server';
import { newId, sellerPoliciesRepo, watchedBrandsRepo } from '@buybox/db';
import { parseSellerPolicyCsv, type ImportedStatus } from '@/lib/seller-policy-import';
import { getAppDb } from '@/lib/server/db';

interface ImportBody {
  readonly watchedBrandId: string;
  readonly applyToWholeGroup?: boolean;
  /** Status for rows whose file carries no status column. */
  readonly defaultStatus: ImportedStatus;
  readonly csv: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ImportBody;
  const appDb = getAppDb();

  if (body.defaultStatus !== 'authorised' && body.defaultStatus !== 'blocked') {
    return NextResponse.json({ error: 'Geçersiz varsayılan durum.' }, { status: 400 });
  }

  const brands = await watchedBrandsRepo.listWatchedBrands(appDb);
  const brand = brands.find((b) => b.id === body.watchedBrandId);
  if (!brand) {
    return NextResponse.json({ error: 'İzlenen marka bulunamadı.' }, { status: 404 });
  }

  const parsed = parseSellerPolicyCsv(body.csv ?? '', body.defaultStatus);
  if (!parsed.ok) {
    // 400 with every bad line at once, so one pass over the spreadsheet fixes all of them.
    return NextResponse.json({ errors: parsed.errors }, { status: 400 });
  }

  const nowMs = Date.now();
  const watchedBrandId = body.applyToWholeGroup ? null : brand.id;

  let created = 0;
  let replaced = 0;
  for (const row of parsed.rows) {
    const result = await sellerPoliciesRepo.upsertSellerPolicy(appDb, {
      id: newId(),
      watchedBrandGroupId: brand.groupId,
      watchedBrandId,
      identity:
        row.sellerRef !== null && row.marketplaceCode !== null
          ? { marketplaceCode: row.marketplaceCode, sellerRef: row.sellerRef }
          : { taxNumber: row.taxNumber! },
      status: row.status,
      // The file's note, or none. Never a generated one like "imported on 28/08": a note is the
      // operator's own words about why, and filling it with a fact they can already see would
      // make the column stop being read.
      note: row.note,
      nowMs,
    });
    if (result.created) created += 1;
    else replaced += 1;
  }

  return NextResponse.json({
    ok: true,
    created,
    // Reported separately, because "40 rows imported" reads as 40 new decisions when 38 of them
    // re-stated what was already there — and the two rows that changed are the interesting ones.
    replaced,
    total: parsed.rows.length,
  });
}
