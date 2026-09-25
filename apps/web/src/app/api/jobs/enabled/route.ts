/** Per-job enable/disable (doc 06 §7, doc 12 6.9 DoD) — audited like every other setting. */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { JOB_CATALOG, jobEnabledSettingKey } from '@buybox/jobs';
import { getAppDb } from '@/lib/server/db';
import { readJsonObject } from '@/lib/server/request-body';

export async function POST(request: Request) {
  const raw = await readJsonObject(request);
  if (raw === null) return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 });
  if (!JOB_CATALOG.some((j) => j.jobName === raw.jobName)) {
    return NextResponse.json({ error: `Bilinmeyen iş: ${String(raw.jobName)}` }, { status: 400 });
  }
  // Refused rather than stored: `String(undefined)` used to land in `app_settings` and read back
  // as the job's default — which is *on* for the price jobs (see `isJobEnabled`).
  if (typeof raw.enabled !== 'boolean') {
    return NextResponse.json({ error: '`enabled` true ya da false olmalı.' }, { status: 400 });
  }
  const body = { jobName: raw.jobName as string, enabled: raw.enabled };
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    {
      key: jobEnabledSettingKey(body.jobName),
      value: String(body.enabled),
      updatedBy: 'operator',
      updatedAt: Date.now(),
    },
    newId(),
  );
  return NextResponse.json({ ok: true, enabled: body.enabled });
}
