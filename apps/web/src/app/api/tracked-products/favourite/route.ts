/**
 * The favourite star on Takip Edilen Ürünler (doc 17 §4.1).
 *
 * A favourite puts a card in the brand module's İlanlar and speeds up its rotation, and it is
 * **independent of any brand-product link**: a favourite need not be the manager's own product —
 * a competing brand's card they want in view is the case this exists for. So it has no PSF, no
 * band and no alarm, and this route deliberately knows nothing about links.
 */
import { NextResponse } from 'next/server';
import { trackedProductsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';

export async function POST(request: Request) {
  const body = await readJsonBody<{ id?: string; isFavourite?: boolean }>(request);
  if (body === null) return invalidBody();
  const id = (body.id ?? '').trim();
  if (id === '') return NextResponse.json({ error: 'Ürün gerekli.' }, { status: 400 });

  const appDb = getAppDb();
  if (!(await trackedProductsRepo.getTrackedProduct(appDb, id))) {
    return NextResponse.json({ error: 'Ürün bulunamadı.' }, { status: 404 });
  }

  const isFavourite = body.isFavourite === true;
  await trackedProductsRepo.setTrackedProductFavourite(appDb, id, isFavourite, Date.now());
  return NextResponse.json({ ok: true, isFavourite });
}
