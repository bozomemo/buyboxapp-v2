import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const body = await readJsonBody<{ sourceCode: string; sourceConfig: unknown }>(request);
  if (body === null) return invalidBody();
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    {
      key: 'productSource.config',
      value: JSON.stringify(body),
      updatedBy: auth.actor,
      updatedAt: Date.now(),
    },
    newId(),
  );
  return NextResponse.json({ ok: true });
}

export const POST = withPermission('settings.manage', postHandler, { allowSetupAccess: true });
