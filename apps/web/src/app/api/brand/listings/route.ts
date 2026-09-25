/**
 * İlanlar (`/brand/listings`) — the cards the brand manager actually watches (doc 17 §4.1).
 *
 * A card is here when it is **linked to a brand product** or **marked favourite**, which is the
 * same predicate `SweepListedProducts` walks (doc 07 §7.5): the screen lists exactly the rows
 * that lane keeps fresh, so "son bakış" on a row and the İlanlar pass on the Jobs screen are
 * talking about the same work.
 *
 * Why this is not just `/api/tracked-products?listedOnly=true`: that screen answers "who sells
 * this product?" over a whole catalogue, and its columns are the market's (rating, spread,
 * period band). This one answers "is the buybox inside my band?", so every row carries the band
 * its brand product states, the card's multiplier, and the verdict — and a favourite with no
 * link carries none of them, deliberately, because it has no PSF to be judged against.
 *
 * Paged for the same reason as its sibling: İlanlar is small by design, but nothing enforces
 * that, and a favourite star is one click.
 */
import { NextResponse } from 'next/server';
import { effectiveBand, evaluateBand, unitPriceForDisplay, type BandEvaluation } from '@buybox/core';
import { brandProductsRepo, trackedProductsRepo } from '@buybox/db';
import { marketSnapshot } from '@/lib/market-stats';
import { withBrand } from '@/lib/product-name';
import { getAppDb } from '@/lib/server/db';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
/** An export is a bounded convenience, not a dump — the same cap `/api/tracked-products` uses. */
const CSV_EXPORT_LIMIT = 5000;

const SORTS = ['label', 'ratingCount', 'categoryName', 'lastSweptAt', 'addedAt'] as const;
type Sort = (typeof SORTS)[number];

function optionalString(params: URLSearchParams, key: string): string | undefined {
  const raw = params.get(key);
  return raw === null || raw.trim() === '' ? undefined : raw.trim();
}

