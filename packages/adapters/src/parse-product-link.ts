/**
 * Turns a product link an operator pasted into `ProductPageRef` + which marketplace it belongs
 * to (doc 06 §12.2, customer feedback 2026-08-25: "sadece ürün linki ile ekleme yapılabilmeli").
 * Pure and offline — no request is made here; parsing is a precondition for one, not a
 * substitute.
 *
 * Both marketplaces address a product page as `.../{slug}-p-{id}` (Trendyol:
 * `https://www.trendyol.com/marka/urun-p-757251065`, api-references §1.6 /
 * trendyol-merchants-scraping-guide.md; Hepsiburada: `https://www.hepsiburada.com/a4tech-xl-750bh-oyun-p-BS1372`,
 * api-references §2.11) — the slug before `-p-` is display text and is discarded; only the id
 * after it is a stable identity (CLAUDE.md: "never derive identity from display text").
 */
import type { MarketplaceCode } from '@buybox/core';
import type { ProductPageRef } from './ports/competitor-source.js';

export interface ParsedProductLink {
  readonly marketplaceCode: MarketplaceCode;
  readonly ref: ProductPageRef;
}

const TRENDYOL_HOSTS = new Set(['www.trendyol.com', 'trendyol.com']);
const HEPSIBURADA_HOSTS = new Set(['www.hepsiburada.com', 'hepsiburada.com']);

