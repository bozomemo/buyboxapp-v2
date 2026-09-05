/**
 * The one definition of what each tracked-products column is called and what it contains — used
 * by the grid to render and by the CSV route to export (R-UI-12, R-UI-13).
 *
 * Shared because the export must honour the operator's own column choice: the grid sends its
 * visible column ids, in its display order, and the route emits exactly those. A second list
 * living in the route would mean an operator who hid three columns and reordered the rest still
 * got the original twelve in the original order, which is the failure R-UI-13's "what the grid
 * currently shows" exists to prevent.
 *
 * What is exportable is drawn along one line, and it is a cost line rather than an importance
 * one. A column is exportable when its value comes from the **row itself or from one aggregate
 * query over the whole set** — the catalogue data a sweep produces, and the period price band,
 * which is a single `GROUP BY` however many products are in it (`brand-reports.ts`).
 *
 * A column is **not** exportable when its value needs the latest look *per row*: `sellerCount`,
 * `medianPrice`, `spreadPct`, `buyboxPrice`, `buyboxSeller`. That is one query per row, bounded
 * to a page on screen and unbounded across a 5,000-row export — exactly the fan-out server
 * paging exists to avoid. Asking for one yields an empty column rather than a slow request; see
 * `EXPORTABLE`. If the current market ever has to be exported, the fix is to store a per-look
 * summary at write time, not to run the per-row query 5,000 times here.
 */
import { discoveryLabel } from './tracked-product-discovery';

export type TrackedColumnId =
  | 'label'
  | 'brand'
  | 'category'
  | 'marketplace'
  | 'productRef'
  | 'rating'
  | 'ratingAverage'
  | 'sellerCount'
  | 'medianPrice'
  | 'spreadPct'
  | 'buyboxPrice'
  | 'buyboxSeller'
  | 'periodMinPrice'
  | 'periodMaxPrice'
  | 'periodSellerCount'
  | 'referencePrice'
  | 'discovery'
  | 'lastSwept'
  | 'lastScraped'
  | 'addedAt';

/** The row shape the export reads — a `TrackedProductRow` plus nothing. */
export interface ExportableProduct {
  readonly label: string;
  readonly brandName?: string | null;
  readonly categoryName?: string | null;
  readonly marketplaceCode: string;
  readonly productRef: string;
  readonly ratingCount?: number | null;
  readonly ratingAverage?: number | null;
  readonly viaBrandRef?: boolean;
  readonly viaSearchTerm?: boolean;
  readonly watchedBrandId?: string | null;
  readonly isActive: boolean;
  readonly lastSweptAt?: number | null;
  /** When the deep scrape last *looked*, which since Faz 4 is not when it last stored a look. */
  readonly lastScrapedAt?: number | null;
  readonly addedAt: number;
  /**
   * The window's price band, from `brandReportsRepo.trackedProductPeriodStats`. Absent when the
   * product had no successful look in the window — rendered empty, never as a zero band.
   */
  readonly period?: {
    readonly minPrice: bigint | null;
    readonly maxPrice: bigint | null;
    readonly sellerCount: number;
  } | null;
  /**
   * The brand's own published price, in kuruş. Exportable — unlike the current-market columns —
   * because it comes off the row itself and costs no per-row query.
   */
  readonly referencePrice?: bigint | null;
}

interface ColumnSpec {
  readonly header: string;
  readonly value: (row: ExportableProduct) => string;
}

/**
 * Kuruş as plain major units — `4990` becomes `49.90`, with no currency symbol and no thousands
 * separator, matching `/api/listings`' export so one spreadsheet can hold both.
 *
 * Divided as `bigint` rather than through `Number(kurus) / 100`: the display formatter may take
 * that shortcut safely for realistic prices, but an export is data, and money never routes
 * through a float in this system. Empty for an unknown amount — a spreadsheet cannot tell
 * `0.00` from "we do not know".
 */
