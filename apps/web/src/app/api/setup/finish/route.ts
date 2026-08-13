import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function POST() {
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    { key: 'setup.completed', value: 'true', updatedBy: 'setup-wizard', updatedAt: Date.now() },
    newId(),
  );
  return NextResponse.json({ ok: true });
}
