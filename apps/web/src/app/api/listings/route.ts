/**
 * The listings grid's server-paged, server-filtered feed (doc 06 §4, R-UI-4/R-UI-5, doc 12
 * 6.6). Query params are parsed structurally into `ListingQueryOptions` — never string-built
 * SQL (doc 09 §20).
 */
import { NextResponse } from 'next/server';
import { effectiveCommissionRate, floorPrice } from '@buybox/core';
import { competitionRepo, configRepo, listingsRepo, stockRepo } from '@buybox/db';
import { mapFeeSettings } from '@buybox/jobs';
import { Money } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';

type RepricingPhase = listingsRepo.RepricingPhase;

/**
 * Per-row enrichment (Dip Fiyat, Buybox Fiyatı, Sıra, Fark — doc 06 §4.1) is computed only
 * for the current page, not the whole catalogue: fee settings are fetched once per
 * marketplace on the page, stock cost and the latest buybox observation once per row. Bounded
 * by page size (≤200, default 50), this stays cheap regardless of catalogue size — the
 * server-paging that makes the 50,000-row DoD hold also bounds this enrichment's cost.
 */
async function enrichRow(
  appDb: ReturnType<typeof getAppDb>,
  row: Awaited<ReturnType<typeof listingsRepo.queryListings>>['rows'][number],
  feesByMarketplace: Map<string, Awaited<ReturnType<typeof configRepo.getEffectiveFeeSettings>>>,
) {
  const [stockItem, buybox] = await Promise.all([
    row.baseStockCode ? stockRepo.getStockItem(appDb, row.baseStockCode) : undefined,
    competitionRepo.latestBuyboxObservation(appDb, row.id),
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
  };
}

function parseTriState(value: string | null): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const appDb = getAppDb();

  const limit = Math.min(200, Math.max(1, Number(params.get('limit') ?? '50')));
  const offset = Math.max(0, Number(params.get('offset') ?? '0'));
  const phasesParam = params.get('phases');

  const options: listingsRepo.ListingQueryOptions = {
    marketplaceCode: params.get('marketplaceCode') ?? undefined,
    phases: phasesParam ? (phasesParam.split(',') as RepricingPhase[]) : undefined,
    text: params.get('text') ?? undefined,
    excludeArchived: true,
    sort: (params.get('sort') as 'lastSeenAt' | 'productName' | 'price' | null) ?? 'lastSeenAt',
    sortDir: (params.get('sortDir') as 'asc' | 'desc' | null) ?? 'desc',
    limit,
    offset,
    isSalable: parseTriState(params.get('isSalable')),
    isLocked: parseTriState(params.get('isLocked')),
    isSuspended: parseTriState(params.get('isSuspended')),
    isBlacklisted: parseTriState(params.get('isBlacklisted')),
    repriceEnabled: parseTriState(params.get('repriceEnabled')),
    observationEnabled: parseTriState(params.get('observationEnabled')),
  };

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

  return NextResponse.json({
    total,
    rows: rows.map((r, i) => ({
      id: r.id,
      marketplaceCode: r.marketplaceCode,
      marketplaceListingId: r.marketplaceListingId,
      sellerStockCode: r.sellerStockCode,
      baseStockCode: r.baseStockCode,
      productName: r.productName,
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
