import { NextResponse } from 'next/server';
import { stockRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { withPermission } from '@/lib/server/auth/guard';

async function getHandler(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const appDb = getAppDb();
  const members = await stockRepo.getBundleMembers(appDb, code);
  return NextResponse.json({ members });
}

export const GET = withPermission('view', getHandler);
