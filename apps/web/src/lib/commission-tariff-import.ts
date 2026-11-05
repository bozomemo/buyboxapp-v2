/**
 * Reading the marketplace's commission tariff workbook (Trendyol _Komisyon Tarifeleri_, doc 17
 * §8.2) into tariff rows. The rules — what a period means, how limits become tiers, how a product
 * is keyed — are `packages/core` `commission-tariff.ts`; this module finds the cells.
 *
 * Columns are found by their folded header, as the brand import does, with one twist: the
 * workbook repeats `1.KOMİSYON` … `4.KOMİSYON` once per tariff period, so those four are found by
 * **position** — the four columns right after each `Tarih aralığı (…)` column — rather than by
 * name, which would only ever find the first period's.
 *
 * Amounts go through `parseTurkishDecimal` (exact kuruş, never a float); rates are percentages,
 * not money, and are read as numbers.
 */
import {
  buildCommissionTiers,
  parseTariffPeriod,
  tariffProductKey,
  type CommissionTier,
  type TariffRowProblem,
} from '@buybox/core';
import { foldHeader } from './csv-parse';
import { readBrandImportTable, type BrandImportFile } from './brand-product-import';
import { parseTurkishDecimal } from './reference-price-import';

const LIMIT_HEADERS = {
  tier1Min: '1.fiyat alt limit',
  tier2Max: '2.fiyat ust limiti',
  tier2Min: '2.fiyat alt limit',
  tier3Max: '3.fiyat ust limiti',
  tier3Min: '3.fiyat alt limit',
  tier4Max: '4.fiyat ust limiti',
} as const;

const BARCODE_HEADERS = ['barkod', 'barcode'];
const STOCK_CODE_HEADERS = ['satici stok kodu', 'stok kodu'];

export interface PlannedTariff {
  readonly line: number;
  readonly productKey: string;
  readonly barcode: string | null;
  readonly sellerStockCode: string | null;
  readonly validFrom: number;
  readonly validUntil: number;
  readonly tiers: readonly CommissionTier[];
}

export interface TariffProblem {
  readonly line: number;
  readonly message: string;
}

export type TariffFileParse =
  | {
      readonly ok: true;
      readonly tariffs: readonly PlannedTariff[];
      /** Workbook rows that produced at least one tariff. */
      readonly products: number;
      readonly problems: readonly TariffProblem[];
      readonly periods: readonly { readonly validFrom: number; readonly validUntil: number }[];
    }
  | { readonly ok: false; readonly error: string };

const ROW_PROBLEMS: Record<TariffRowProblem, string> = {
  limitsOutOfOrder:
    'Fiyat limitleri sıralı değil — her kademenin alt limiti bir sonrakinin üst limitinin üstünde olmalı.',
  rateOutOfRange: 'Komisyon oranı 0 ile 100 arasında olmalı.',
};

