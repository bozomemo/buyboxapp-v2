/**
 * The system's stop controls (doc 06 §2, R-UI-9). **Three genuinely separate states, each with
 * its own setting row — revised 2026-08-14 after they were found conflated under one control:**
 *
 * 1. **System pause** (`SYSTEM_PAUSE_SETTING_KEY`) — the actual "stop everything" switch.
 *    While engaged, `Scheduler.tick()` enqueues nothing new and claims/runs nothing: no
 *    `ImportListings`, no `ObserveBuybox`, no `Reprice`, no `ScrapeCompetitors`, no
 *    `SubmitPriceChanges` — the whole system is frozen, not just price submission.
 * 2. **Global price-submission switch** (`GLOBAL_KILL_SWITCH_SETTING_KEY`) — narrower than the
 *    above. While engaged, every *other* job still runs normally (imports, buybox observation,
 *    decision-making) but `SubmitPriceChanges` never calls a marketplace adapter, on any
 *    marketplace. This is what lets the system observe and compute decisions without ever
 *    submitting one.
 * 3. **Per-marketplace price-submission switch** (`marketplaceKillSwitchSettingKey`) — narrower
 *    still: stops submission for one marketplace only, leaving the other unaffected.
 *
 * Engaging (1) also has the side effect of stopping submissions, because nothing runs at all —
 * but engaging (2) does **not** engage (1), and disengaging (2) does **not** touch (1) or
 * resume anything else. Toggling one must never read or write another's row; that coupling is
 * exactly the bug this module was rewritten to remove.
 *
 * **All three are fail-closed.** `isKillSwitchEngaged` treats anything except the literal
 * stored value `"false"` as engaged — an absent row (fresh install, never configured), a
 * corrupted value, `"true"`, or anything else all mean "stopped". A missing settings table, a
 * bug that clears a row, or code that reads a setting before it was ever written must all fail
 * toward "nothing happens", never the other way.
 *
 * The per-marketplace switch is the one deliberate exception: it stays fail-*open* (default:
 * not engaged) precisely because (1) and (2) above already default to fail-closed — a
 * marketplace is not individually stopped unless an operator explicitly engaged it.
 */

export const SYSTEM_PAUSE_SETTING_KEY = 'global.systemPause';

export const GLOBAL_KILL_SWITCH_SETTING_KEY = 'global.killSwitch';

export function marketplaceKillSwitchSettingKey(marketplaceCode: string): string {
  return `marketplace.${marketplaceCode}.killSwitch`;
}

/**
 * The fail-closed rule shared by (1) and (2): engaged unless the stored value is the literal
 * string `"false"`. `undefined` (no row), `"true"`, `""`, or any other value are all engaged.
 * Kept as one function so both settings' semantics can never silently drift apart from one
 * another — but each is still read from, and written to, its own key.
 */
export function isKillSwitchEngaged(storedValue: string | undefined): boolean {
  return storedValue !== 'false';
}

/**
 * Fail-open, by contrast with the two switches above (see the module doc for why): a
 * marketplace is not individually stopped unless an operator explicitly engaged it.
 */
export function isMarketplaceKillSwitchEngaged(storedValue: string | undefined): boolean {
  return storedValue === 'true';
}
