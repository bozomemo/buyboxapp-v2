/**
 * One reading of an operator-pasted product link for every field that takes one — the card
 * picker and "takip listesine ekle" (2026-09-25).
 *
 * The two used to accept only an absolute link, while the Excel import also read the host-less
 * path and every screen of this app *shows* host-less paths. And Hepsiburada's `-pm-` parent
 * link, which the catalogue sweep stores for every Hepsiburada row, was refused everywhere even
 * when the variant it stands for is already tracked. A link copied from this app's own screen
 * is now readable wherever a link is asked for.
 */
import { hepsiburadaParentRef, parseProductLink } from '@buybox/adapters';
import type { MarketplaceCode } from '@buybox/core';
import { trackedProductsRepo, type AppDatabase } from '@buybox/db';

export type ResolvedProductLink =
  | {
      readonly ok: true;
      readonly marketplaceCode: MarketplaceCode;
      readonly contentId: string;
      readonly url: string;
    }
  /** `error: null` — not a product link at all; the caller says so in its own words. */
  | { readonly ok: false; readonly error: string | null };

export const PARENT_LINK_UNRESOLVED =
  'Bu link Hepsiburada’da ürün ailesini gösteriyor, satılan varyantı değil. Varyantı açıp linkini kopyalayın.';

export async function resolveProductLink(appDb: AppDatabase, input: string): Promise<ResolvedProductLink> {
  const parsed = parseProductLink(input);
  if (parsed && parsed.ref.contentId) {
    return {
      ok: true,
      marketplaceCode: parsed.marketplaceCode,
      contentId: parsed.ref.contentId,
      url: parsed.ref.url ?? input.trim(),
    };
  }

  const parentRef = hepsiburadaParentRef(input);
  if (parentRef === null) return { ok: false, error: null };

  const variants = await trackedProductsRepo.findHepsiburadaVariantsByParent(appDb, parentRef);
  if (variants.length === 1) {
    const variant = variants[0]!;
    return {
      ok: true,
      marketplaceCode: 'hepsiburada',
      contentId: variant.productRef,
      url: variant.productUrl,
    };
  }
  return {
    ok: false,
    error:
      variants.length === 0
        ? PARENT_LINK_UNRESOLVED
        : `Bu ürün ailesinde takip edilen ${variants.length} varyant var; hangisi olduğu linkten anlaşılmıyor. Varyantı açıp linkini kopyalayın.`,
  };
}
