/**
 * Which modules this install runs (doc 17 §1): read by the navigation, the dashboard and the
 * modules settings screen, written only from that screen and the setup wizard.
 *
 * Not itself module-gated (`module-routes.ts` maps it to no module): it is how a disabled module
 * is switched back on.
 */
import { NextResponse } from 'next/server';
import { configRepo, newId, repricingRepo } from '@buybox/db';
import { readEnabledModules } from '@buybox/jobs';
import {
  ALL_MODULES_ENABLED,
  GLOBAL_KILL_SWITCH_SETTING_KEY,
  isKillSwitchEngaged,
  MODULE_SETTING_KEYS,
} from '@buybox/shared';
import { getAppDb, isBootstrapped } from '@/lib/server/db';
import { invalidateModulesCache } from '@/lib/server/modules';

async function state() {
  const appDb = getAppDb();
  const [modules, awaitingConfirmation, priceSwitch] = await Promise.all([
    readEnabledModules(appDb),
    repricingRepo.countAwaitingConfirmation(appDb),
    configRepo.getAppSetting(appDb, GLOBAL_KILL_SWITCH_SETTING_KEY),
  ]);
  return {
    modules,
    /** Submissions the marketplace has not confirmed yet — `ConfirmSubmissions` keeps draining them. */
    awaitingConfirmation,
    priceSwitchEngaged: isKillSwitchEngaged(priceSwitch?.value),
  };
}

export async function GET() {
  // The navigation asks on every page, the setup wizard's included, and before the wizard's
  // database step there is no database to ask. Nothing has been chosen yet, so nothing is off.
  if (!isBootstrapped()) {
    return NextResponse.json({
      modules: ALL_MODULES_ENABLED,
      awaitingConfirmation: 0,
      priceSwitchEngaged: true,
    });
  }
  return NextResponse.json(await state());
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 });
  }
  const { seller, brand } = (body ?? {}) as { seller?: unknown; brand?: unknown };
  if (typeof seller !== 'boolean' || typeof brand !== 'boolean') {
    return NextResponse.json({ error: '`seller` ve `brand` true/false olmalı.' }, { status: 400 });
  }
  if (!seller && !brand) {
    return NextResponse.json({ error: 'En az bir modül açık kalmalı.' }, { status: 400 });
  }

  const appDb = getAppDb();
  const nowMs = Date.now();
  const before = await readEnabledModules(appDb);

  /**
   * Turning the seller module off engages the price-submission switch as well (doc 17 §1.3).
   *
   * Queued submissions are deliberately **not** cancelled: a cancelled row would leave the
   * repricing state of its listing pointing at a submission that will never resolve. They stay
   * queued, exactly as they do behind the price switch today — and because the switch is now
   * engaged, switching the module back on does not quietly resume submitting days-old decisions.
   * The operator releases the switch on the dashboard, deliberately, as they would after any stop.
   */
  if (before.seller && !seller) {
    await configRepo.setAppSetting(
      appDb,
      { key: GLOBAL_KILL_SWITCH_SETTING_KEY, value: 'true', updatedBy: 'modules', updatedAt: nowMs },
      newId(),
    );
  }

  for (const [module, enabled] of [
    ['seller', seller],
    ['brand', brand],
  ] as const) {
    if (before[module] === enabled) continue;
    await configRepo.setAppSetting(
      appDb,
      { key: MODULE_SETTING_KEYS[module], value: String(enabled), updatedBy: 'operator', updatedAt: nowMs },
      newId(),
    );
  }
  invalidateModulesCache();
  return NextResponse.json(await state());
}
