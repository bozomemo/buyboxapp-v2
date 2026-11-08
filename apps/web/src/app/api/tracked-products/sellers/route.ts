/**
 * The Takip Edilen Ürünler seller dropdown's source (2026-11-08 seller filters spec §4.5): every
 * seller seen on a tracked product in the window, with its name from `competitor_sellers` and
 * how many products it was seen on, most first.
 *
 * Sent whole and searched client-side — a few hundred sellers is a small payload, and a typed
 * search then needs no round trip. Scoped by `marketplaceCode` / `watchedBrandId` when given.
 */
import { NextResponse } from 'next/server';
import { trackedProductsRepo } from '@buybox/db';
import { withPermission } from '@/lib/server/auth/guard';
import { getAppDb } from '@/lib/server/db';
import { periodWindowFrom } from '@/lib/server/tracked-product-period';

function optionalString(params: URLSearchParams, key: string): string | undefined {
  const raw = params.get(key);
  return raw === null || raw.trim() === '' ? undefined : raw.trim();
}

async function getHandler(request: Request) {
  const params = new URL(request.url).searchParams;
  const { sinceMs } = periodWindowFrom(params);
  const sellers = await trackedProductsRepo.trackedProductSellerOptions(getAppDb(), {
    sinceMs,
    marketplaceCode: optionalString(params, 'marketplaceCode'),
    watchedBrandId: optionalString(params, 'watchedBrandId'),
  });
  return NextResponse.json({ sellers });
}

// Same guard as the list it filters.
export const GET = withPermission('view', getHandler);
