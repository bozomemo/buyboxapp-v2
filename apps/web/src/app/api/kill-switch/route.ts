/**
 * The global **price-submission** switch (doc 06 §2, R-UI-9) — checked by `SubmitPriceChanges`
 * on every drain, so flipping it stops submissions within one poll interval without needing a
 * worker restart.
 *
 * ⚠️ **Narrower than it sounds, and deliberately so.** This does *not* stop the rest of the
 * system — imports, buybox observation and decision-making keep running while this is engaged.
 * The actual "stop everything" control is `/api/system-pause`, a genuinely separate setting
 * checked by `Scheduler.tick()` itself. The two were conflated under one control until
 * 2026-08-14 (an operator engaging what they read as "stop everything" was, without knowing it,
 * only stopping submissions — and disengaging it silently re-armed submission while everything
 * else kept running the whole time). They must never read or write each other's setting again.
 *
 * Fail-closed (`@buybox/shared`, the single source of truth for this semantics): GET reports
 * `engaged: true` whenever the stored value is anything but the literal `"false"`, including
 * when no row has ever been written. A fresh install therefore reports itself as stopped, not
 * as "unconfigured, assume running".
 */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { GLOBAL_KILL_SWITCH_SETTING_KEY, isKillSwitchEngaged } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';

export async function GET() {
  const appDb = getAppDb();
  const setting = await configRepo.getAppSetting(appDb, GLOBAL_KILL_SWITCH_SETTING_KEY);
  return NextResponse.json({ engaged: isKillSwitchEngaged(setting?.value) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { engaged: boolean };
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    {
      key: GLOBAL_KILL_SWITCH_SETTING_KEY,
      value: String(body.engaged),
      updatedBy: 'operator',
      updatedAt: Date.now(),
    },
    newId(),
  );
  return NextResponse.json({ engaged: body.engaged });
}