function money(value: bigint | null | undefined): string {
  if (value === null || value === undefined) return '';
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const minor = (magnitude % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${magnitude / 100n}.${minor}`;
}

/** ISO, not a Turkish-formatted date: a CSV is data, and Excel parses ISO unambiguously. */
function isoOrEmpty(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? '' : new Date(ms).toISOString();
}

const EXPORTABLE: Readonly<Record<TrackedColumnId, ColumnSpec | null>> = {
  label: { header: 'Ürün', value: (r) => r.label },
  brand: { header: 'Marka', value: (r) => r.brandName ?? '' },
  category: { header: 'Kategori', value: (r) => r.categoryName ?? '' },
  marketplace: { header: 'Pazaryeri', value: (r) => r.marketplaceCode },
  productRef: { header: 'Ürün Kodu', value: (r) => r.productRef },
  rating: {
    header: 'Değerlendirme',
    // Empty, not `0`: the marketplace reporting no ratings and us failing to read them are
    // different facts, and a spreadsheet cannot tell them apart once both are zero.
    value: (r) => (r.ratingCount === null || r.ratingCount === undefined ? '' : String(r.ratingCount)),
  },
  ratingAverage: { header: 'Puan', value: (r) => r.ratingAverage?.toFixed(2) ?? '' },
  // Major units, no symbol — see `money`.
  periodMinPrice: { header: 'Dönem En Düşük', value: (r) => money(r.period?.minPrice) },
  periodMaxPrice: { header: 'Dönem En Yüksek', value: (r) => money(r.period?.maxPrice) },
  periodSellerCount: {
    header: 'Dönem Satıcı Sayısı',
    // Empty rather than `0` when the product had no look at all in the window: "nobody sold it"
    // and "we never looked" are different findings and must not render the same.
    value: (r) => (r.period ? String(r.period.sellerCount) : ''),
  },
  referencePrice: { header: 'Tavsiye Fiyat', value: (r) => money(r.referencePrice) },
  discovery: { header: 'Bulunma', value: (r) => discoveryLabel(r) },
  lastSwept: { header: 'Son Tarama', value: (r) => isoOrEmpty(r.lastSweptAt) },
  lastScraped: { header: 'Son Bakış', value: (r) => isoOrEmpty(r.lastScrapedAt) },
  addedAt: { header: 'Eklenme', value: (r) => isoOrEmpty(r.addedAt) },
  // Per-row queries; see the module doc comment.
  sellerCount: null,
  medianPrice: null,
  spreadPct: null,
  buyboxPrice: null,
  buyboxSeller: null,
};

/** Columns emitted when the caller names none — every exportable one, in display order. */
export const DEFAULT_EXPORT_COLUMNS: readonly TrackedColumnId[] = [
  'label',
  'brand',
  'category',
  'marketplace',
  'productRef',
  'rating',
  'ratingAverage',
  'periodMinPrice',
  'periodMaxPrice',
  'periodSellerCount',
  'referencePrice',
  'discovery',
  'lastSwept',
  'lastScraped',
  'addedAt',
];

/**
 * Resolves a caller-supplied column list to the exportable ones, in the order given.
 *
 * Unknown ids and non-exportable ones are dropped rather than rejected: a stale bookmark or a
 * column list from an older build should still produce a usable file. A request that resolves to
 * nothing falls back to the default set, because an empty CSV is never what anyone meant.
 */
export function resolveExportColumns(requested: readonly string[] | undefined): TrackedColumnId[] {
  if (!requested || requested.length === 0) return [...DEFAULT_EXPORT_COLUMNS];
  const resolved = requested.filter(
    (id): id is TrackedColumnId => (EXPORTABLE as Record<string, ColumnSpec | null>)[id] != null,
  );
  return resolved.length === 0 ? [...DEFAULT_EXPORT_COLUMNS] : resolved;
}

export function exportHeaders(columns: readonly TrackedColumnId[]): string[] {
  return columns.map((id) => EXPORTABLE[id]!.header);
}

export function exportRow(columns: readonly TrackedColumnId[], row: ExportableProduct): string[] {
  return columns.map((id) => EXPORTABLE[id]!.value(row));
}
