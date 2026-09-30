/**
 * Stok (marka) → _Excel'den yükle_ (doc 17 §3).
 *
 * **Two steps, and the first writes nothing.** `POST` with `confirm: false` (the default) previews:
 * it answers with the counts and the table of problems. `POST` with `confirm: true` re-plans the
 * same file and writes the valid rows in one transaction. The file is sent twice rather than
 * parked on the server between the two: a plan cached server-side would be a promise about a
 * catalogue that may have changed by the time it is applied, and re-planning is cheap.
 *
 * `GET` downloads the template — the header row this importer reads, with one example row.
 */
import { NextResponse } from 'next/server';
import { TEMPLATE_HEADERS } from '@/lib/brand-product-import';
import { applyImport, planImport } from '@/lib/server/brand-import';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission } from '@/lib/server/auth/guard';

interface ImportBody {
  readonly fileBase64?: string;
  readonly fileName?: string;
  readonly confirm?: boolean;
}

/** One problem row, in the shape the screen's table and the error file both read. */
function problemRows(planned: Awaited<ReturnType<typeof planImport>>) {
  if (!planned.ok) return [];
  return planned.planned.plan.rows.flatMap((row) =>
    row.kind === 'error' ? [{ line: row.line, errors: row.errors }] : [],
  );
}

function warningRows(planned: Awaited<ReturnType<typeof planImport>>) {
  if (!planned.ok) return [];
  return planned.planned.plan.rows.flatMap((row) =>
    row.kind !== 'error' && row.warnings.length > 0
      ? [{ line: row.line, name: row.fields.name, warnings: row.warnings }]
      : [],
  );
}

async function postHandler(request: Request) {
  const body = await readJsonBody<ImportBody>(request);
  if (body === null) return invalidBody();
  if (!body.fileBase64) return NextResponse.json({ error: 'Dosya gerekli.' }, { status: 400 });

  const appDb = getAppDb();
  const planned = await planImport(appDb, {
    fileBase64: body.fileBase64,
    fileName: body.fileName ?? 'yukleme.xlsx',
  });
  // A file that cannot be read as a table at all is rejected outright — there are no rows to
  // preview, so there is nothing for the operator to fix row by row (doc 17 §3.5).
  if (!planned.ok) return NextResponse.json({ error: planned.error }, { status: 400 });

  const { plan, cardsToCreate } = planned.planned;
  const summary = {
    totalRows: plan.rows.length,
    newProducts: plan.newProducts,
    updatedProducts: plan.updatedProducts,
    cardsToCreate,
    linksToAttach: plan.linksToAttach,
    errorRows: plan.errorRows,
  };

  if (body.confirm !== true) {
    return NextResponse.json({
      ok: true,
      preview: true,
      summary,
      problems: problemRows(planned),
      warnings: warningRows(planned),
    });
  }

  const applied = await applyImport(appDb, planned.planned, Date.now());
  if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    preview: false,
    summary,
    applied: applied.applied,
    problems: problemRows(planned),
  });
}

function getHandler() {
  // Semicolons and a BOM: Turkish Excel's list separator is `;` on a comma-decimal locale, and
  // without the BOM Excel reads `Ürün Adı` as mojibake (`lib/csv.ts` makes the same two choices).
  const example = [
    'Ton Balıklı Kedi Maması 85g',
    '49,90',
    '39,90',
    '',
    'https://www.trendyol.com/marka/urun-p-750104',
    '',
    '8690000000001',
  ];
  const csv = '\uFEFF' + [TEMPLATE_HEADERS.join(';'), example.join(';')].join('\r\n') + '\r\n';
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': 'attachment; filename="stok-urun-sablonu.csv"',
    },
  });
}

export const POST = withPermission('catalogue.manage', postHandler);
export const GET = withPermission('view', getHandler);
