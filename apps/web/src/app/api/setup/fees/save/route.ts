import { NextResponse } from 'next/server';
import { configRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { FeesPayloadError, feesPayloadToRow } from '../to-row';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission } from '@/lib/server/auth/guard';

async function postHandler(request: Request) {
  const body = await readJsonBody<{ marketplaceCode: string }>(request);
  if (body === null) return invalidBody();
  const appDb = getAppDb();
  // Fee settings are never updated in place (doc 05 §2) — the wizard's save is a fresh insert
  // effective now, same as every later fee change from Settings.
  let row;
  try {
    row = feesPayloadToRow(body, body.marketplaceCode, Date.now());
  } catch (error) {
    if (error instanceof FeesPayloadError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  await configRepo.insertFeeSettings(appDb, row);
  return NextResponse.json({ ok: true });
}

export const POST = withPermission('settings.manage', postHandler, { allowSetupAccess: true });
