/**
 * The web process's view of which modules are enabled (doc 17 §1), cached for the proxy the same
 * way `license.ts` caches the licence: gating every request must not cost a database round-trip
 * per request. Strictly best-effort — a cache that never hits is one read per request, never a
 * wrong answer for longer than `MODULES_CACHE_TTL_MS`.
 */
import { readEnabledModules } from '@buybox/jobs';
import { ALL_MODULES_ENABLED, type EnabledModules } from '@buybox/shared';
import { getAppDb, isBootstrapped } from './db';

/**
 * Short, because the operator who just switched a module off is looking at the screen and
 * expects its menu gone on the next click. `invalidateModulesCache` makes it immediate in this
 * process; the TTL bounds it where the proxy runs apart from the route that wrote it.
 */
export const MODULES_CACHE_TTL_MS = 5_000;

declare global {
  var __buyboxEnabledModules: { modules: EnabledModules; atMs: number } | undefined;
}

export function invalidateModulesCache(): void {
  globalThis.__buyboxEnabledModules = undefined;
}

/**
 * Before the setup wizard's database step there is nothing to read, and the wizard itself must
 * be reachable — so everything is enabled. A database that cannot be read answers the same:
 * this gate narrows an install, and refusing every page because of a read error would take the
 * settings screen that could fix it down too.
 */
export async function readModules(): Promise<EnabledModules> {
  if (!isBootstrapped()) return ALL_MODULES_ENABLED;
  try {
    return await readEnabledModules(getAppDb());
  } catch {
    return ALL_MODULES_ENABLED;
  }
}

export async function getCachedModules(): Promise<EnabledModules> {
  const cached = globalThis.__buyboxEnabledModules;
  const nowMs = Date.now();
  if (cached && nowMs - cached.atMs < MODULES_CACHE_TTL_MS) return cached.modules;
  const modules = await readModules();
  globalThis.__buyboxEnabledModules = { modules, atMs: nowMs };
  return modules;
}
