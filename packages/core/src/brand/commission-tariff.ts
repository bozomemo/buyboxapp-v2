/**
 * Rules for reading a marketplace commission tariff workbook (Trendyol _Komisyon Tarifeleri_,
 * doc 17 §8.2) — pure: the caller reads the file and hands over cell text.
 *
 * One workbook row is one product. It states four price limits and, per tariff period, four
 * commission rates:
 *
 *     price ≥ 1.Fiyat Alt Limit                            → 1.KOMİSYON
 *     2.Fiyat Alt Limit ≤ price ≤ 2.Fiyat Üst Limiti      → 2.KOMİSYON
 *     3.Fiyat Alt Limit ≤ price ≤ 3.Fiyat Üst Limiti      → 3.KOMİSYON
 *     price ≤ 4.Fiyat Üst Limiti                           → 4.KOMİSYON
 *
 * (Measured on the product owner's sample, 2026-11-02: for all 22 rows these bands, applied to
 * _KOMİSYONA ESAS FİYAT_, reproduce the workbook's own _GÜNCEL KOMİSYON_.)
 *
 * A period is stated as text, e.g. `1 Kasım 08.00-5 Kasım 07.59`, **without a year**. The year is
 * inferred as the one that puts the period's start nearest the import time, and the import
 * preview shows the inferred dates so the operator confirms them. The times are Türkiye time
 * (UTC+3, no daylight saving since 2016); the end minute is inclusive, so the period ends one
 * minute after it.
 */
import type { CommissionTier } from './seller-profit.js';

const TURKISH_MONTHS: Readonly<Record<string, number>> = {
  ocak: 0,
  subat: 1,
  mart: 2,
  nisan: 3,
  mayis: 4,
  haziran: 5,
  temmuz: 6,
  agustos: 7,
  eylul: 8,
  ekim: 9,
  kasim: 10,
  aralik: 11,
};

const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;

/** `Kasım` → `kasim`: case and Turkish diacritics folded, so either spelling is read. */
function foldMonth(word: string): string {
  return word
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

export interface TariffPeriod {
  /** Inclusive, epoch ms. */
  readonly validFrom: number;
  /** Exclusive, epoch ms. */
  readonly validUntil: number;
}

const PERIOD_PATTERN =
  /^\s*(\d{1,2})\s+(\p{L}+)\s+(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})\s+(\p{L}+)\s+(\d{1,2})[.:](\d{2})\s*$/u;

function turkeyTime(year: number, month: number, day: number, hour: number, minute: number): number {
  return Date.UTC(year, month, day, hour, minute) - TURKEY_OFFSET_MS;
}

/**
 * `1 Kasım 08.00-5 Kasım 07.59` → the period, or `null` when the text is not in that form or
 * names a date that does not exist. A period that ends in January after starting in December is
 * read as crossing the year.
 */
export function parseTariffPeriod(text: string, nowMs: number): TariffPeriod | null {
  const match = PERIOD_PATTERN.exec(text);
  if (!match) return null;
  const [, d1, m1, h1, min1, d2, m2, h2, min2] = match;
  const startMonth = TURKISH_MONTHS[foldMonth(m1!)];
  const endMonth = TURKISH_MONTHS[foldMonth(m2!)];
  if (startMonth === undefined || endMonth === undefined) return null;

  const nowYear = new Date(nowMs + TURKEY_OFFSET_MS).getUTCFullYear();
  let best: TariffPeriod | null = null;
  for (const year of [nowYear - 1, nowYear, nowYear + 1]) {
    const endYear = endMonth < startMonth ? year + 1 : year;
    const parts = [
      [year, startMonth, Number(d1), Number(h1), Number(min1)],
      [endYear, endMonth, Number(d2), Number(h2), Number(min2)],
    ] as const;
    // `continue`, not `return`: 29 Şubat exists in some of the candidate years and not others.
    if (parts.some(([y, m, d, h, mi]) => !isRealDate(y, m, d) || h > 23 || mi > 59)) continue;
    const validFrom = turkeyTime(...parts[0]);
    const validUntil = turkeyTime(...parts[1]) + MINUTE_MS;
    if (validUntil <= validFrom) continue;
    if (best === null || Math.abs(validFrom - nowMs) < Math.abs(best.validFrom - nowMs)) {
      best = { validFrom, validUntil };
    }
  }
  return best;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCMonth() === month && date.getUTCDate() === day;
}

/**
 * The key a tariff row and a brand product are matched on: trimmed, upper-cased, and — for an
 * all-digit code — stripped of leading zeros, because Excel drops them from a barcode typed as a
 * number (`64992280543` for `064992280543`). `null` for an empty cell.
 */
export function tariffProductKey(code: string | null | undefined): string | null {
  const trimmed = (code ?? '').trim().toUpperCase();
  if (trimmed === '') return null;
  if (/^\d+$/.test(trimmed)) return trimmed.replace(/^0+(?=\d)/, '');
  return trimmed;
}

/** The four limits of one row, kuruş. */
export interface TariffLimits {
  readonly tier1Min: bigint;
  readonly tier2Max: bigint;
  readonly tier2Min: bigint;
  readonly tier3Max: bigint;
  readonly tier3Min: bigint;
  readonly tier4Max: bigint;
}

export type TariffRowProblem = 'limitsOutOfOrder' | 'rateOutOfRange';

/**
 * The tiers of one period, highest price band first, or the reason the row is refused. Limits
 * must descend (a tier's lower limit above the next tier's upper one) and rates must be 0–100; a
 * row that breaks either is refused rather than half-applied.
 */
export function buildCommissionTiers(
  limits: TariffLimits,
  rates: readonly [number, number, number, number],
):
  | { readonly ok: true; readonly tiers: CommissionTier[] }
  | { readonly ok: false; readonly problem: TariffRowProblem } {
  const ordered =
    limits.tier1Min > limits.tier2Max &&
    limits.tier2Max >= limits.tier2Min &&
    limits.tier2Min > limits.tier3Max &&
    limits.tier3Max >= limits.tier3Min &&
    limits.tier3Min > limits.tier4Max;
  if (!ordered) return { ok: false, problem: 'limitsOutOfOrder' };
  if (rates.some((rate) => !Number.isFinite(rate) || rate < 0 || rate > 100)) {
    return { ok: false, problem: 'rateOutOfRange' };
  }
  return {
    ok: true,
    tiers: [
      { minPrice: limits.tier1Min, maxPrice: null, rate: rates[0] },
      { minPrice: limits.tier2Min, maxPrice: limits.tier2Max, rate: rates[1] },
      { minPrice: limits.tier3Min, maxPrice: limits.tier3Max, rate: rates[2] },
      { minPrice: null, maxPrice: limits.tier4Max, rate: rates[3] },
    ],
  };
}
