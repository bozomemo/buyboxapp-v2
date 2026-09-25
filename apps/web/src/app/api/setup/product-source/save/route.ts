import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';

export async function POST(request: Request) {
  const body = await readJsonBody<{ sourceCode: string; sourceConfig: unknown }>(request);
  if (body === null) return invalidBody();
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
