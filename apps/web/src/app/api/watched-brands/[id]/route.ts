/**
 * A single watched brand: edit its selectors, pause it, or remove it (api-references §1.7).
 *
 * Removing a brand deletes the brand row, not the products it found — those keep their history
 * and simply lose their brand attribution (`set null` on `tracked_products.watched_brand_id`).
 */
import { NextResponse } from 'next/server';
import { trackedProductsRepo, watchedBrandsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { watchedBrandSelectorProblem } from '@/lib/watched-brand-selector';
import { withPermission } from '@/lib/server/auth/guard';

async function patchHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJsonBody<{
    label?: string;
    brandRef?: string | null;
    searchTerm?: string | null;
    isActive?: boolean;
    isOwnBrand?: boolean;
  }>(request);
  if (body === null) return invalidBody();

  const appDb = getAppDb();
  const existing = await watchedBrandsRepo.getWatchedBrand(appDb, id);
  if (!existing) return NextResponse.json({ error: 'Marka bulunamadı.' }, { status: 404 });

  // A partial patch: anything the caller omitted keeps its current value. This is what lets the
  // "marka id’sini de ekle" button send only `brandRef` without having to restate the rest.
  const label = body.label === undefined ? existing.label : body.label.trim();
  const brandRef = body.brandRef === undefined ? existing.brandRef : (body.brandRef ?? '').trim() || null;
  const searchTerm =
    body.searchTerm === undefined ? existing.searchTerm : (body.searchTerm ?? '').trim() || null;

  if (!label) return NextResponse.json({ error: 'Marka adı gerekli.' }, { status: 400 });
  const selectorProblem = watchedBrandSelectorProblem(existing.marketplaceCode, brandRef, searchTerm);
  if (selectorProblem) return NextResponse.json({ error: selectorProblem }, { status: 400 });

  try {
    await watchedBrandsRepo.updateWatchedBrand(appDb, id, {
      label,
      brandRef,
      searchTerm,
      isActive: body.isActive ?? existing.isActive,
      // `?? true` for a row written before the column existed — every brand watched then was
      // one the operator owned, which is what the column's default says too.
      isOwnBrand: body.isOwnBrand ?? existing.isOwnBrand ?? true,
      updatedAt: Date.now(),
    });
  } catch (error) {
    if (error instanceof watchedBrandsRepo.WatchedBrandSelectorError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}

/**
 * `?withProducts=1` also deletes the products the brand's sweep found (review 2026-11-25 Y12),
 * except those linked to a brand product or marked favourite. Done **before** the brand row goes,
 * because deleting the brand nulls `watched_brand_id` and the products could no longer be told
 * apart from any others.
 */
async function deleteHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appDb = getAppDb();
  const withProducts = new URL(request.url).searchParams.get('withProducts') === '1';
  const products = withProducts
    ? await trackedProductsRepo.deleteUnlinkedBrandProducts(appDb, id)
    : { deleted: 0, kept: 0 };
  await watchedBrandsRepo.deleteWatchedBrand(appDb, id);
  return NextResponse.json({ ok: true, deletedProducts: products.deleted, keptProducts: products.kept });
}

export const PATCH = withPermission('catalogue.manage', patchHandler);
export const DELETE = withPermission('catalogue.manage', deleteHandler);
