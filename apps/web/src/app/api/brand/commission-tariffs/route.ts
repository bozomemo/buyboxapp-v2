/**
 * Komisyon tarifesi (marka) — uploading the marketplace's tariff workbook (doc 17 §8.2).
 *
 * Two steps, like the brand product import: `POST` with `confirm: false` (the default) previews
 * and writes nothing — the counts, the periods as read (the workbook states them without a year,
 * so the operator confirms the dates), the problem rows, and how many of its products match a
 * brand product's barcode. `confirm: true` re-reads the same file and writes it in one transaction.
 *
 * `GET` lists the periods already loaded.
 */
import { NextResponse } from 'next/server';
import { tariffProductKey } from '@buybox/core';
import { brandProductsRepo, commissionTariffsRepo, newId } from '@buybox/db';
import { parseCommissionTariffFile } from '@/lib/commission-tariff-import';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission } from '@/lib/server/auth/guard';

/** Only Trendyol publishes this workbook today; the table is keyed by marketplace for the next one. */
const MARKETPLACE = 'trendyol';

interface TariffBody {
  readonly fileBase64?: string;
  readonly fileName?: string;
  readonly confirm?: boolean;
}

async function getHandler() {
  const periods = await commissionTariffsRepo.listTariffPeriods(getAppDb());
  return NextResponse.json({ periods, now: Date.now() });
}

async function postHandler(request: Request) {
  const body = await readJsonBody<TariffBody>(request);
  if (body === null) return invalidBody();
  if (!body.fileBase64) return NextResponse.json({ error: 'Dosya gerekli.' }, { status: 400 });

  const appDb = getAppDb();
  const nowMs = Date.now();
  const fileName = body.fileName ?? 'komisyon-tarifesi.xlsx';
  const parsed = await parseCommissionTariffFile({ fileBase64: body.fileBase64, fileName }, nowMs);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const productKeys = new Set(
    (await brandProductsRepo.listBrandProductBarcodes(appDb))
      .map((barcode) => tariffProductKey(barcode))
      .filter((key): key is string => key !== null),
  );
  const matchedLines = new Set(
    parsed.tariffs.filter((t) => productKeys.has(t.productKey)).map((t) => t.line),
  );

  const summary = {
    products: parsed.products,
    tariffs: parsed.tariffs.length,
    matchedProducts: matchedLines.size,
    problemRows: new Set(parsed.problems.map((problem) => problem.line)).size,
    periods: parsed.periods,
  };

  if (body.confirm !== true) {
    return NextResponse.json({ ok: true, preview: true, summary, problems: parsed.problems });
  }

  await commissionTariffsRepo.replaceTariffs(
    appDb,
    parsed.tariffs.map((tariff) => ({
      id: newId(),
      marketplaceCode: MARKETPLACE,
      productKey: tariff.productKey,
      barcode: tariff.barcode,
      sellerStockCode: tariff.sellerStockCode,
      validFrom: tariff.validFrom,
      validUntil: tariff.validUntil,
      tiers: tariff.tiers,
      sourceFile: fileName,
      importedAt: nowMs,
    })),
  );
  return NextResponse.json({ ok: true, preview: false, summary, problems: parsed.problems });
}

export const GET = withPermission('view', getHandler);
export const POST = withPermission('catalogue.manage', postHandler);
