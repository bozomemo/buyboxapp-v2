/** Settings > Retention (doc 06 §9, doc 05 §10) — per-table windows, operator-editable, audited via `setAppSetting`. */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { DEFAULT_RETENTION_WINDOWS, type RetentionWindows } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

const SETTING_KEY = 'retention.windows';

export async function GET() {
  const appDb = getAppDb();
  const setting = await configRepo.getAppSetting(appDb, SETTING_KEY);
  // Merged over the defaults rather than used as-is: a setting stored before a window was
  // added carries no key for it, and passing `undefined` through to `pruneHistory` turns that
  // window's cutoff into `NaN`. Spreading the defaults first means a new window arrives at its
  // documented value instead of disabling itself on every install that already had this row.
  const windows: RetentionWindows = setting
    ? { ...DEFAULT_RETENTION_WINDOWS, ...(JSON.parse(setting.value) as Partial<RetentionWindows>) }
    : DEFAULT_RETENTION_WINDOWS;
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