function optionalInt(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function csvEscape(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

/** Kuruş bigint → the `1234,56` a Turkish spreadsheet reads as a number. */
function csvMoney(value: bigint | null): string {
  if (value === null) return '';
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? '-' : ''}${abs / 100n},${String(abs % 100n).padStart(2, '0')}`;
}

const STATUS_LABELS: Record<BandEvaluation['status'], string> = {
  inBand: 'Aralıkta',
  belowMin: 'Min altında',
  aboveMax: 'Max üstünde',
  unknown: 'Bilinmiyor',
};

/**
 * One İlanlar row: the card, its latest look, and — when it is linked — the band it is held to.
 *
 * Amounts cross as decimal strings, the way every other route carries kuruş.
 */
interface ListingRow {
  id: string;
  marketplaceCode: string;
  productRef: string;
  productUrl: string | null;
  label: string;
  isActive: boolean;
  isFavourite: boolean;
  lastScrapedAt: number | null;
  sellerCount: number;
  buyboxSeller: string | null;
  buyboxPrice: string | null;
  /** Which field the band was judged on — the screen marks a coupon price as such (§5.1). */
  buyboxPriceSource: BandEvaluation['priceSource'];
  unitPrice: string | null;
  brandProduct: { id: string; name: string; unitMultiplier: number; isPrimary: boolean } | null;
  /** Per **unit**, so they read beside `unitPrice`. `null` on an unlinked favourite. */
  referencePrice: string | null;
  minPrice: string | null;
  upperBound: string | null;
  upperBoundIsReferencePrice: boolean;
  /** The card-scaled bound the verdict used — what a violation will store from 11.6. */
  cardUpperBound: string | null;
  cardMinPrice: string | null;
  bandStatus: BandEvaluation['status'];
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const appDb = getAppDb();

  const rawSort = params.get('sort');
  const sort: Sort = SORTS.includes(rawSort as Sort) ? (rawSort as Sort) : 'label';
  const isCsv = params.get('format') === 'csv';
  const limit = isCsv
    ? CSV_EXPORT_LIMIT
    : Math.min(optionalInt(params, 'limit') ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = isCsv ? 0 : Math.max(optionalInt(params, 'offset') ?? 0, 0);

  const { rows, total } = await trackedProductsRepo.queryTrackedProducts(appDb, {
    listedOnly: true,
    marketplaceCode: optionalString(params, 'marketplaceCode'),
    text: optionalString(params, 'text'),
    isActive:
      params.get('isActive') === 'false' ? false : params.get('isActive') === 'true' ? true : undefined,
    sort,
    sortDir: params.get('sortDir') === 'desc' ? 'desc' : 'asc',
    limit,
    offset,
  });

  const links = await brandProductsRepo.cardLinksForTrackedProducts(
    appDb,
    rows.map((r) => r.id),
  );

  // Bounded by the page size (or the export cap), like the tracked-products grid's own
  // enrichment — İlanlar is tens of rows by design, not thousands.
  const withLatest = await Promise.all(
    rows.map(async (row) => ({
      row,
      latest: await trackedProductsRepo.latestTrackedProductObservations(appDb, row.id),
    })),
  );

  const listings: ListingRow[] = withLatest.map(({ row, latest }) => {
    const market = marketSnapshot(
      latest.map((o) => ({
        status: o.status,
        rank: o.rank,
        sellerName: o.sellerName,
        price: o.price?.toString() ?? null,
      })),
    );
    const link = links.get(row.id);
    const buybox = latest.find((o) => o.status === 'ok' && o.rank === 1) ?? null;

    /**
     * An unlinked favourite has no PSF, so it has no band and therefore no verdict — doc 17
     * §4.1 says its band columns show _—_ rather than a status. `evaluateBand` and
     * `effectiveBand` are only ever asked about a linked card.
     */
    const prices =
      link === undefined
        ? null
        : { referencePrice: link.referencePrice, minPrice: link.minPrice, maxPrice: link.maxPrice };
    const band: BandEvaluation | null =
      prices === null
        ? null
        : evaluateBand(
            prices,
            link!.unitMultiplier,
            buybox === null ? null : { price: buybox.price, finalPrice: buybox.finalPrice },
          );
    const unit = prices === null ? null : effectiveBand(prices);
    // The card's own price, judged or merely observed: the band's when there is one (it applied
    // the finalPrice rule), the market snapshot's buybox otherwise.
    const cardPrice = band?.observedPrice ?? market.buyboxPrice;

    return {
      id: row.id,
      marketplaceCode: row.marketplaceCode,
      productRef: row.productRef,
      productUrl: row.productUrl ?? null,
      label: withBrand(row.label, row.brandName),
      isActive: row.isActive,
      isFavourite: row.isFavourite ?? false,
      lastScrapedAt: row.lastScrapedAt ?? null,
      sellerCount: market.sellerCount,
      buyboxSeller: market.buyboxSeller,
      buyboxPrice: cardPrice?.toString() ?? null,
      buyboxPriceSource: band?.priceSource ?? null,
      // Display only, and only where there is a multiplier to divide by (doc 17 §4.1).
      unitPrice:
        cardPrice === null || link === undefined
          ? null
          : unitPriceForDisplay(cardPrice, link.unitMultiplier).toString(),
      brandProduct: link
        ? {
            id: link.brandProductId,
            name: link.brandProductName,
            unitMultiplier: link.unitMultiplier,
            isPrimary: link.isPrimary,
          }
        : null,
      referencePrice: link?.referencePrice.toString() ?? null,
      minPrice: link?.minPrice?.toString() ?? null,
      upperBound: unit?.upper.toString() ?? null,
      upperBoundIsReferencePrice: unit?.upperIsReferencePrice ?? false,
      cardUpperBound: band?.band.upper.toString() ?? null,
      cardMinPrice: band?.band.lower?.toString() ?? null,
      bandStatus: band?.status ?? 'unknown',
    };
  });

  if (isCsv) {
    const headers = [
      'Pazaryeri',
      'Kart',
      'Ürün Kodu',
      'Stok Ürünü',
      'Çarpan',
      'Buybox Satıcı',
      'Buybox Fiyat',
      'Birim Fiyat',
      'PSF',
      'Min',
      'Üst Sınır',
      'Bant Durumu',
      'Satıcı Sayısı',
      'Son Bakış',
    ];
    const lines = [headers.map(csvEscape).join(',')];
    for (const row of listings) {
      lines.push(
        [
          row.marketplaceCode,
          row.label,
          row.productRef,
          row.brandProduct?.name ?? '',
          row.brandProduct ? `x${row.brandProduct.unitMultiplier}` : '',
          row.buyboxSeller ?? '',
          csvMoney(row.buyboxPrice === null ? null : BigInt(row.buyboxPrice)),
          csvMoney(row.unitPrice === null ? null : BigInt(row.unitPrice)),
          csvMoney(row.referencePrice === null ? null : BigInt(row.referencePrice)),
          csvMoney(row.minPrice === null ? null : BigInt(row.minPrice)),
          csvMoney(row.upperBound === null ? null : BigInt(row.upperBound)),
          row.brandProduct ? STATUS_LABELS[row.bandStatus] : '',
          row.sellerCount,
          row.lastScrapedAt === null ? '' : new Date(row.lastScrapedAt).toISOString(),
        ]
          .map(csvEscape)
          .join(','),
      );
    }
    // BOM so Excel on Windows reads the Turkish characters as UTF-8 rather than guessing.
    return new NextResponse('﻿' + lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': 'attachment; filename="ilanlar.csv"',
      },
    });
  }

  return NextResponse.json({ total, limit, offset, listings });
}
