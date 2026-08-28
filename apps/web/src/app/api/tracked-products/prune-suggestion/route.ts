/**
 * "Bu markada N ürünün hiç değerlendirmesi yok — çıkarayım mı?"
 *
 * A suggestion, computed per brand, with the scan time it would actually save. Never an
 * automatic deletion, and never a deletion at all: applying it deactivates
 * (`PATCH /api/tracked-products`), so the operator can put the products back.
 *
 * The saving has to be computed rather than assumed, because it is wildly brand-specific: 65%
 * of Whiskas' 887 products had never been rated against 5% of Royal Canin's, measured
 * 2026-08-27/28. A fixed "drop unrated products" rule would be a two-thirds win on one brand
 * and a rounding error on the other, and the operator can only weigh that against a real number.
 */
import { NextResponse } from 'next/server';
import { TRENDYOL_SCRAPE_DEFAULTS } from '@buybox/adapters';
import { trackedProductsRepo, watchedBrandsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

/**
 * The deep per-product scrape's rate, which is what the suggestion actually saves — one page
 * load per product (api-references §1.6). The catalogue sweep is not affected: it fetches by
 * page regardless of how many products a page holds, so removing products from it saves
 * nothing. Saying otherwise would overstate the win.
 */
const SCRAPE_REQUESTS_PER_MINUTE = TRENDYOL_SCRAPE_DEFAULTS.requestsPerMinute;

function minutesFor(productCount: number): number {
  return Math.round(productCount / SCRAPE_REQUESTS_PER_MINUTE);
}

export async function GET(request: Request) {
  const appDb = getAppDb();
  const watchedBrandId = new URL(request.url).searchParams.get('watchedBrandId');

  const [brands, counts] = await Promise.all([
    watchedBrandsRepo.listWatchedBrands(appDb),
    watchedBrandsRepo.watchedBrandCounts(appDb),
  ]);
  const countsById = new Map(counts.map((c) => [c.watchedBrandId, c]));

  const suggestions = brands
    .filter((brand) => watchedBrandId === null || brand.id === watchedBrandId)
    .map((brand) => {
      const count = countsById.get(brand.id);
      const productCount = count?.productCount ?? 0;
      const unratedCount = count?.unratedCount ?? 0;
      return {
        watchedBrandId: brand.id,
        label: brand.label,
        productCount,
        unratedCount,
        share: productCount === 0 ? 0 : unratedCount / productCount,
        currentScanMinutes: minutesFor(productCount),
        prunedScanMinutes: minutesFor(productCount - unratedCount),
      };
    })
    .filter((suggestion) => suggestion.unratedCount > 0);

  return NextResponse.json({ suggestions });
}

/**
 * The ids this suggestion would deactivate, for the brand named — so the client can show them
 * before acting and then send exactly those to `PATCH /api/tracked-products`.
 *
 * Capped: a brand can have thousands of unrated products and there is no reason to move all of
 * them through one request. The client pages if it needs to.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { watchedBrandId?: string; limit?: number };
  const watchedBrandId = (body.watchedBrandId ?? '').trim();
  if (!watchedBrandId) return NextResponse.json({ error: 'Marka seçin.' }, { status: 400 });

  const limit = Math.min(Math.max(body.limit ?? 500, 1), 1000);
  const { rows, total } = await trackedProductsRepo.queryTrackedProducts(getAppDb(), {
    watchedBrandId,
    unratedOnly: true,
    isActive: true,
    sort: 'label',
    sortDir: 'asc',
    limit,
    offset: 0,
  });

  return NextResponse.json({
    total,
    ids: rows.map((row) => row.id),
    sample: rows.slice(0, 10).map((row) => ({ id: row.id, label: row.label })),
  });
}
