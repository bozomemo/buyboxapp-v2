/**
 * The reseller profit estimate's settings (doc 17 §8.1): the marketplace's fixed per-sale fee and
 * the desi table — desi range → cargo cost and estimated operating cost.
 *
 * Stored as one `app_settings` row, so a change is audited by `setAppSetting` like every other
 * setting. Amounts are kept as kuruş strings (`bigint` never crosses JSON as a number). An install
 * that has never saved them has **no** settings, and the estimate says so instead of using a
 * default: a cargo table nobody entered would print a profit nobody can stand behind.
 */
import type { SellerProfitSettings } from '@buybox/core';
import { configRepo, newId, type AppDatabase } from '@buybox/db';
import { parseDesi } from '../desi';
import { parseTurkishDecimal } from '../reference-price-import';

export const SELLER_PROFIT_SETTING_KEY = 'brand.sellerProfit';

/** Trendyol's fixed per-sale fee when this was written (product owner, 2026-11-02). */
export const DEFAULT_FIXED_SALE_FEE_KURUS = 1250n;

interface StoredSettings {
  readonly fixedSaleFee: string;
  readonly desiBands: readonly {
    readonly maxDesi: number | null;
    readonly cargo: string;
    readonly operation: string;
  }[];
}

export async function readSellerProfitSettings(appDb: AppDatabase): Promise<SellerProfitSettings | null> {
  const row = await configRepo.getAppSetting(appDb, SELLER_PROFIT_SETTING_KEY);
  if (!row) return null;
  try {
    const stored = JSON.parse(row.value) as StoredSettings;
    return {
      fixedSaleFee: BigInt(stored.fixedSaleFee),
      desiBands: stored.desiBands.map((band) => ({
        maxDesi: band.maxDesi,
        cargo: BigInt(band.cargo),
        operation: BigInt(band.operation),
      })),
    };
  } catch {
    // A row this version cannot read is reported as "no settings", never as zeros.
    return null;
  }
}

export interface SellerProfitSettingsBody {
  readonly fixedSaleFee?: string;
  readonly desiBands?: readonly {
    readonly maxDesi?: string;
    readonly cargo?: string;
    readonly operation?: string;
  }[];
}

function amount(raw: string | undefined): bigint | null {
  const text = (raw ?? '').trim();
  if (text === '') return null;
  return parseTurkishDecimal(text);
}

/**
 * The form's body → what is stored, or the message to answer a refusal with.
 *
 * Desi limits must rise from row to row, and only the **last** row may leave its limit empty (the
 * catch-all): with a catch-all in the middle, every row after it would be unreachable and nothing
 * on the screen would say so.
 */
export function parseSellerProfitSettings(body: SellerProfitSettingsBody): StoredSettings | string {
  const fee = amount(body.fixedSaleFee);
  if (fee === null) return 'Sabit satış bedeli okunamadı. Örnek: 12,50';

  const bands = body.desiBands ?? [];
  if (bands.length === 0) return 'Desi tablosunda en az bir satır olmalı.';

  const stored: { maxDesi: number | null; cargo: string; operation: string }[] = [];
  let previous = 0;
  for (const [index, band] of bands.entries()) {
    const line = index + 1;
    const maxDesi = parseDesi(band.maxDesi);
    if (maxDesi === 'invalid') return `${line}. satır: desi üst sınırı okunamadı (ör. 5 ya da 4,5).`;
    if (maxDesi === null && index !== bands.length - 1) {
      return `${line}. satır: yalnızca son satırın üst sınırı boş bırakılabilir — boş sınır "üstü hepsi" demektir.`;
    }
    if (maxDesi !== null && maxDesi <= previous) {
      return `${line}. satır: desi üst sınırları satırdan satıra artmalı.`;
    }
    if (maxDesi !== null) previous = maxDesi;
    const cargo = amount(band.cargo);
    if (cargo === null) return `${line}. satır: kargo tutarı okunamadı (ör. 85,00).`;
    const operation = amount(band.operation);
    if (operation === null) return `${line}. satır: operasyon maliyeti okunamadı (ör. 25,00).`;
    stored.push({ maxDesi, cargo: cargo.toString(), operation: operation.toString() });
  }
  return { fixedSaleFee: fee.toString(), desiBands: stored };
}

export async function saveSellerProfitSettings(
  appDb: AppDatabase,
  settings: StoredSettings,
  actor: string,
  nowMs: number,
): Promise<void> {
  await configRepo.setAppSetting(
    appDb,
    { key: SELLER_PROFIT_SETTING_KEY, value: JSON.stringify(settings), updatedBy: actor, updatedAt: nowMs },
    newId(),
  );
}
