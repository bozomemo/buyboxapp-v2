/**
 * Global kill switch (doc 06 §2, R-UI-9) — checked by `SubmitPriceChanges` on every drain, so
 * flipping it stops submissions within one poll interval without needing a worker restart.
 */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

const SETTING_KEY = 'global.killSwitch';

export async function GET() {
  const appDb = getAppDb();
  const setting = await configRepo.getAppSetting(appDb, SETTING_KEY);
  return NextResponse.json({ engaged: setting?.value === 'true' });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { engaged: boolean };
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    { key: SETTING_KEY, value: String(body.engaged), updatedBy: 'operator', updatedAt: Date.now() },
    newId(),
  );
  return NextResponse.json({ engaged: body.engaged });
}
