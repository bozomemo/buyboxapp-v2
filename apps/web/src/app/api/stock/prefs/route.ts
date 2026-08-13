/**
 * Editable per-marketplace stock prefs (doc 06 §3): "TY/HB Çarpan" (price multiplier) and
 * "TY/HB Oto BB" (automation switch). `ensureStockMarketplacePrefs` first so the very first
 * edit for a base/marketplace pair (before any import has created the row) still works.
 */
import { NextResponse } from 'next/server';
import { stockRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    baseStockCode: string;
    marketplaceCode: string;
    priceMultiplier?: number;
    autoRepriceEnabled?: boolean;
  };
  const appDb = getAppDb();
  const nowMs = Date.now();
  await stockRepo.ensureStockMarketplacePrefs(appDb, {
    baseStockCode: body.baseStockCode,
    marketplaceCode: body.marketplaceCode,
    priceMultiplier: body.priceMultiplier ?? 1,
    autoRepriceEnabled: body.autoRepriceEnabled ?? false,
    updatedBy: 'operator',
    updatedAt: nowMs,
  });
  await stockRepo.updateStockMarketplacePrefs(appDb, body.baseStockCode, body.marketplaceCode, {
    ...(body.priceMultiplier !== undefined ? { priceMultiplier: body.priceMultiplier } : {}),
    ...(body.autoRepriceEnabled !== undefined ? { autoRepriceEnabled: body.autoRepriceEnabled } : {}),
    updatedBy: 'operator',
    updatedAt: nowMs,
  });
  return NextResponse.json({ ok: true });
}
