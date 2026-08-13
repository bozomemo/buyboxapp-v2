import { NextResponse } from 'next/server';
import { floorPrice, effectiveCommissionRate } from '@buybox/core';
import { mapFeeSettings } from '@buybox/jobs';
import { Money } from '@buybox/shared';
import { formatMoneyValue } from '@/lib/format';
import { feesPayloadToRow } from '../to-row';

export async function POST(request: Request) {
  const body = (await request.json()) as { fees: unknown; sampleCost: string; sampleVatRate: number };
  try {
    const row = feesPayloadToRow(body.fees, 'preview', Date.now());
    const fees = mapFeeSettings(row);
    const commissionRate = effectiveCommissionRate(row.defaultCommissionRate, fees);
    const result = floorPrice({
      unitCost: Money.fromMajorUnitsString(body.sampleCost),
      vatRate: body.sampleVatRate,
      effectiveCommissionRate: commissionRate,
      campaign: null,
      fees,
    });
    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        error: 'Bu maliyet ve KDV oranıyla hiçbir fiyatta kâr mümkün değil.',
      });
    }
    return NextResponse.json({ ok: true, floorPrice: formatMoneyValue(result.value) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
