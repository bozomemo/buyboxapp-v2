/**
 * `/brands` screen's feed (doc 06 §12.1, customer feedback 2026-08-25). Small, in-memory list —
 * brand/category counts are in the tens to low hundreds even at catalogue scale, unlike the
 * listings grid, so no paging is needed here (contrast R-UI-5 on `/listings`).
 */
import { NextResponse } from 'next/server';
import { catalogRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function GET() {
  const appDb = getAppDb();
  const brands = await catalogRepo.listBrandsWithCounts(appDb);
  return NextResponse.json({ brands });
}
