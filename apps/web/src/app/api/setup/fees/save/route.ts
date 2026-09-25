import { NextResponse } from 'next/server';
import { configRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { feesPayloadToRow } from '../to-row';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';

export async function POST(request: Request) {
  const body = await readJsonBody<{ marketplaceCode: string }>(request);
  if (body === null) return invalidBody();
  const appDb = getAppDb();
  // Fee settings are never updated in place (doc 05 §2) — the wizard's save is a fresh insert
  // effective now, same as every later fee change from Settings.
  const row = feesPayloadToRow(body, body.marketplaceCode, Date.now());
  await configRepo.insertFeeSettings(appDb, row);
  return NextResponse.json({ ok: true });
}
