/** Reads the product source the setup wizard (doc 12 6.2) persisted, for the Stock screen's "import from the configured source" action. */
import { NextResponse } from 'next/server';
import { configRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function GET() {
  const appDb = getAppDb();
  const setting = await configRepo.getAppSetting(appDb, 'productSource.config');
  if (!setting) return NextResponse.json({ configured: false });
  return NextResponse.json({ configured: true, ...(JSON.parse(setting.value) as object) });
}
