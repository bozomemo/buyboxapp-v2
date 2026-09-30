import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
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
      updatedBy: auth.actor,
      updatedAt: Date.now(),
    },
    newId(),
  );
  return NextResponse.json({ ok: true });
}

export const POST = withPermission('settings.manage', postHandler, { allowSetupAccess: true });
