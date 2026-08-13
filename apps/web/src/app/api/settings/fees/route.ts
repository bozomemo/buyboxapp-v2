/** Settings > Fees (doc 06 §9): current effective row + full effective-dated history for one marketplace. */
import { NextResponse } from 'next/server';
import { configRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

/** Kuruş → an editable decimal major-units string ("1100" → "11.00") — the form input's own format, not locale-formatted. */
function kurusToDecimalString(kurus: string): string {
  const value = BigInt(kurus);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

function toBandsPayload(
  json: string,
  edgeField: 'maxPrice' | 'minPrice',
): { edge: string; amount: string }[] {
  const bands = JSON.parse(json) as { maxPrice?: string | null; minPrice?: string; amount: string }[];
  return bands.map((b) => ({
    edge:
      edgeField === 'maxPrice'
        ? b.maxPrice
          ? kurusToDecimalString(b.maxPrice)
          : ''
        : kurusToDecimalString(b.minPrice ?? '0'),
    amount: kurusToDecimalString(b.amount),
  }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const marketplaceCode = url.searchParams.get('marketplaceCode');
  if (!marketplaceCode) return NextResponse.json({ error: 'marketplaceCode gerekli.' }, { status: 400 });
  const appDb = getAppDb();
  const nowMs = Date.now();

  const [current, history] = await Promise.all([
    configRepo.getEffectiveFeeSettings(appDb, marketplaceCode, nowMs),
    configRepo.listFeeSettingsHistory(appDb, marketplaceCode),
  ]);

  return NextResponse.json({
    current: current
      ? {
          commissionVatRate: String(current.commissionVatRate),
          commissionRateIncludesVat: current.commissionRateIncludesVat,
          commissionVatDeductible: current.commissionVatDeductible,
          commissionBase: current.commissionBase,
          defaultCommissionRate: String(current.defaultCommissionRate),
          cargoBands: toBandsPayload(current.cargoBands, 'maxPrice'),
          cargoAmountsIncludeVat: current.cargoAmountsIncludeVat,
          cargoVatRate: String(current.cargoVatRate),
          cargoVatDeductible: current.cargoVatDeductible,
          expenditureBands: toBandsPayload(current.expenditureBands, 'minPrice'),
          expenditureIncludesVat: current.expenditureIncludesVat,
          expenditureVatRate: String(current.expenditureVatRate),
          expenditureVatDeductible: current.expenditureVatDeductible,
        }
      : null,
    history: history.map((h) => ({
      id: h.id,
      effectiveFrom: h.effectiveFrom,
      defaultCommissionRate: h.defaultCommissionRate,
    })),
  });
}