/** Trendyol's id is purely numeric; Hepsiburada's SKU is alphanumeric (e.g. `BS1372`). */
const TRENDYOL_ID = /-p-(\d+)(?:[/?#]|$)/;
const HEPSIBURADA_ID = /-p-([A-Za-z0-9]+)(?:[/?#]|$)/;

/** Returns `null` for anything not recognisably a Trendyol/Hepsiburada product page — never
 * throws, since this runs on operator-pasted text of unknown shape. */
export function parseProductLink(input: string): ParsedProductLink | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // A path with no host is what this app's own screens show for a tracked product (the sweep
  // stores `/{marka}/{slug}-p-{id}?boutiqueId=…`), so it is what an operator copies out of one.
  // The id says which marketplace: Trendyol's is purely numeric, Hepsiburada's SKU starts `HB`.
  // Refused before 2026-09-25 by every link field except the Excel import's.
  if (trimmed.startsWith('/')) {
    const trendyol = parseProductLinkForMarketplace(trimmed, 'trendyol');
    if (trendyol.ok)
      return { marketplaceCode: 'trendyol', ref: { url: trendyol.url, contentId: trendyol.contentId } };
    const hepsiburada = parseProductLinkForMarketplace(trimmed, 'hepsiburada');
    if (hepsiburada.ok && /^HB/i.test(hepsiburada.contentId)) {
      return {
        marketplaceCode: 'hepsiburada',
        ref: { url: hepsiburada.url, contentId: hepsiburada.contentId },
      };
    }
    return null;
  }

  let url: URL;
  try {
    // A bare "trendyol.com/..." without a scheme is a plausible paste; try once with a scheme
    // prepended before giving up, rather than rejecting anything the operator didn't prefix.
    url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (TRENDYOL_HOSTS.has(url.hostname)) {
    const match = TRENDYOL_ID.exec(url.pathname);
    if (!match) return null;
    return {
      marketplaceCode: 'trendyol',
      ref: { url: url.toString(), contentId: match[1]! },
    };
  }
  if (HEPSIBURADA_HOSTS.has(url.hostname)) {
    const match = HEPSIBURADA_ID.exec(url.pathname);
    if (!match) return null;
    return {
      marketplaceCode: 'hepsiburada',
      ref: { url: url.toString(), contentId: match[1]! },
    };
  }
  return null;
}

/**
 * Why a link could not be read as a product of the marketplace its column names (doc 17 §3.2).
 *
 * The Excel import reports one of these per row rather than "link tanınamadı", because the three
 * are different mistakes with different fixes: a link in the wrong column is a copy-paste slip, a
 * Hepsiburada `-pm-` link is the *parent product* rather than the variant that is sold
 * (api-references §2.13), and everything else is a link this parser does not recognise at all.
 */
export type ProductLinkProblem = 'empty' | 'wrongMarketplace' | 'parentProduct' | 'unrecognised';

export type ParsedLinkForMarketplace =
  | { readonly ok: true; readonly contentId: string; readonly url: string }
  | {
      readonly ok: false;
      readonly problem: ProductLinkProblem;
      /** Hepsiburada's parent-product id, for `parentProduct` — enough to find a tracked variant. */
      readonly parentRef?: string;
    };

/** Hepsiburada's parent-product form (`/{slug}-pm-{productId}`, api-references §2.13). */
const HEPSIBURADA_PARENT = /-pm-([A-Za-z0-9]+)(?:[/?#]|$)/;

/**
 * The parent-product id of a Hepsiburada `-pm-` link — absolute, host-less or a bare path — or
 * `null` when the text is not one. Every Hepsiburada row this app's own sweep writes stores this
 * form (254 of 254 on 2026-09-25), so a caller that can look the parent up in `tracked_products`
 * should, rather than refuse the link the operator copied from our own screen.
 */
export function hepsiburadaParentRef(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const parsed = parseProductLinkForMarketplace(trimmed, 'hepsiburada');
  return !parsed.ok && parsed.problem === 'parentProduct' ? (parsed.parentRef ?? null) : null;
}

/**
 * Reads a link **against the marketplace its column already names**, which is what the Excel
 * import has and a pasted-anywhere field does not.
 *
 * That extra knowledge buys two things `parseProductLink` cannot have. A **relative path** is
 * readable — `/{marka}/{slug}-p-{id}?boutiqueId=…`, which is the form this app's own sweep
 * stores for 7,308 of the live install's 7,309 tracked rows (api-references §1.6) and therefore
 * the form an operator copying out of one of our own screens will paste. And a link whose host
 * belongs to the *other* marketplace is a distinguishable mistake rather than an unreadable one.
 *
 * The query string is dropped from the identity in both cases: `boutiqueId` and `merchantId`
 * name a boutique and a seller, never the product.
 */
export function parseProductLinkForMarketplace(
  input: string,
  marketplaceCode: MarketplaceCode,
): ParsedLinkForMarketplace {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, problem: 'empty' };

  const hosts = marketplaceCode === 'trendyol' ? TRENDYOL_HOSTS : HEPSIBURADA_HOSTS;
  const otherHosts = marketplaceCode === 'trendyol' ? HEPSIBURADA_HOSTS : TRENDYOL_HOSTS;

  let url: URL;
  try {
    // A leading `/` is a path, not a host: resolve it against the marketplace's own origin
    // rather than letting `new URL` read the first segment as a hostname.
    const absolute = /^[a-z]+:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.startsWith('/')
        ? `https://${marketplaceCode === 'trendyol' ? 'www.trendyol.com' : 'www.hepsiburada.com'}${trimmed}`
        : `https://${trimmed}`;
    url = new URL(absolute);
  } catch {
    return { ok: false, problem: 'unrecognised' };
  }

  if (otherHosts.has(url.hostname)) return { ok: false, problem: 'wrongMarketplace' };
  if (!hosts.has(url.hostname)) return { ok: false, problem: 'unrecognised' };

  const parent = marketplaceCode === 'hepsiburada' ? HEPSIBURADA_PARENT.exec(url.pathname) : null;
  if (parent) return { ok: false, problem: 'parentProduct', parentRef: parent[1]! };

  const match = (marketplaceCode === 'trendyol' ? TRENDYOL_ID : HEPSIBURADA_ID).exec(url.pathname);
  if (!match) return { ok: false, problem: 'unrecognised' };
  return { ok: true, contentId: match[1]!, url: url.toString() };
}
