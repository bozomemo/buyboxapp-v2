/**
 * Bundle editor (doc 06 §3): "add and remove members with quantity. No five-member cap" —
 * the legacy app's limit, deliberately not carried over.
 */
import { NextResponse } from 'next/server';
import { stockRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission } from '@/lib/server/auth/guard';

async function getHandler() {
  const appDb = getAppDb();
  const bundles = await stockRepo.listBundles(appDb);
  return NextResponse.json({ bundles });
}

async function postHandler(request: Request) {
  const body = await readJsonBody<{
    bundleStockCode: string;
    name: string;
    members: { memberStockCode: string; quantity: number }[];
  }>(request);
  if (body === null) return invalidBody();
  const appDb = getAppDb();
  await stockRepo.replaceBundle(appDb, body.bundleStockCode, body.name, body.members, Date.now());
  return NextResponse.json({ ok: true });
}

export const GET = withPermission('view', getHandler);
export const POST = withPermission('prices.manage', postHandler);
