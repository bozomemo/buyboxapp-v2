/**
 * The listings grid's server-paged, server-filtered feed (doc 06 §4, R-UI-4/R-UI-5, doc 12
 * 6.6). Query params are parsed structurally into `ListingQueryOptions` — never string-built
 * SQL (doc 09 §20).
 */
import { NextResponse } from 'next/server';
import { effectiveCommissionRate, floorPrice } from '@buybox/core';
import { catalogRepo, competitionRepo, configRepo, listingsRepo, stockRepo } from '@buybox/db';
import { mapFeeSettings } from '@buybox/jobs';
import { Money } from '@buybox/shared';
import { withBrand } from '@/lib/product-name';
import { getAppDb } from '@/lib/server/db';

type RepricingPhase = listingsRepo.RepricingPhase;

/**
 * Per-row enrichment (Dip Fiyat, Buybox Fiyatı, Sıra, Fark, Mağaza Adı — doc 06 §4.1) is
 * computed only for the current page, not the whole catalogue: fee settings are fetched once
 * per marketplace on the page, stock cost and the latest buybox observation once per row.
 * Bounded by page size (≤200, default 50), this stays cheap regardless of catalogue size —
 * the server-paging that makes the 50,000-row DoD hold also bounds this enrichment's cost.
 *
 * `buyboxSellerName` is sourced from `competitor_observations` (reporting only), separately
 * from `rank`/`buyboxPrice` which come from `buybox_observations` (the pricing-path signal) —
 * see `competitionRepo.latestBuyboxSellerName`. It is display data next to those columns and
 * feeds no decision.
 */
async function enrichRow(
  appDb: ReturnType<typeof getAppDb>,
  row: Awaited<ReturnType<typeof listingsRepo.queryListings>>['rows'][number],
  feesByMarketplace: Map<string, Awaited<ReturnType<typeof configRepo.getEffectiveFeeSettings>>>,
) {
  const [stockItem, buybox, buyboxSellerName] = await Promise.all([
    row.baseStockCode ? stockRepo.getStockItem(appDb, row.baseStockCode) : undefined,
    competitionRepo.latestBuyboxObservation(appDb, row.id),
    competitionRepo.latestBuyboxSellerName(appDb, row.id),
  ]);
  const feeRow = feesByMarketplace.get(row.marketplaceCode);

  let floor: bigint | null = null;
  if (stockItem && feeRow) {
    const fees = mapFeeSettings(feeRow);
    const commissionRate = effectiveCommissionRate(row.commissionRate ?? feeRow.defaultCommissionRate, fees);
    const result = floorPrice({
      unitCost: Money.fromKurus(stockItem.unitCost),
      vatRate: row.vatRate ?? 20, // doc 02: fallback to standard Turkish VAT when the listing carries none yet
      effectiveCommissionRate: commissionRate,
      campaign: null,
      fees,
    });
    if (result.ok) floor = result.value.toKurus();
  }

  return {
    floorPrice: floor?.toString() ?? null,
    buyboxPrice: buybox?.buyboxPrice?.toString() ?? null,
    secondPrice: buybox?.secondPrice?.toString() ?? null,
    thirdPrice: buybox?.thirdPrice?.toString() ?? null,
    rank: buybox?.rank ?? null,
    buyboxSellerName: buyboxSellerName ?? null,
  };
}

function parseTriState(value: string | null): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/** Row cap for `?format=csv` — see the comment on that branch in {@link GET}. */
const CSV_EXPORT_LIMIT = 5000;

