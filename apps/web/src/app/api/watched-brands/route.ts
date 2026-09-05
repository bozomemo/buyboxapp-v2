/**
 * `/watched-brands` screen's feed — the brand-owner audit module's registry
 * (api-references §1.7).
 *
 * Small, in-memory list like `/api/brands`: a brand owner watches a handful of brands, not a
 * catalogue of them, so no paging. The *products* those brands discover are thousands of rows
 * and live on the tracked-products grid, which pages.
 *
 * Note this is a different thing from `/api/brands`, which serves our own catalogue's brand
 * taxonomy derived from listings we sell. See the doc comment on `watchedBrands` in
 * `packages/db/src/schema/sqlite.ts`.
 */
import { NextResponse } from 'next/server';
import { newId, watchedBrandsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

/**
 * How dominant a brand id must be among a brand's swept products before it is offered as a
 * second selector.
 *
 * A search term legitimately returns some products the marketplace attributes elsewhere — that
 * is the whole point of sweeping it — so the winner never reaches 100%. Below this, though, the
 * results are too mixed to claim we have identified the brand, and offering a coin-flip would
 * be worse than offering nothing.
 */
const BRAND_REF_SUGGESTION_MIN_SHARE = 0.6;

export async function GET() {
  const appDb = getAppDb();
  const [groups, brands, counts, suggestions] = await Promise.all([
    watchedBrandsRepo.listWatchedBrandGroups(appDb),
    watchedBrandsRepo.listWatchedBrands(appDb),
    watchedBrandsRepo.watchedBrandCounts(appDb),
    watchedBrandsRepo.suggestedBrandRefs(appDb),
  ]);

  const countsById = new Map(counts.map((c) => [c.watchedBrandId, c]));
  const suggestionById = new Map(suggestions.map((s) => [s.watchedBrandId, s]));

  return NextResponse.json({
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      note: group.note,
      brands: brands
        .filter((brand) => brand.groupId === group.id)
        .map((brand) => {
          const suggestion = suggestionById.get(brand.id);
          return {
            id: brand.id,
            marketplaceCode: brand.marketplaceCode,
            label: brand.label,
            brandRef: brand.brandRef,
            searchTerm: brand.searchTerm,
            isActive: brand.isActive,
            isOwnBrand: brand.isOwnBrand ?? true,
            lastSweptAt: brand.lastSweptAt,
            lastSweepProductCount: brand.lastSweepProductCount,
            productCount: countsById.get(brand.id)?.productCount ?? 0,
            // Products the marketplace itself has never had rated — what the "drop these?"
            // suggestion acts on. Deliberately not products whose rating we failed to read.
            unratedCount: countsById.get(brand.id)?.unratedCount ?? 0,
            /**
             * Lost shelf: products whose last successful look found nobody selling, and products
             * no successful look has reached yet. Reported side by side because the second is
             * the denominator's honest caveat — a brand halfway through its first rotation has
             * a `noSellerCount` that means very little until `neverLookedCount` comes down.
             */
            noSellerCount: countsById.get(brand.id)?.noSellerCount ?? 0,
            neverLookedCount: countsById.get(brand.id)?.neverLookedCount ?? 0,
            // Offered, not applied: adding it changes what the next sweep fetches, which is
            // the operator's call. Null once the brand already has a brand id.
            suggestedBrandRef:
              brand.brandRef === null &&
              suggestion !== undefined &&
              suggestion.share >= BRAND_REF_SUGGESTION_MIN_SHARE
                ? { ref: suggestion.brandRef, share: suggestion.share }
                : null,
          };
        }),
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    groupId?: string;
    marketplaceCode?: string;
    label?: string;
    brandRef?: string;
    searchTerm?: string;
    /** `false` marks a competitor's brand: swept and priced, but never audited. */
    isOwnBrand?: boolean;
  };

  const groupId = (body.groupId ?? '').trim();
  const marketplaceCode = (body.marketplaceCode ?? '').trim();
  const label = (body.label ?? '').trim();
  const brandRef = (body.brandRef ?? '').trim();
  const searchTerm = (body.searchTerm ?? '').trim();

  if (!groupId) return NextResponse.json({ error: 'Marka grubu seçin.' }, { status: 400 });
  if (!marketplaceCode) return NextResponse.json({ error: 'Pazaryeri seçin.' }, { status: 400 });
  if (!label) return NextResponse.json({ error: 'Marka adı gerekli.' }, { status: 400 });
  if (!brandRef && !searchTerm) {
    return NextResponse.json(
      { error: 'Marka id’si veya arama terimi gerekli — en az biri olmadan tarama yapılamaz.' },
      { status: 400 },
    );
  }

  const appDb = getAppDb();
  const nowMs = Date.now();
  const id = newId();
  try {
    await watchedBrandsRepo.createWatchedBrand(appDb, {
      id,
      groupId,
      marketplaceCode,
      label,
      brandRef: brandRef || null,
      searchTerm: searchTerm || null,
      isActive: true,
      isOwnBrand: body.isOwnBrand ?? true,
      lastSweptAt: null,
      lastSweepProductCount: null,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  } catch (error) {
    if (error instanceof watchedBrandsRepo.WatchedBrandSelectorError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // The unique index is (group, marketplace, label) — the only other thing that realistically
    // fails here is adding the same brand twice, which deserves its own message rather than a 500.
    return NextResponse.json(
      { error: 'Bu grup için bu pazaryerinde aynı adda bir marka zaten var.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, id });
}
