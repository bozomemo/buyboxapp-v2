/**
 * Editable per-marketplace stock prefs (doc 06 §3): "TY/HB Çarpan" (price multiplier) and
 * "TY/HB Oto BB" (automation switch). `ensureStockMarketplacePrefs` first so the very first
 * edit for a base/marketplace pair (before any import has created the row) still works.
 */
import { NextResponse } from 'next/server';
import { stockRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const body = await readJsonBody<{
    baseStockCode: string;
    marketplaceCode: string;
    priceMultiplier?: number;
    autoRepriceEnabled?: boolean;
  }>(request);
  if (body === null) return invalidBody();
  const appDb = getAppDb();
  const nowMs = Date.now();
  await stockRepo.ensureStockMarketplacePrefs(appDb, {
    baseStockCode: body.baseStockCode,
    marketplaceCode: body.marketplaceCode,
    priceMultiplier: body.priceMultiplier ?? 1,
    autoRepriceEnabled: body.autoRepriceEnabled ?? false,
    updatedBy: auth.actor,
    updatedAt: nowMs,
  });
  await stockRepo.updateStockMarketplacePrefs(appDb, body.baseStockCode, body.marketplaceCode, {
    ...(body.priceMultiplier !== undefined ? { priceMultiplier: body.priceMultiplier } : {}),
    ...(body.autoRepriceEnabled !== undefined ? { autoRepriceEnabled: body.autoRepriceEnabled } : {}),
    updatedBy: auth.actor,
    updatedAt: nowMs,
  });
  return NextResponse.json({ ok: true });
}

export const POST = withPermission('prices.manage', postHandler);
