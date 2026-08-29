/**
 * `/tracked-products` screen's server-paged, server-filtered feed (doc 06 §12.2, R-UI-5).
 *
 * Two kinds of row now share this table, and the screen shows both: products the operator added
 * by pasting a link, and products a brand sweep discovered (api-references §1.7). They are
 * distinguished by `watchedBrandId`, not by a separate endpoint — an operator asking "who sells
 * this?" does not care which route put the row there.
 *
 * **Paged, unlike its first version.** That one read the whole table and then ran one
 * observation query per row. Correct for the handful of hand-added products it was written for;
 * fatal the moment a sweep puts thousands of rows in the same table (887 for Whiskas, 4,863 for
 * Royal Canin). Only the current page leaves the database, and only the current page is
 * enriched with its latest look.
 */
import { NextResponse } from 'next/server';
import { parseProductLink } from '@buybox/adapters';
import { brandReportsRepo, newId, trackedProductsRepo } from '@buybox/db';
import {
  exportHeaders,
  exportRow,
  resolveExportColumns,
} from '@/lib/tracked-product-columns';
import { withBrand } from '@/lib/product-name';
import { getAppDb } from '@/lib/server/db';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * Row cap for `?format=csv`. Mirrors `/api/listings`' own cap and exists for the same reason: an
 * export is a bounded convenience, not a database dump, and a brand can hold thousands of rows
 * (4,863 for Royal Canin).
 */
const CSV_EXPORT_LIMIT = 5000;

/**
 * How far back the price band looks when the caller does not say (`?periodDays=`).
 *
 * Thirty days because that is the span the audit asks about — "bu ay kim ne fiyata sattı" — and
 * because the deep scrape runs daily, so it is thirty looks rather than thirty rows.
 */
const DEFAULT_PERIOD_DAYS = 30;

/**
 * Ids per period-stats query. The band is one `GROUP BY` however many products it covers, but
 * the `IN` list is not free at 5,000 entries and some engines plan it badly past a few hundred,
 * so an export is chunked. This is the reason the period columns are exportable and the
 * per-row current-market ones are not: chunking turns 5,000 rows into 25 queries, not 5,000.
 */
const PERIOD_STATS_CHUNK = 200;

async function periodStatsFor(
  appDb: ReturnType<typeof getAppDb>,
  productIds: readonly string[],
  window: { sinceMs: number; untilMs: number },
): Promise<Map<string, brandReportsRepo.BrandProductPeriodStats>> {
  const merged = new Map<string, brandReportsRepo.BrandProductPeriodStats>();
  for (let i = 0; i < productIds.length; i += PERIOD_STATS_CHUNK) {
    const chunk = productIds.slice(i, i + PERIOD_STATS_CHUNK);
    for (const [id, stats] of await brandReportsRepo.trackedProductPeriodStats(appDb, chunk, window)) {
      merged.set(id, stats);
    }
  }
  return merged;
}

