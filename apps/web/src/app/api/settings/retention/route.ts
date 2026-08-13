/** Settings > Retention (doc 06 §9, doc 05 §10) — per-table windows, operator-editable, audited via `setAppSetting`. */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { DEFAULT_RETENTION_WINDOWS, type RetentionWindows } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

const SETTING_KEY = 'retention.windows';

export async function GET() {
  const appDb = getAppDb();
  const setting = await configRepo.getAppSetting(appDb, SETTING_KEY);
  const windows: RetentionWindows = setting ? JSON.parse(setting.value) : DEFAULT_RETENTION_WINDOWS;
  return NextResponse.json({ windows, isDefault: !setting });
}

export async function POST(request: Request) {
  const body = (await request.json()) as RetentionWindows;
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    { key: SETTING_KEY, value: JSON.stringify(body), updatedBy: 'operator', updatedAt: Date.now() },
    newId(),
  );
  return NextResponse.json({ ok: true });
}
