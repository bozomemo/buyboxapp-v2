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
