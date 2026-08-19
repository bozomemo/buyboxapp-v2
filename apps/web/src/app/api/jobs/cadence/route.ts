/**
 * Operator-configurable job cadence (doc 07 §8, doc 08 §12, R-JOB-2). GET returns each
 * cadence-eligible job's effective interval (a stored override if present, else `JOB_CATALOG`'s
 * compiled default); POST stores an override, audited like every other setting; DELETE clears it
 * back to the default. Takes effect on the worker's next restart (`apps/worker/src/index.ts`
 * reads `getJobCadenceMs` once at boot) — the same startup-time-read semantics the scrape rate
 * limit and marketplace credentials already use.
 */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import {
  getJobCadenceMs,
  JOB_CATALOG,
  jobCadenceSettingKey,
  jobDefaultCadenceMs,
  MIN_JOB_CADENCE_MS,
} from '@buybox/jobs';
import { getAppDb } from '@/lib/server/db';

/** Jobs with no cadence at all (`ImportBundles`) are not cadence-eligible — no source port exists yet (doc 07 §1.1). */
const CADENCE_ELIGIBLE = JOB_CATALOG.filter((entry) => entry.cadenceMs !== null);

export async function GET() {
  const appDb = getAppDb();
  const jobs = await Promise.all(
    CADENCE_ELIGIBLE.map(async (entry) => {
      const cadenceMs = await getJobCadenceMs(appDb, entry.jobName);
      const setting = await configRepo.getAppSetting(appDb, jobCadenceSettingKey(entry.jobName));
      return {
        jobName: entry.jobName,
        label: entry.label,
        cadenceMs,
        isOverride: setting !== undefined,
        defaultCadenceMs: entry.cadenceMs,
      };
    }),
  );
  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { jobName: string; cadenceMs: number };
  const entry = CADENCE_ELIGIBLE.find((e) => e.jobName === body.jobName);
  if (!entry) {
    return NextResponse.json({ error: `Sıklık ayarlanamayan iş: ${body.jobName}` }, { status: 400 });
  }
  if (!Number.isFinite(body.cadenceMs) || body.cadenceMs < MIN_JOB_CADENCE_MS) {
    return NextResponse.json(
      { error: `Sıklık en az ${MIN_JOB_CADENCE_MS / 1000} saniye olmalı.` },
      { status: 400 },
    );
  }
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    {
      key: jobCadenceSettingKey(entry.jobName),
      value: JSON.stringify(body.cadenceMs),
      updatedBy: 'operator',
      updatedAt: Date.now(),
    },
    newId(),
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const jobName = new URL(request.url).searchParams.get('jobName');
  const entry = jobName ? CADENCE_ELIGIBLE.find((e) => e.jobName === jobName) : undefined;
  if (!entry) {
    return NextResponse.json({ error: `Sıklık ayarlanamayan iş: ${jobName}` }, { status: 400 });
  }
  const appDb = getAppDb();
  await configRepo.deleteAppSetting(appDb, jobCadenceSettingKey(entry.jobName), 'operator', Date.now(), newId());
  return NextResponse.json({ ok: true, cadenceMs: jobDefaultCadenceMs(entry.jobName) });
}