function csvEscape(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

/** `?flag=true|false`, absent meaning "any" — the tri-state the repository filters expect. */
function triState(params: URLSearchParams, key: string): boolean | undefined {
  const raw = params.get(key);
  if (raw === null || raw === '') return undefined;
  return raw === 'true';
}

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

const SORTS = ['label', 'ratingCount', 'categoryName', 'lastSweptAt', 'addedAt'] as const;
type Sort = (typeof SORTS)[number];

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const appDb = getAppDb();

  const rawSort = params.get('sort');
  const sort: Sort = SORTS.includes(rawSort as Sort) ? (rawSort as Sort) : 'label';
  const limit = Math.min(optionalInt(params, 'limit') ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = Math.max(optionalInt(params, 'offset') ?? 0, 0);

  const periodDays = Math.max(1, optionalInt(params, 'periodDays') ?? DEFAULT_PERIOD_DAYS);
  const untilMs = Date.now();
  const periodWindow = { sinceMs: untilMs - periodDays * 24 * 60 * 60 * 1000, untilMs };

  const filters = {
    watchedBrandId: optionalString(params, 'watchedBrandId'),
    marketplaceCode: optionalString(params, 'marketplaceCode'),
    text: optionalString(params, 'text'),
    categoryRef: optionalString(params, 'categoryRef'),
    isActive: triState(params, 'isActive'),
    searchTermOnly: params.get('searchTermOnly') === 'true',
    unratedOnly: params.get('unratedOnly') === 'true',
    minRatingCount: optionalInt(params, 'minRatingCount'),
    sort,
    sortDir: (params.get('sortDir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
  };

  if (params.get('format') === 'csv') {
    // The **whole filtered result**, not the page on screen — R-UI-13's "honouring the active
    // filters". Deliberately skips the per-row latest-look enrichment the grid does below: that
    // is one query per row, bounded to a page there, and running it over 5,000 rows would be
    // exactly the unbounded fan-out server paging exists to avoid. The current-market columns
    // stay an on-screen view.
    //
    // The **period band** is exported, because it is a different cost: one grouped query per
    // chunk of ids, not one per row. That distinction is the line `tracked-product-columns.ts`
    // draws, and it is what makes the export useful to an auditor rather than a catalogue dump.
    const { rows: csvRows } = await trackedProductsRepo.queryTrackedProducts(appDb, {
      ...filters,
      limit: CSV_EXPORT_LIMIT,
      offset: 0,
    });
    const csvPeriods = await periodStatsFor(
      appDb,
      csvRows.map((r) => r.id),
      periodWindow,
    );
    // The operator's own columns, in their own order — the grid sends what it is showing, so
    // hiding and reordering columns on screen changes the file too (R-UI-12 + R-UI-13 together).
    const columns = resolveExportColumns(params.get('columns')?.split(',').filter(Boolean));
    const lines = [exportHeaders(columns).map(csvEscape).join(',')];
    for (const row of csvRows) {
      // `Marka - Ürün Adı` in the file too, so the export and the grid cannot drift apart —
      // see `withBrand`. The separate `Marka` column still carries the bare brand.
      lines.push(
        exportRow(columns, {
          ...row,
          label: withBrand(row.label, row.brandName),
          period: csvPeriods.get(row.id) ?? null,
        })
          .map(csvEscape)
          .join(','),
      );
    }
    // BOM so Excel on Windows reads the Turkish characters as UTF-8 rather than guessing the
    // system codepage (mirrors `lib/csv.ts`'s client-side `downloadCsv`).
    return new NextResponse('\ufeff' + lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': 'attachment; filename="takip-edilen-urunler.csv"',
      },
    });
  }

  const { rows, total } = await trackedProductsRepo.queryTrackedProducts(appDb, {
    ...filters,
    limit,
    offset,
  });

  // Bounded by the page size, so this stays cheap regardless of how many products a brand has.
  const withLatest = await Promise.all(
    rows.map(async (row) => ({
      row,
      latest: await trackedProductsRepo.latestTrackedProductObservations(appDb, row.id),
    })),
  );
  // One query for the page, not one per row — see `periodStatsFor`.
  const periods = await periodStatsFor(
    appDb,
    rows.map((r) => r.id),
    periodWindow,
  );

  return NextResponse.json({
    total,
    limit,
    offset,
    periodDays,
    products: withLatest.map(({ row, latest }) => ({
      id: row.id,
      marketplaceCode: row.marketplaceCode,
      productRef: row.productRef,
      productUrl: row.productUrl,
      // `Marka - Ürün Adı` (customer feedback 2026-08-25) — see `withBrand`. The `brandName`
      // below stays the bare brand: the grid's own Marka column and the brand filter read it.
      label: withBrand(row.label, row.brandName),
      isActive: row.isActive,
      addedAt: row.addedAt,
      watchedBrandId: row.watchedBrandId ?? null,
      brandName: row.brandName ?? null,
      categoryRef: row.categoryRef ?? null,
      categoryName: row.categoryName ?? null,
      ratingCount: row.ratingCount ?? null,
      ratingAverage: row.ratingAverage ?? null,
      lastSweptAt: row.lastSweptAt ?? null,
      /**
       * When the deep scrape last looked — separate from the newest observation, which since
       * Faz 4 is only stored when something moved. A product that has held its price all week
       * has a week-old observation and a fresh `lastScrapedAt`, and the screen must be able to
       * say so rather than report it as unchecked.
       */
      lastScrapedAt: row.lastScrapedAt ?? null,
      period: (() => {
        const stats = periods.get(row.id);
        return stats
          ? {
              minPrice: stats.minPrice?.toString() ?? null,
              maxPrice: stats.maxPrice?.toString() ?? null,
              sellerCount: stats.sellerCount,
              changeCount: stats.changeCount,
            }
          : null;
      })(),
      // Which selector found it. A product the search term found and the brand id did not is
      // the brand-misuse shortlist (api-references §1.7), so the flags are surfaced rather
      // than collapsed into one "source" label.
      viaBrandRef: row.viaBrandRef ?? false,
      viaSearchTerm: row.viaSearchTerm ?? false,
      latest: latest.map((o) => ({
        status: o.status,
        rank: o.rank,
        sellerName: o.sellerName,
        price: o.price?.toString() ?? null,
        finalPrice: o.finalPrice?.toString() ?? null,
        observedAt: o.observedAt,
      })),
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { link?: string; label?: string };
  const link = (body.link ?? '').trim();
  if (!link) {
    return NextResponse.json({ error: 'Ürün linki gerekli.' }, { status: 400 });
  }
  const parsed = parseProductLink(link);
  if (!parsed || !parsed.ref.contentId) {
    return NextResponse.json(
      { error: 'Link tanınamadı. Trendyol veya Hepsiburada ürün sayfası linki yapıştırın.' },
      { status: 400 },
    );
  }

  const appDb = getAppDb();
  const existing = await trackedProductsRepo.findTrackedProductByRef(
    appDb,
    parsed.marketplaceCode,
    parsed.ref.contentId,
  );
  if (existing) {
    return NextResponse.json({ error: 'Bu ürün zaten takip listesinde.' }, { status: 409 });
  }

  const id = newId();
  await trackedProductsRepo.addTrackedProduct(appDb, {
    id,
    marketplaceCode: parsed.marketplaceCode,
    productRef: parsed.ref.contentId,
    productUrl: parsed.ref.url ?? link,
    label: (body.label ?? '').trim() || link,
    isActive: true,
    addedAt: Date.now(),
  });
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli.' }, { status: 400 });
  await trackedProductsRepo.deleteTrackedProduct(getAppDb(), id);
  return NextResponse.json({ ok: true });
}

/**
 * Bulk activate / deactivate — what the dead-product suggestion applies, and what undoes it.
 *
 * Deactivation rather than deletion, on purpose: "the marketplace has never recorded a rating"
 * is a proxy for "nobody buys this", not proof of it, so the decision it drives has to be
 * reversible. The row and its history stay exactly where they were.
 */
export async function PATCH(request: Request) {
  const body = (await request.json()) as { ids?: string[]; isActive?: boolean };
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ error: 'En az bir ürün seçin.' }, { status: 400 });
  if (typeof body.isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive gerekli.' }, { status: 400 });
  }

  await trackedProductsRepo.setTrackedProductsActive(getAppDb(), ids, body.isActive);
  return NextResponse.json({ ok: true, updated: ids.length });
}