function csvEscape(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const appDb = getAppDb();
  const format = params.get('format');

  const phasesParam = params.get('phases');
  const filterOptions = {
    marketplaceCode: params.get('marketplaceCode') ?? undefined,
    phases: phasesParam ? (phasesParam.split(',') as RepricingPhase[]) : undefined,
    text: params.get('text') ?? undefined,
    brandId: params.get('brandId') ?? undefined,
    excludeArchived: true,
    sort: (params.get('sort') as 'lastSeenAt' | 'productName' | 'price' | null) ?? 'lastSeenAt',
    sortDir: (params.get('sortDir') as 'asc' | 'desc' | null) ?? 'desc',
    isSalable: parseTriState(params.get('isSalable')),
    isLocked: parseTriState(params.get('isLocked')),
    isSuspended: parseTriState(params.get('isSuspended')),
    isBlacklisted: parseTriState(params.get('isBlacklisted')),
    repriceEnabled: parseTriState(params.get('repriceEnabled')),
    observationEnabled: parseTriState(params.get('observationEnabled')),
  };

  if (format === 'csv') {
    // Excel export (doc 06 §4, customer feedback 2026-08-25) skips the per-row Dip
    // Fiyat/Buybox/Mağaza enrichment `enrichRow` does below: that enrichment issues three
    // queries per row and is deliberately bounded to one page's worth (≤200 rows) by the
    // comment above `enrichRow`. Running it over a bulk export would multiply that by up to
    // `CSV_EXPORT_LIMIT` rows fired concurrently — exactly the unbounded-fan-out cost R-UI-5's
    // server-paging exists to avoid. The export is the raw catalogue columns only; the
    // competitive fields stay a paged, on-screen-only view.
    const { rows: csvRows } = await listingsRepo.queryListings(appDb, {
      ...filterOptions,
      limit: CSV_EXPORT_LIMIT,
      offset: 0,
    });
    const headers = [
      'Pazaryeri',
      'Marketplace SKU',
      'Stok Kodu',
      'Ürün Adı',
      'Satış Fiyatı',
      'Satış Stok',
      'Faz',
      'Oto BB',
      'Gözlem',
      'Satılabilir',
      'Kilitli',
    ];
    const csvBrands = await catalogRepo.brandNamesByListingIds(
      appDb,
      csvRows.map((r) => r.id),
    );
    const lines = [headers.join(',')];
    for (const r of csvRows) {
      lines.push(
        [
          csvEscape(r.marketplaceCode),
          csvEscape(r.marketplaceListingId),
          csvEscape(r.baseStockCode ?? ''),
          csvEscape(withBrand(r.productName, csvBrands.get(r.id))),
          csvEscape((Number(r.price) / 100).toFixed(2)),
          csvEscape(r.offeredStock),
          csvEscape(r.phase ?? ''),
          csvEscape(r.repriceEnabled ? 'evet' : 'hayır'),
          csvEscape(r.observationEnabled ? 'evet' : 'hayır'),
          csvEscape(r.isSalable ? 'evet' : 'hayır'),
          csvEscape(r.isLocked ? 'evet' : 'hayır'),
        ].join(','),
      );
    }
    // BOM so Excel on Windows reads the Turkish characters as UTF-8 rather than guessing the
    // system codepage (mirrors apps/web/src/lib/csv.ts's client-side downloadCsv).
    return new NextResponse('﻿' + lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': 'attachment; filename="ilanlar.csv"',
      },
    });
  }

  const limit = Math.min(200, Math.max(1, Number(params.get('limit') ?? '50')));
  const offset = Math.max(0, Number(params.get('offset') ?? '0'));

  const options: listingsRepo.ListingQueryOptions = { ...filterOptions, limit, offset };

  const { rows, total } = await listingsRepo.queryListings(appDb, options);

  const marketplaceCodes = [...new Set(rows.map((r) => r.marketplaceCode))];
  const nowMs = Date.now();
  const feesByMarketplace = new Map(
    await Promise.all(
      marketplaceCodes.map(
        async (code) => [code, await configRepo.getEffectiveFeeSettings(appDb, code, nowMs)] as const,
      ),
    ),
  );
  const enrichments = await Promise.all(rows.map((r) => enrichRow(appDb, r, feesByMarketplace)));
  const brandNames = await catalogRepo.brandNamesByListingIds(
    appDb,
    rows.map((r) => r.id),
  );

  return NextResponse.json({
    total,
    rows: rows.map((r, i) => ({
      id: r.id,
      marketplaceCode: r.marketplaceCode,
      marketplaceListingId: r.marketplaceListingId,
      sellerStockCode: r.sellerStockCode,
      baseStockCode: r.baseStockCode,
      // `Marka - Ürün Adı` (customer feedback 2026-08-25). Composed server-side so the grid, its
      // CSV export and every other product-showing screen cannot drift apart — see `withBrand`.
      productName: withBrand(r.productName, brandNames.get(r.id)),
      price: r.price.toString(),
      offeredStock: r.offeredStock,
      commissionRate: r.commissionRate,
      vatRate: r.vatRate,
      isSalable: r.isSalable,
      isLocked: r.isLocked,
      isSuspended: r.isSuspended,
      isBlacklisted: r.isBlacklisted,
      repriceEnabled: r.repriceEnabled,
      observationEnabled: r.observationEnabled,
      minPrice: r.minPrice?.toString() ?? null,
      maxPrice: r.maxPrice?.toString() ?? null,
      allowIncrease: r.allowIncrease,
      allowDecrease: r.allowDecrease,
      phase: r.phase,
      optimumPrice: r.optimumPrice?.toString() ?? null,
      lastSeenAt: r.lastSeenAt,
      ...enrichments[i]!,
    })),
  });
}
