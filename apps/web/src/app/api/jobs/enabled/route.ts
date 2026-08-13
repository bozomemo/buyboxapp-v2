/** Per-job enable/disable (doc 06 §7, doc 12 6.9 DoD) — audited like every other setting. */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { JOB_CATALOG, jobEnabledSettingKey } from '@buybox/jobs';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as { jobName: string; enabled: boolean };
  if (!JOB_CATALOG.some((j) => j.jobName === body.jobName)) {
    return NextResponse.json({ error: `Bilinmeyen iş: ${body.jobName}` }, { status: 400 });
  }
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
