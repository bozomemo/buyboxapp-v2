import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as { displayName: string };
  if (!body.displayName?.trim()) {
    return NextResponse.json({ error: 'Görünen ad boş olamaz.' }, { status: 400 });
  }
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    {
      key: 'store.displayName',
      value: body.displayName.trim(),
      updatedBy: 'setup-wizard',
      updatedAt: Date.now(),
    },
    newId(),
  );
  return NextResponse.json({ ok: true });
}
