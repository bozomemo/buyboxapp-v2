/**
 * `/tracked-products` screen's feed (doc 06 §12.2, customer feedback 2026-08-25): products we
 * do not sell, watched for price/rank by link only (v1 scope — see doc 06 §12.2's open
 * questions for the brand-wide search option deferred out of v1).
 */
import { NextResponse } from 'next/server';
import { parseProductLink } from '@buybox/adapters';
import { newId, trackedProductsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function GET() {
  const appDb = getAppDb();
  const products = await trackedProductsRepo.listTrackedProducts(appDb);
  const withLatest = await Promise.all(
    products.map(async (p) => ({
      ...p,
      latest: await trackedProductsRepo.latestTrackedProductObservations(appDb, p.id),
    })),
  );
  return NextResponse.json({
    products: withLatest.map((p) => ({
      id: p.id,
      marketplaceCode: p.marketplaceCode,
      productUrl: p.productUrl,
      label: p.label,
      isActive: p.isActive,
      addedAt: p.addedAt,
      latest: p.latest.map((o) => ({
        status: o.status,
        rank: o.rank,
        sellerName: o.sellerName,
        price: o.price?.toString() ?? null,
        finalPrice: o.finalPrice?.toString() ?? null,
        observedAt: o.observedAt,
      })),
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { link?: string; label?: string };
  const link = (body.link ?? '').trim();
  if (!link) {
    return NextResponse.json({ error: 'Ürün linki gerekli.' }, { status: 400 });
  }
  const parsed = parseProductLink(link);
  if (!parsed || !parsed.ref.contentId) {
    return NextResponse.json(
      { error: 'Link tanınamadı. Trendyol veya Hepsiburada ürün sayfası linki yapıştırın.' },
      { status: 400 },
    );
  }

  const appDb = getAppDb();
  const existing = await trackedProductsRepo.findTrackedProductByRef(
    appDb,
    parsed.marketplaceCode,
    parsed.ref.contentId,
  );
  if (existing) {
    return NextResponse.json({ error: 'Bu ürün zaten takip listesinde.' }, { status: 409 });
  }

  const id = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode: parsed.marketplaceCode,
    productRef: parsed.ref.contentId,
    productUrl: parsed.ref.url ?? link,
    label: (body.label ?? '').trim() || link,
    isActive: true,
    addedAt: Date.now(),
  });
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli.' }, { status: 400 });
  await trackedProductsRepo.deleteTrackedProduct(getAppDb(), id);
  return NextResponse.json({ ok: true });
}