/** `16.5`, `16,5`, `%16,5` → 16.5; empty → `null`; anything else → `NaN`. */
function rate(text: string): number | null {
  const trimmed = text.trim().replace(/^%/, '').trim();
  if (trimmed === '') return null;
  return /^\d+([.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : Number.NaN;
}

export async function parseCommissionTariffFile(
  file: BrandImportFile,
  nowMs: number,
): Promise<TariffFileParse> {
  const table = await readBrandImportTable(file);
  if ('error' in table) return { ok: false, error: table.error };

  const headers = table.headers.map(foldHeader);
  const find = (names: readonly string[]) => headers.findIndex((header) => names.includes(header));
  const limits = Object.fromEntries(
    Object.entries(LIMIT_HEADERS).map(([key, name]) => [key, headers.indexOf(name)]),
  ) as Record<keyof typeof LIMIT_HEADERS, number>;
  const barcodeColumn = find(BARCODE_HEADERS);
  const stockCodeColumn = find(STOCK_CODE_HEADERS);

  const missing = Object.entries(limits).filter(([, index]) => index === -1);
  if (missing.length > 0 || (barcodeColumn === -1 && stockCodeColumn === -1)) {
    return {
      ok: false,
      error:
        `Başlık satırında (${table.headerLine}. satır) komisyon tarifesi sütunları bulunamadı. ` +
        'Beklenen: BARKOD, SATICI STOK KODU, 1.Fiyat Alt Limit … 4.Fiyat Üst Limiti, Tarih aralığı ve 1.–4. KOMİSYON. ' +
        'Pazaryerinin Komisyon Tarifeleri ekranından indirilen dosyayı değiştirmeden yükleyin.',
    };
  }

  // Each `Tarih aralığı (…)` column followed by exactly `1.komisyon` … `4.komisyon`.
  const blocks: { periodColumn: number; rateColumns: [number, number, number, number] }[] = [];
  headers.forEach((header, index) => {
    if (!header.startsWith('tarih araligi')) return;
    const next = [1, 2, 3, 4].map((n) => index + n);
    if (next.every((column, i) => headers[column] === `${i + 1}.komisyon`)) {
      blocks.push({ periodColumn: index, rateColumns: next as [number, number, number, number] });
    }
  });
  if (blocks.length === 0) {
    return {
      ok: false,
      error: 'Dosyada "Tarih aralığı" ve ardından 1.–4. KOMİSYON sütunları bulunamadı.',
    };
  }

  const tariffs: PlannedTariff[] = [];
  const problems: TariffProblem[] = [];
  const seen = new Map<string, number>();
  const periods = new Map<number, number>();
  let products = 0;

  for (const row of table.rows) {
    const cell = (index: number) => (index === -1 ? '' : (row.fields[index] ?? '').toString().trim());
    const barcode = cell(barcodeColumn) || null;
    const sellerStockCode = cell(stockCodeColumn) || null;
    const keys = [...new Set([tariffProductKey(barcode), tariffProductKey(sellerStockCode)])].filter(
      (key): key is string => key !== null,
    );
    if (keys.length === 0) {
      problems.push({ line: row.line, message: 'Barkod ve satıcı stok kodu boş.' });
      continue;
    }

    // `parseTurkishDecimal` reads three digits after the only separator as a thousands group
    // (`1.249` = 1 249 ₺). A tariff limit is always to the kuruş, so `1078.485` can only be a
    // mistake — refuse it rather than read it as 1 078 485 ₺.
    const limitAmount = (text: string) => (/^\d+[.,]\d{3}$/.test(text) ? null : parseTurkishDecimal(text));
    const parsedLimits = Object.fromEntries(
      Object.entries(limits).map(([key, index]) => [key, limitAmount(cell(index))]),
    ) as Record<keyof typeof LIMIT_HEADERS, bigint | null>;
    if (Object.values(parsedLimits).some((value) => value === null)) {
      problems.push({ line: row.line, message: 'Fiyat limitlerinden biri boş ya da okunamadı.' });
      continue;
    }

    let produced = false;
    for (const block of blocks) {
      const periodText = cell(block.periodColumn);
      const rates = block.rateColumns.map((column) => rate(cell(column)));
      // A period this workbook does not use for this row — both cells empty — is not a problem.
      if (periodText === '' && rates.every((value) => value === null)) continue;

      const period = parseTariffPeriod(periodText, nowMs);
      if (!period) {
        problems.push({
          line: row.line,
          message: `Tarih aralığı okunamadı: "${periodText}". Örnek: 1 Kasım 08.00-5 Kasım 07.59`,
        });
        continue;
      }
      if (rates.some((value) => value === null || Number.isNaN(value))) {
        problems.push({ line: row.line, message: 'Komisyon oranlarından biri boş ya da okunamadı.' });
        continue;
      }
      const built = buildCommissionTiers(
        parsedLimits as Record<keyof typeof LIMIT_HEADERS, bigint>,
        rates as [number, number, number, number],
      );
      if (!built.ok) {
        problems.push({ line: row.line, message: ROW_PROBLEMS[built.problem] });
        continue;
      }

      for (const productKey of keys) {
        // The same product twice for one period cannot be settled by taking either row.
        const id = `${productKey}::${period.validFrom}`;
        const earlier = seen.get(id);
        if (earlier !== undefined) {
          problems.push({ line: row.line, message: `Bu ürün bu dönem için ${earlier}. satırda da var.` });
          continue;
        }
        seen.set(id, row.line);
        tariffs.push({ line: row.line, productKey, barcode, sellerStockCode, ...period, tiers: built.tiers });
        produced = true;
      }
      periods.set(period.validFrom, period.validUntil);
    }
    if (produced) products += 1;
  }

  return {
    ok: true,
    tariffs,
    products,
    problems,
    periods: [...periods.entries()]
      .sort(([a], [b]) => a - b)
      .map(([validFrom, validUntil]) => ({ validFrom, validUntil })),
  };
}
