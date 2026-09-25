/**
 * One brand product: what the detail screen reads, edits and deletes (doc 17 §2).
 *
 * The read carries the product, its cards with the tracked product behind each, and the barcode
 * suggestions — three reads the screen would otherwise make in sequence, and it needs all three
 * before it can render anything useful.
 */
import { NextResponse } from 'next/server';
import { scaleToCard } from '@buybox/core';
import { brandProductsRepo } from '@buybox/db';
import { parseBrandProductBody, type BrandProductBody } from '../route';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';

/** Kuruş → the `1249.90` form `parseTurkishDecimal` reads back exactly. */
function formatKurus(kurus: bigint): string {
  const whole = kurus / 100n;
  const fraction = (kurus % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appDb = getAppDb();
  const product = await brandProductsRepo.getBrandProduct(appDb, id);
  if (!product) return NextResponse.json({ error: 'Ürün bulunamadı.' }, { status: 404 });

  const [cards, suggestions] = await Promise.all([
    brandProductsRepo.listBrandProductCardDetails(appDb, id),
    brandProductsRepo.barcodeSuggestions(appDb, id),
  ]);

  const upperBound = product.maxPrice ?? product.referencePrice;
  return NextResponse.json({
    product: {
      id: product.id,
      name: product.name,
      referencePrice: product.referencePrice.toString(),
      minPrice: product.minPrice?.toString() ?? null,
      maxPrice: product.maxPrice?.toString() ?? null,
      upperBound: upperBound.toString(),
      upperBoundIsReferencePrice: product.maxPrice === null,
      barcode: product.barcode,
      source: product.source,
      referencePriceSource: product.referencePriceSource,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    },
    cards: cards.map((card) => ({
      id: card.id,
      trackedProductId: card.trackedProductId,
      marketplaceCode: card.marketplaceCode,
      label: card.label,
      productRef: card.productRef,
      productUrl: card.productUrl,
      unitMultiplier: card.unitMultiplier,
      isPrimary: card.isPrimary,
      linkSource: card.linkSource,
      linkedAt: card.linkedAt,
      isActive: card.isActive,
      barcode: card.barcode,
      lastScrapedAt: card.lastScrapedAt,
      hasSellers: card.hasSellers,
      // The card-level band: per-unit thresholds times this card's multiplier (doc 17 §2.2).
      // Computed here so the screen never divides a price to compare it.
      cardReferencePrice: scaleToCard(product.referencePrice, card.unitMultiplier).toString(),
      cardMinPrice:
        product.minPrice === null ? null : scaleToCard(product.minPrice, card.unitMultiplier).toString(),
      cardUpperBound: scaleToCard(upperBound, card.unitMultiplier).toString(),
    })),
    suggestions,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appDb = getAppDb();
  const existing = await brandProductsRepo.getBrandProduct(appDb, id);
  if (!existing) {
    return NextResponse.json({ error: 'Ürün bulunamadı.' }, { status: 404 });
  }
  const body = await readJsonBody<BrandProductBody>(request);
  if (body === null) return invalidBody();
  // A field the request leaves out keeps its stored value; only a field sent empty is cleared.
  // The edit form sends no `referencePriceSource`, and reading "absent" as "clear" erased the
  // PSF's source on every save from the screen (measured 2026-09-25).
  const kept = (amount: bigint | null) => (amount === null ? null : formatKurus(amount));
  const parsed = parseBrandProductBody(
    {
      name: body.name !== undefined ? body.name : existing.name,
      referencePrice:
        body.referencePrice !== undefined ? body.referencePrice : formatKurus(existing.referencePrice),
      minPrice: body.minPrice !== undefined ? body.minPrice : kept(existing.minPrice),
      maxPrice: body.maxPrice !== undefined ? body.maxPrice : kept(existing.maxPrice),
      barcode: body.barcode !== undefined ? body.barcode : existing.barcode,
      referencePriceSource:
        body.referencePriceSource !== undefined ? body.referencePriceSource : existing.referencePriceSource,
    },
    existing.barcode,
  );
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });

  await brandProductsRepo.updateBrandProduct(appDb, id, parsed.fields, Date.now());
  return NextResponse.json({ ok: true, warnings: parsed.warnings });
}

/**
 * Deletes the product. Its links go with it (cascade) and the cards stay tracked — deleting a
 * product of your own says nothing about whether the marketplace pages should still be watched.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await brandProductsRepo.deleteBrandProduct(getAppDb(), id);
  return NextResponse.json({ ok: true });
}
