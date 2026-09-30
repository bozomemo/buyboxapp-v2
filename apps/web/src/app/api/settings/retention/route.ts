/** Settings > Retention (doc 06 §9, doc 05 §10) — per-table windows, operator-editable, audited via `setAppSetting`. */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { DEFAULT_RETENTION_WINDOWS, type RetentionWindows } from '@buybox/db';
import { RetentionWindowsSchema } from '@buybox/jobs';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';

const SETTING_KEY = 'retention.windows';

async function getHandler(request: Request, _context: unknown, auth: AuthContext) {
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

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const raw = await readJsonBody<RetentionWindows>(request);
  if (raw === null) return invalidBody();
  // Checked with the schema the nightly `PruneHistory` job parses this setting with (2026-09-27).
  // It used to be stored as sent, and a body the job could not parse stopped every retention
  // window from being enforced, silently, from that night on.
  const parsed = RetentionWindowsSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: `Saklama süreleri hatalı: ${issue?.path.join('.') || 'gövde'} — her süre 1 veya daha büyük bir tam sayı olmalı.` },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    { key: SETTING_KEY, value: JSON.stringify(body), updatedBy: auth.actor, updatedAt: Date.now() },
    newId(),
  );
  return NextResponse.json({ ok: true });
}

export const GET = withPermission('view', getHandler);
export const POST = withPermission('settings.manage', postHandler);
