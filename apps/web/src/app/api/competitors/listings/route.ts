/**
 * Small typeahead for the competitor-history "listing" filter (doc 06 §6) — reuses the same
 * structural text search `queryListings` already uses for the main grid (doc 06 §4).
 */
import { NextResponse } from 'next/server';
import { listingsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const text = url.searchParams.get('text') ?? '';
  const appDb = getAppDb();

  const { rows } = await listingsRepo.queryListings(appDb, {
    text: text || undefined,
    limit: 20,
    offset: 0,
    sort: 'productName',
    sortDir: 'asc',
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      productName: r.productName,
      marketplaceCode: r.marketplaceCode,
      marketplaceListingId: r.marketplaceListingId,
      baseStockCode: r.baseStockCode,
    })),
  });
}
