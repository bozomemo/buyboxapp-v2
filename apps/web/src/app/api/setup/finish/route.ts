import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { isKillSwitchEngaged, SYSTEM_PAUSE_SETTING_KEY } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';

export async function POST() {
  const appDb = getAppDb();
  const now = Date.now();

  await configRepo.setAppSetting(
    appDb,
    { key: 'setup.completed', value: 'true', updatedBy: 'setup-wizard', updatedAt: now },
    newId(),
  );

  // The system pause is fail-closed (`isKillSwitchEngaged`): a missing or unreadable value means
  // paused, which is right for a running system whose setting was lost — stopping is the safe
  // failure for something that submits prices. But a fresh install has no row at all, so every
  // new installation was born paused with nothing on any screen explaining why, and the operator
  // was left to find a hidden switch. Twice on a real install (2026-08-24) that looked exactly
  // like a broken scheduler.
  //
  // Completing setup is the operator deliberately declaring the system configured, so record the
  // pause state explicitly here rather than leaving it to a default. Only when no row exists:
  // re-running the wizard must never resume a system somebody paused on purpose.
  const pause = await configRepo.getAppSetting(appDb, SYSTEM_PAUSE_SETTING_KEY);
  if (pause === undefined) {
    await configRepo.setAppSetting(
      appDb,
      { key: SYSTEM_PAUSE_SETTING_KEY, value: 'false', updatedBy: 'setup-wizard', updatedAt: now },
      newId(),
    );
  }

  return NextResponse.json({ ok: true, systemPaused: isKillSwitchEngaged(pause?.value ?? 'false') });
}
