/**
 * Kâr Ayarları (marka) — the fixed per-sale fee and the desi table the reseller profit estimate
 * reads (doc 17 §8.1). Amounts cross as kuruş strings both ways, like every other route.
 */
import { NextResponse } from 'next/server';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';
import {
  DEFAULT_FIXED_SALE_FEE_KURUS,
  parseSellerProfitSettings,
  readSellerProfitSettings,
  saveSellerProfitSettings,
  type SellerProfitSettingsBody,
} from '@/lib/server/seller-profit-settings';

async function getHandler() {
  const settings = await readSellerProfitSettings(getAppDb());
  return NextResponse.json({
    // `null` means never saved: the screen offers the default fee and an empty table, and the
    // estimate stays blank until somebody saves them.
    settings:
      settings === null
        ? null
        : {
            fixedSaleFee: settings.fixedSaleFee.toString(),
            desiBands: settings.desiBands.map((band) => ({
              maxDesi: band.maxDesi,
              cargo: band.cargo.toString(),
              operation: band.operation.toString(),
            })),
          },
    defaultFixedSaleFee: DEFAULT_FIXED_SALE_FEE_KURUS.toString(),
  });
}

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const body = await readJsonBody<SellerProfitSettingsBody>(request);
  if (body === null) return invalidBody();
  const parsed = parseSellerProfitSettings(body);
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });
  await saveSellerProfitSettings(getAppDb(), parsed, auth.actor, Date.now());
  return NextResponse.json({ ok: true });
}

export const GET = withPermission('view', getHandler);
export const POST = withPermission('catalogue.manage', postHandler);
