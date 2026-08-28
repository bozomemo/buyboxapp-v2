/**
 * Categories present among tracked products, with how many products sit in each — the grid's
 * category filter, and the answer to "ürünlerim hangi kategoriler altında satılıyor?".
 *
 * Worth reading as a report and not only as a filter: on the 2026-08-27 Whiskas sweep this list
 * ended in *Halı*, *Ahşap Boya & Vernik* and *Bebek & Aktivite Oyuncakları* — eight products
 * carrying the brand's name in categories the brand does not sell into. The long tail of this
 * list is where brand misuse shows up first (api-references §1.7).
 */
import { NextResponse } from 'next/server';
import { trackedProductsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function GET(request: Request) {
  const watchedBrandId = new URL(request.url).searchParams.get('watchedBrandId');
  const categories = await trackedProductsRepo.trackedProductCategories(
    getAppDb(),
    watchedBrandId ?? undefined,
  );
  return NextResponse.json({ categories });
}
