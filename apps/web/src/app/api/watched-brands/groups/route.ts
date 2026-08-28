/**
 * Watched brand *groups* — the brand owner's organisation (Mars), one level above a brand
 * (api-references §1.7).
 *
 * Deleting a group cascades to its brands. It does **not** delete the products those brands
 * discovered: their `watched_brand_id` goes null instead, so observation history the operator
 * may still be reading survives a change of mind about what to keep sweeping.
 */
import { NextResponse } from 'next/server';
import { newId, watchedBrandsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; note?: string };
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Grup adı gerekli.' }, { status: 400 });

  const nowMs = Date.now();
  const id = newId();
  await watchedBrandsRepo.createWatchedBrandGroup(getAppDb(), {
    id,
    name,
    note: (body.note ?? '').trim() || null,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: string; name?: string; note?: string };
  const id = (body.id ?? '').trim();
  const name = (body.name ?? '').trim();
  if (!id) return NextResponse.json({ error: 'id gerekli.' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Grup adı gerekli.' }, { status: 400 });

  await watchedBrandsRepo.renameWatchedBrandGroup(
    getAppDb(),
    id,
    name,
    (body.note ?? '').trim() || null,
    Date.now(),
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli.' }, { status: 400 });
  await watchedBrandsRepo.deleteWatchedBrandGroup(getAppDb(), id);
  return NextResponse.json({ ok: true });
}
