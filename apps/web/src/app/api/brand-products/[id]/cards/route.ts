/**
 * Linking a card to a brand product, and editing or removing a link (doc 17 §2.4).
 *
 * **The multiplier is required and has no default**, here as on the screen: the product owner's
 * requirement is that "how many units does one purchase deliver?" is *asked*, and a pre-filled 1
 * is a question nobody reads. A wrong multiplier is not a cosmetic error — every band comparison
 * and every stock aggregate for that card is scaled by it.
 *
 * A pasted link that is not tracked yet creates the `tracked_products` row first, exactly as the
 * add-by-link on Takip Edilen Ürünler does, and then links it. No marketplace request is made:
 * parsing a link is offline (`resolveProductLink`; a Hepsiburada `-pm-` link is looked up among the tracked rows, never fetched), and the sweep reads the page on its own cadence.
 */
import { NextResponse } from 'next/server';
import { BRAND_UNIT_MULTIPLIER_MAX, isValidUnitMultiplier } from '@buybox/core';
import { brandProductsRepo, configRepo, newId, trackedProductsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { resolveProductLink } from '@/lib/server/product-link';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';

const MULTIPLIER_ERROR = `Adet çarpanı 1 ile ${BRAND_UNIT_MULTIPLIER_MAX} arasında bir tam sayı olmalı.`;

interface LinkBody {
  /** One of the two: an already tracked card, or a link to one. */
  readonly trackedProductId?: string;
  readonly link?: string;
  readonly unitMultiplier?: number;
  readonly isPrimary?: boolean;
  /** `barcodeSuggestion` when the operator accepted a suggestion; `manual` otherwise. */
  readonly linkSource?: 'manual' | 'barcodeSuggestion';
}

const LINK_FAILURES: Record<string, { status: number; message: string }> = {
  productNotFound: { status: 404, message: 'Ürün bulunamadı.' },
  cardNotFound: { status: 404, message: 'Kart bulunamadı.' },
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJsonBody<LinkBody>(request);
  if (body === null) return invalidBody();
  const appDb = getAppDb();

  const unitMultiplier = body.unitMultiplier;
  if (unitMultiplier === undefined) {
    return NextResponse.json({ error: 'Adet çarpanı gerekli.' }, { status: 400 });
  }
  if (!isValidUnitMultiplier(unitMultiplier) || unitMultiplier > BRAND_UNIT_MULTIPLIER_MAX) {
    return NextResponse.json({ error: MULTIPLIER_ERROR }, { status: 400 });
  }

  let trackedProductId: string | undefined = body.trackedProductId?.trim() || undefined;
  if (!trackedProductId) {
    const link = (body.link ?? '').trim();
    const resolved = link === '' ? null : await resolveProductLink(appDb, link);
    if (!resolved || !resolved.ok) {
      return NextResponse.json(
        { error: resolved?.error ?? 'Kart seçin ya da bir Trendyol/Hepsiburada ürün linki yapıştırın.' },
        { status: 400 },
      );
    }
    const parsed = {
      marketplaceCode: resolved.marketplaceCode,
      ref: { contentId: resolved.contentId, url: resolved.url },
    };
    const existing = await trackedProductsRepo.findTrackedProductByRef(
      appDb,
      parsed.marketplaceCode,
      parsed.ref.contentId,
    );
    if (existing) {
      trackedProductId = existing.id;
    } else {
      // The marketplace has to be one this install knows: `tracked_products.marketplace_code`
      // references it, and a link to a marketplace nobody enabled would fail on the foreign key
      // with nothing saying why.
      const marketplaces = await configRepo.listMarketplaces(appDb);
      if (!marketplaces.some((marketplace) => marketplace.code === parsed.marketplaceCode)) {
        return NextResponse.json(
          { error: `${parsed.marketplaceCode} bu kurulumda tanımlı değil. Ayarlar > Pazaryerleri.` },
          { status: 400 },
        );
      }
      trackedProductId = newId();
      await trackedProductsRepo.addTrackedProduct(appDb, {
        id: trackedProductId,
        marketplaceCode: parsed.marketplaceCode,
        productRef: parsed.ref.contentId,
        productUrl: parsed.ref.url ?? link,
        label: parsed.ref.contentId,
        isActive: true,
        addedAt: Date.now(),
      });
    }
  }

  const result = await brandProductsRepo.linkCard(appDb, {
    id: newId(),
    brandProductId: id,
    trackedProductId: trackedProductId!,
    unitMultiplier,
    isPrimary: body.isPrimary === true,
    linkSource: body.linkSource === 'barcodeSuggestion' ? 'barcodeSuggestion' : 'manual',
    linkedAt: Date.now(),
  });

  if (!result.ok) {
    if (result.reason === 'cardAlreadyLinked') {
      const other = await brandProductsRepo.getBrandProduct(appDb, result.brandProductId);
      return NextResponse.json(
        {
          error:
            result.brandProductId === id
              ? 'Bu kart zaten bu ürüne bağlı. Çarpanı veya birincilliği kart satırından değiştirin.'
              : `Bu kart "${other?.name ?? result.brandProductId}" ürününe bağlı. Önce oradan çıkarın.`,
          brandProductId: result.brandProductId,
        },
        { status: 409 },
      );
    }
    const failure = LINK_FAILURES[result.reason]!;
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }

  return NextResponse.json({ ok: true, cardId: result.card.id, demotedCardId: result.demotedCardId });
}

interface CardPatchBody {
  readonly cardId?: string;
  readonly unitMultiplier?: number;
  readonly isPrimary?: boolean;
}

/** Changes one link: its multiplier, or which card is the product's primary on its marketplace. */
export async function PATCH(request: Request) {
  const body = await readJsonBody<CardPatchBody>(request);
  if (body === null) return invalidBody();
  const cardId = (body.cardId ?? '').trim();
  if (cardId === '') return NextResponse.json({ error: 'Kart bağı gerekli.' }, { status: 400 });
  const appDb = getAppDb();

  if (body.unitMultiplier !== undefined) {
    if (!isValidUnitMultiplier(body.unitMultiplier) || body.unitMultiplier > BRAND_UNIT_MULTIPLIER_MAX) {
      return NextResponse.json({ error: MULTIPLIER_ERROR }, { status: 400 });
    }
    if (!(await brandProductsRepo.getBrandProductCard(appDb, cardId))) {
      return NextResponse.json({ error: 'Kart bağı bulunamadı.' }, { status: 404 });
    }
    await brandProductsRepo.setCardMultiplier(appDb, cardId, body.unitMultiplier);
  }

  // Only promotion is an action. Demoting the primary without naming a replacement would leave
  // the product with no re-import key on that marketplace (doc 17 §3.3).
  if (body.isPrimary === true) {
    const result = await brandProductsRepo.setPrimaryCard(appDb, cardId);
    if (!result.ok) return NextResponse.json({ error: 'Kart bağı bulunamadı.' }, { status: 404 });
    return NextResponse.json({ ok: true, demotedCardId: result.demotedCardId });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Unlinks a card. The tracked product stays — it is still a page worth watching, it is simply no
 * longer one of this product's cards. Resolving its open band violations with reason `unlinked`
 * joins here once `band_violations` exists (doc 17 §5.3, Phase 11.6).
 */
export async function DELETE(request: Request) {
  const cardId = new URL(request.url).searchParams.get('cardId');
  if (!cardId) return NextResponse.json({ error: 'Kart bağı gerekli.' }, { status: 400 });
  await brandProductsRepo.unlinkCard(getAppDb(), cardId);
  return NextResponse.json({ ok: true });
}
