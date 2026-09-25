import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';

export async function POST(request: Request) {
  const body = await readJsonBody<{ displayName: string }>(request);
  if (body === null) return invalidBody();
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
