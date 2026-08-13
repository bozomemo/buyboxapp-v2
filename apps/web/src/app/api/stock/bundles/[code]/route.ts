import { NextResponse } from 'next/server';
import { stockRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const appDb = getAppDb();
  const members = await stockRepo.getBundleMembers(appDb, code);
  return NextResponse.json({ members });
}
