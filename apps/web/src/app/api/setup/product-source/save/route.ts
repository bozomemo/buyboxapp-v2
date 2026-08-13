import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as { sourceCode: string; sourceConfig: unknown };
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    {
      key: 'productSource.config',
      value: JSON.stringify(body),
      updatedBy: 'setup-wizard',
      updatedAt: Date.now(),
    },
    newId(),
  );
  return NextResponse.json({ ok: true });
}
