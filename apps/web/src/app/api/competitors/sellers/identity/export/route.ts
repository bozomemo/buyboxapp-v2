/**
 * _Kimlikleri Excel'e aktar_ — every stored seller identity beside its storefront
 * (2026-11-25, product owner; doc 06 §12.4 Faz 7).
 *
 * Reads only what resolutions already stored and sends nothing to a marketplace: a seller never
 * resolved is absent, not looked up. The screen turns the rows into the CSV, through the same
 * `downloadCsv` every other table export uses.
 */
import { NextResponse } from 'next/server';
import { sellerIdentitiesRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { withPermission } from '@/lib/server/auth/guard';

async function getHandler() {
  const identities = await sellerIdentitiesRepo.listSellerIdentitiesWithSellers(getAppDb());
  return NextResponse.json({ identities });
}

export const GET = withPermission('view', getHandler);
