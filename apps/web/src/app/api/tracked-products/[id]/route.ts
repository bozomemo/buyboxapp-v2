/**
 * Tracked-product detail (doc 06 §12.2's detail-screen entry, customer feedback 2026-08-25):
 * every seller on a watched product, their prices and their stock, plus how those moved.
 *
 * The listings detail route next door (`api/listings/[id]`) answers "why is our price what it
 * is" and so returns a cost waterfall, an engine state and a submission history. None of that
 * exists here and none of it ever will: a tracked product is one we do **not** sell, held in a
 * table `Reprice`/`ObserveBuybox` never query (see `trackedProducts` in `schema/sqlite.ts`).
 * What is left is the observation itself, which is what this returns.
 *
 * The shaping is in `lib/tracked-product-sellers.ts` under test; this route is the plumbing.
 */
import { NextResponse } from 'next/server';
import { trackedProductsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { seriesBySeller, summariseLooks } from '@/lib/tracked-product-sellers';

/** Same span the listing detail's price chart defaults to, for the same reason. */
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appDb = getAppDb();
  const nowMs = Date.now();

  const product = await trackedProductsRepo.getTrackedProduct(appDb, id);
  if (!product) return NextResponse.json({ error: 'Takip edilen ürün bulunamadı.' }, { status: 404 });

  const sinceParam = new URL(request.url).searchParams.get('sinceMs');
  const sinceMs = sinceParam ? Number(sinceParam) : nowMs - HISTORY_WINDOW_MS;
  const rows = await trackedProductsRepo.trackedProductObservationsSince(appDb, id, sinceMs);

  const looks = summariseLooks(rows);
  const latestLook = looks[looks.length - 1] ?? null;
  const sellers = seriesBySeller(rows, latestLook?.observedAt ?? null);

  return NextResponse.json({
    product: {
      id: product.id,
      marketplaceCode: product.marketplaceCode,
      productRef: product.productRef,
      productUrl: product.productUrl,
      label: product.label,
      isActive: product.isActive,
      addedAt: product.addedAt,
      /**
       * When the scrape last looked. Since Faz 4 a look is only stored when the offer set moved,
       * so `latestLook` below is the last look that *changed* — on a product whose price has
       * held for a week the two are a week apart, and reading the observation as the look would
       * report a perfectly healthy product as unchecked.
       */
      lastScrapedAt: product.lastScrapedAt ?? null,
    },
    window: { sinceMs, untilMs: nowMs },
    latestLook: latestLook
      ? { observedAt: latestLook.observedAt, status: latestLook.status, offers: latestLook.offers }
      : null,
    looks: looks.map((l) => ({
      observedAt: l.observedAt,
      status: l.status,
      offers: l.offers,
      buyboxPrice: l.buyboxPrice?.toString() ?? null,
    })),
    sellers: sellers.map((s) => ({
      key: s.key,
      sellerName: s.sellerName,
      sellerRef: s.sellerRef,
      unverifiedKey: s.unverifiedKey,
      current: s.current
        ? {
            observedAt: s.current.observedAt,
            rank: s.current.rank,
            price: s.current.price?.toString() ?? null,
            finalPrice: s.current.finalPrice?.toString() ?? null,
            offeredStock: s.current.offeredStock,
          }
        : null,
      previousPrice: s.previousPrice?.toString() ?? null,
      firstSeenAt: s.firstSeenAt,
      lastSeenAt: s.lastSeenAt,
      points: s.points.map((p) => ({
        observedAt: p.observedAt,
        rank: p.rank,
        price: p.price?.toString() ?? null,
        finalPrice: p.finalPrice?.toString() ?? null,
        offeredStock: p.offeredStock,
      })),
    })),
  });
}
