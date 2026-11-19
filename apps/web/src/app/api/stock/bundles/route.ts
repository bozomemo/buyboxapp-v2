/**
 * Bundle editor (doc 06 §3): "add and remove members with quantity. No five-member cap" —
 * the legacy app's limit, deliberately not carried over.
 */
import { NextResponse } from 'next/server';
import { parseStockCode } from '@buybox/core';
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

  // The cost engine finds a bundle by the listing's own stock code, and only a code with the
  // bundle marker is looked up there (doc 01 §2, §6). The editor used to save new bundles under
  // `Date.now()`, which no listing carries (2026-11-19), so the code is checked here.
  const code = typeof body.bundleStockCode === 'string' ? body.bundleStockCode.trim() : '';
  const parsed = parseStockCode(code);
  if (code === '' || !parsed.ok || !parsed.value.isBundle) {
    return refuse('Paket stok kodu, ilandaki stok koduyla aynı ve "-k" içeren bir kod olmalı (ör. 12345-k2).');
  }
  if (!Array.isArray(body.members) || body.members.length === 0) {
    return refuse('Pakete en az bir üye ekleyin.');
  }
  const members: { memberStockCode: string; quantity: number }[] = [];
  for (const member of body.members) {
    const memberStockCode = typeof member?.memberStockCode === 'string' ? member.memberStockCode.trim() : '';
    if (memberStockCode === '') return refuse('Her üyenin stok kodu dolu olmalı.');
    if (!Number.isInteger(member.quantity) || member.quantity < 1) {
      return refuse(`${memberStockCode} için miktar 1 ya da daha büyük bir tam sayı olmalı.`);
    }
    members.push({ memberStockCode, quantity: member.quantity });
  }

  const appDb = getAppDb();
  await stockRepo.replaceBundle(appDb, code, typeof body.name === 'string' ? body.name : '', members, Date.now());
  return NextResponse.json({ ok: true });
}

function refuse(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export const GET = withPermission('view', getHandler);
export const POST = withPermission('prices.manage', postHandler);
