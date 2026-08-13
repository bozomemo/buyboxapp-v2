/**
 * Settings > Fees save (doc 06 §9) — a fresh, effective-dated row (doc 05 §2: fee settings
 * are never updated in place), audited. Reuses the setup wizard's `feesPayloadToRow` so both
 * places build the exact same row shape from the same form payload.
 */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { feesPayloadToRow } from '@/app/api/setup/fees/to-row';

export async function POST(request: Request) {
  const body = (await request.json()) as { marketplaceCode: string };
  if (!body.marketplaceCode) {
    return NextResponse.json({ error: 'marketplaceCode gerekli.' }, { status: 400 });
  }
  const appDb = getAppDb();
  const nowMs = Date.now();
  const previous = await configRepo.getEffectiveFeeSettings(appDb, body.marketplaceCode, nowMs);

  const row = feesPayloadToRow(body, body.marketplaceCode, nowMs);
  await configRepo.insertFeeSettings(appDb, row);

  await configRepo.recordSettingsAudit(appDb, {
    id: newId(),
    entity: 'fee_settings',
    entityId: body.marketplaceCode,
    field: 'all',
    oldValue: previous ? JSON.stringify(previous) : null,
    newValue: JSON.stringify(row),
    changedBy: 'operator',
    changedAt: nowMs,
  });

  return NextResponse.json({ ok: true });
}
