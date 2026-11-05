// @vitest-environment node
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseCommissionTariffFile } from './commission-tariff-import';

/**
 * The workbook's layout as Trendyol exports it (the product owner's sample, 2026-11-02): the four
 * commission columns appear **twice**, once per tariff period, under identical headers.
 */
const HEADERS = [
  'ÜRÜN İSMİ',
  'BARKOD',
  'SATICI STOK KODU',
  'MARKA',
  '1.Fiyat Alt Limit',
  '2.Fiyat Üst Limiti',
  '2.Fiyat Alt Limit',
  '3.Fiyat Üst Limiti',
  '3.Fiyat Alt Limit',
  '4.Fiyat Üst Limiti',
  'Tarih aralığı (3 Gün)',
  '1.KOMİSYON',
  '2.KOMİSYON',
  '3.KOMİSYON',
  '4.KOMİSYON',
  'Tarih aralığı (4 Gün)',
  '1.KOMİSYON',
  '2.KOMİSYON',
  '3.KOMİSYON',
  '4.KOMİSYON',
  'GÜNCEL KOMİSYON',
];

const LIMITS = [4266.6, 4266.59, 3613.6, 3613.59, 3135.65, 3135.64];
const NOV_2_2026 = Date.UTC(2026, 10, 2, 9, 0);

type Cell = string | number | null;

function row(
  barcode: Cell,
  stockCode: Cell,
  rest: { limits?: Cell[]; threeDay?: Cell[]; fourDay?: Cell[] } = {},
): Cell[] {
  return [
    'Indoor Entree 4,5 Kg',
    barcode,
    stockCode,
    'Acana',
    ...(rest.limits ?? LIMITS),
    ...(rest.threeDay ?? [null, null, null, null, null]),
    ...(rest.fourDay ?? ['1 Kasım 08.00-5 Kasım 07.59', 16.5, 6.2, 2.8, 2.7]),
    16.5,
  ];
}

async function xlsx(rows: Cell[][]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('KomisyonTarifeleriÜrünleri');
  sheet.addRow(HEADERS);
  for (const r of rows) sheet.addRow(r);
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
}

async function parse(rows: Cell[][]) {
  return parseCommissionTariffFile({ fileBase64: await xlsx(rows), fileName: 'tarife.xlsx' }, NOV_2_2026);
}

describe('parseCommissionTariffFile', () => {
  it('reads the sample layout: the second period block, tiers in kuruş, key without the leading zero', async () => {
    const result = await parse([row('064992714512', '064992714512')]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.problems).toEqual([]);
    expect(result.products).toBe(1);
    // Barcode and stock code fold to the same key, so one tariff, not two.
    expect(result.tariffs).toHaveLength(1);
    expect(result.tariffs[0]).toMatchObject({
      productKey: '64992714512',
      barcode: '064992714512',
      validFrom: Date.UTC(2026, 10, 1, 5, 0),
      validUntil: Date.UTC(2026, 10, 5, 5, 0),
      tiers: [
        { minPrice: 426660n, maxPrice: null, rate: 16.5 },
        { minPrice: 361360n, maxPrice: 426659n, rate: 6.2 },
        { minPrice: 313565n, maxPrice: 361359n, rate: 2.8 },
        { minPrice: null, maxPrice: 313564n, rate: 2.7 },
      ],
    });
    expect(result.periods).toEqual([
      { validFrom: Date.UTC(2026, 10, 1, 5, 0), validUntil: Date.UTC(2026, 10, 5, 5, 0) },
    ]);
  });

  it('keys a row under both codes when the barcode is a marketplace-generated one', async () => {
    const result = await parse([row('TYBX3YONHM41DQ1W03', '064992714444')]);
    expect(result.ok && result.tariffs.map((t) => t.productKey).sort()).toEqual([
      '64992714444',
      'TYBX3YONHM41DQ1W03',
    ]);
  });

  it('reads both periods when both blocks are filled', async () => {
    const result = await parse([
      row('8690000000001', null, { threeDay: ['29 Ekim 08.00-1 Kasım 07.59', 15, 6, 3, 2.5] }),
    ]);
    expect(result.ok && result.tariffs.map((t) => t.validFrom)).toEqual([
      Date.UTC(2026, 9, 29, 5, 0),
      Date.UTC(2026, 10, 1, 5, 0),
    ]);
  });

  it.each([
    [
      'an unreadable period',
      row('8690000000001', null, { fourDay: ['geçen hafta', 16.5, 6.2, 2.8, 2.7] }),
      /Tarih aralığı okunamadı/,
    ],
    [
      'a missing rate',
      row('8690000000001', null, { fourDay: ['1 Kasım 08.00-5 Kasım 07.59', 16.5, null, 2.8, 2.7] }),
      /Komisyon oranlarından/,
    ],
    [
      'limits out of order',
      row('8690000000001', null, { limits: [4266.6, 4266.59, 4500, 3613.59, 3135.65, 3135.64] }),
      /sıralı değil/,
    ],
    [
      'a limit with three decimals',
      row('8690000000001', null, { limits: [4266.6, 4266.59, 3613.6, 3613.59, 3135.655, 3135.64] }),
      /Fiyat limitlerinden/,
    ],
    ['no code at all', row(null, null), /Barkod ve satıcı stok kodu boş/],
  ])('reports %s as a problem row and writes nothing for it', async (_name, bad, message) => {
    const result = await parse([bad, row('8690000000002', null)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.line).toBe(2);
    expect(result.problems[0]!.message).toMatch(message);
    expect(result.tariffs.map((t) => t.productKey)).toEqual(['8690000000002']);
  });

  it('refuses the same product twice in one period on the later line', async () => {
    const result = await parse([row('8690000000001', null), row('08690000000001', null)]);
    expect(result.ok && result.tariffs).toHaveLength(1);
    expect(result.ok && result.problems).toEqual([
      { line: 3, message: 'Bu ürün bu dönem için 2. satırda da var.' },
    ]);
  });

  it('refuses a file that is not a tariff workbook outright', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('x').addRow(['Ürün Adı', 'PSF']);
    const fileBase64 = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
    const result = await parseCommissionTariffFile({ fileBase64, fileName: 'x.xlsx' }, NOV_2_2026);
    expect(result.ok).toBe(false);
  });
});
