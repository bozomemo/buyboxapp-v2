/** Reads the product source the setup wizard (doc 12 6.2) persisted, for the Stock screen's "import from the configured source" action. */
import { NextResponse } from 'next/server';
import { configRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { withPermission } from '@/lib/server/auth/guard';

async function getHandler() {
  const appDb = getAppDb();
  const setting = await configRepo.getAppSetting(appDb, 'productSource.config');
  if (!setting) return NextResponse.json({ configured: false });
  return NextResponse.json({ configured: true, ...(JSON.parse(setting.value) as object) });
}

export const GET = withPermission('view', getHandler);
