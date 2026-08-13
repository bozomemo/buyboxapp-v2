/**
 * Bundle editor (doc 06 §3): "add and remove members with quantity. No five-member cap" —
 * the legacy app's limit, deliberately not carried over.
 */
import { NextResponse } from 'next/server';
import { stockRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function GET() {
  const appDb = getAppDb();
  const bundles = await stockRepo.listBundles(appDb);
  return NextResponse.json({ bundles });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    bundleStockCode: string;
    name: string;
    members: { memberStockCode: string; quantity: number }[];
  };
  const appDb = getAppDb();
  await stockRepo.replaceBundle(appDb, body.bundleStockCode, body.name, body.members, Date.now());
  return NextResponse.json({ ok: true });
}
