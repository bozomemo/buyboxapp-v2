import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPORT_COLUMNS,
  exportHeaders,
  exportRow,
  resolveExportColumns,
  type ExportableProduct,
} from './tracked-product-columns';

const ROW: ExportableProduct = {
  label: 'Biftekli Yetişkin Kedi Maması 3,8 Kg',
  brandName: 'Whiskas',
  categoryName: 'Kedi Kuru Maması',
  marketplaceCode: 'trendyol',
  productRef: '2250165',
  ratingCount: 219,
  ratingAverage: 4.6758,
  viaBrandRef: true,
  viaSearchTerm: true,
  watchedBrandId: 'b1',
  isActive: true,
  lastSweptAt: Date.UTC(2026, 7, 28),
  addedAt: Date.UTC(2026, 7, 27),
};

describe('resolveExportColumns', () => {
  it('keeps the caller’s order', () => {
    // The whole point: an operator who reordered the grid gets that order in the file.
    expect(resolveExportColumns(['category', 'label'])).toEqual(['category', 'label']);
  });

  it('keeps only the columns the caller asked for', () => {
    expect(resolveExportColumns(['label'])).toEqual(['label']);
  });

  it('drops unknown ids rather than failing', () => {
    // A stale bookmark or an older build should still produce a usable file.
    expect(resolveExportColumns(['label', 'nonsense'])).toEqual(['label']);
  });

  it('drops the per-row competitive columns', () => {
    // Those come from a query per row, bounded to one page on screen. Exporting them across
    // 5,000 rows is the fan-out server paging exists to avoid.
    expect(resolveExportColumns(['label', 'sellerCount', 'buyboxPrice', 'buyboxSeller'])).toEqual(['label']);
  });

  it('falls back to the default set when nothing resolves', () => {
    // An empty CSV is never what anyone meant.
    expect(resolveExportColumns(['sellerCount'])).toEqual([...DEFAULT_EXPORT_COLUMNS]);
    expect(resolveExportColumns([])).toEqual([...DEFAULT_EXPORT_COLUMNS]);
    expect(resolveExportColumns(undefined)).toEqual([...DEFAULT_EXPORT_COLUMNS]);
  });
});

describe('exportHeaders / exportRow', () => {
  it('emits headers and values in the same order', () => {
    const columns = resolveExportColumns(['category', 'label', 'rating']);
    expect(exportHeaders(columns)).toEqual(['Kategori', 'Ürün', 'Değerlendirme']);
    expect(exportRow(columns, ROW)).toEqual([
      'Kedi Kuru Maması',
      'Biftekli Yetişkin Kedi Maması 3,8 Kg',
      '219',
    ]);
  });

  it('writes a genuine zero rating as 0 and an unreadable one as empty', () => {
    // A spreadsheet cannot tell the two apart once both are zero, so they must not both be zero.
    const columns = resolveExportColumns(['rating']);
    expect(exportRow(columns, { ...ROW, ratingCount: 0 })).toEqual(['0']);
    expect(exportRow(columns, { ...ROW, ratingCount: null })).toEqual(['']);
  });

  it('labels how each product was discovered', () => {
    const columns = resolveExportColumns(['discovery']);
    expect(exportRow(columns, { ...ROW, viaBrandRef: false, viaSearchTerm: true })).toEqual(['sadece arama']);
    expect(
      exportRow(columns, { ...ROW, viaBrandRef: false, viaSearchTerm: false, watchedBrandId: null }),
    ).toEqual(['elle eklendi']);
  });

  it('writes timestamps as ISO, and an absent one as empty', () => {
    const columns = resolveExportColumns(['lastSwept']);
    expect(exportRow(columns, ROW)).toEqual(['2026-08-28T00:00:00.000Z']);
    expect(exportRow(columns, { ...ROW, lastSweptAt: null })).toEqual(['']);
  });

  it('rounds the rating average rather than emitting full float noise', () => {
    expect(exportRow(resolveExportColumns(['ratingAverage']), ROW)).toEqual(['4.68']);
  });
});

describe('reference price column', () => {
  it('writes the brand list price as plain major units, never through a float', () => {
    const columns = resolveExportColumns(['referencePrice']);
    expect(exportHeaders(columns)).toEqual(['Tavsiye Fiyat']);
    expect(exportRow(columns, { ...ROW, referencePrice: 1249_90n })).toEqual(['1249.90']);
  });

  /**
   * A product with no published price is not a product priced at zero. Exported as empty for the
   * same reason an unread rating is: a spreadsheet cannot tell the two apart once both are `0`.
   */
  it('writes a product with no published price as empty rather than 0.00', () => {
    const columns = resolveExportColumns(['referencePrice']);
    expect(exportRow(columns, { ...ROW, referencePrice: null })).toEqual(['']);
    expect(exportRow(columns, ROW)).toEqual(['']);
  });

  it('is exportable, unlike the current-market columns beside it', () => {
    expect(resolveExportColumns(['referencePrice', 'buyboxPrice'])).toEqual(['referencePrice']);
    expect(DEFAULT_EXPORT_COLUMNS).toContain('referencePrice');
  });
});
