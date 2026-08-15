/**
 * The system pause (doc 06 §2) — the actual "stop everything" control, genuinely separate from
 * `/api/kill-switch` (the narrower price-submission-only switch; see that route's doc comment
 * and `packages/jobs/src/scheduler.ts`'s `isSystemPaused` for why they must never share a
 * setting). While engaged, `Scheduler.tick()` enqueues and claims nothing at all — no imports,
 * no buybox observation, no decision-making, no submissions.
 *
 * Fail-closed (`@buybox/shared`): GET reports `engaged: true` whenever the stored value is
 * anything but the literal `"false"`, including when no row has ever been written. A fresh
 * install therefore reports itself as paused, not as "unconfigured, assume running".
 */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { isKillSwitchEngaged, SYSTEM_PAUSE_SETTING_KEY } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';

export async function GET() {
  const appDb = getAppDb();
  const setting = await configRepo.getAppSetting(appDb, SYSTEM_PAUSE_SETTING_KEY);
  return NextResponse.json({ engaged: isKillSwitchEngaged(setting?.value) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { engaged: boolean };
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    {
      key: SYSTEM_PAUSE_SETTING_KEY,
      value: String(body.engaged),
      updatedBy: 'operator',
      updatedAt: Date.now(),
    },
    newId(),
  );
  return NextResponse.json({ engaged: body.engaged });
}
