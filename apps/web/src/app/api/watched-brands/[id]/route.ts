/**
 * A single watched brand: edit its selectors, pause it, or remove it (api-references §1.7).
 *
 * Removing a brand deletes the brand row, not the products it found — those keep their history
 * and simply lose their brand attribution (`set null` on `tracked_products.watched_brand_id`).
 */
import { NextResponse } from 'next/server';
import { watchedBrandsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as {
    label?: string;
    brandRef?: string | null;
    searchTerm?: string | null;
    isActive?: boolean;
  };

  const appDb = getAppDb();
  const existing = await watchedBrandsRepo.getWatchedBrand(appDb, id);
  if (!existing) return NextResponse.json({ error: 'Marka bulunamadı.' }, { status: 404 });

  // A partial patch: anything the caller omitted keeps its current value. This is what lets the
  // "marka id’sini de ekle" button send only `brandRef` without having to restate the rest.
  const label = body.label === undefined ? existing.label : body.label.trim();
  const brandRef =
    body.brandRef === undefined ? existing.brandRef : (body.brandRef ?? '').trim() || null;
  const searchTerm =
    body.searchTerm === undefined ? existing.searchTerm : (body.searchTerm ?? '').trim() || null;

  if (!label) return NextResponse.json({ error: 'Marka adı gerekli.' }, { status: 400 });

  try {
    await watchedBrandsRepo.updateWatchedBrand(appDb, id, {
      label,
      brandRef,
      searchTerm,
      isActive: body.isActive ?? existing.isActive,
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await watchedBrandsRepo.deleteWatchedBrand(getAppDb(), id);
  return NextResponse.json({ ok: true });
}
