import { NextResponse } from 'next/server';
import { floorPrice } from '@buybox/core';
import { mapFeeSettings } from '@buybox/jobs';
import { Money } from '@buybox/shared';
import { formatMoneyValue } from '@/lib/format';
import { feesPayloadToRow } from '../to-row';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission } from '@/lib/server/auth/guard';

async function postHandler(request: Request) {
  const body = await readJsonBody<{ fees: unknown; sampleCost: string }>(request);
  if (body === null) return invalidBody();
  try {
    const row = feesPayloadToRow(body.fees, 'preview', Date.now());
    const fees = mapFeeSettings(row);
    const result = floorPrice({
      unitCost: Money.fromMajorUnitsString(body.sampleCost),
      commissionRate: row.defaultCommissionRate,
      campaign: null,
      fees,
    });
    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        error: 'Bu komisyon oranıyla hiçbir fiyatta kâr mümkün değil.',
      });
    }
    return NextResponse.json({ ok: true, floorPrice: formatMoneyValue(result.value) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export const POST = withPermission('settings.manage', postHandler, { allowSetupAccess: true });
