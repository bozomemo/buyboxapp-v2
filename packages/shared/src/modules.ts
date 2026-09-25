/**
 * The two product modules an install can enable (doc 17 §1): the **seller** module — our own
 * listings, the cost model and repricing — and the **brand** module, for a brand's product
 * manager who sells nothing through this app. Shared here because three places read the same
 * two settings and must agree on what they mean: the scheduler (which jobs may run), the web
 * proxy (which routes answer) and the navigation (which groups are drawn).
 *
 * **Absent means enabled.** Every install that predates the modules has neither row, and doc 17
 * §1.3 requires an upgrade to remove nothing from anybody's screen. That makes this fail-*open*,
 * unlike the kill switches beside it (`kill-switch.ts`), and deliberately so: those switches
 * guard an action, while a module switch only narrows what an install has already been doing.
 * The seller module's money path keeps its own fail-closed price switch whatever this says.
 */

export type AppModule = 'seller' | 'brand';

export const APP_MODULES: readonly AppModule[] = ['seller', 'brand'];

export const MODULE_SETTING_KEYS: Readonly<Record<AppModule, string>> = {
  seller: 'modules.seller',
  brand: 'modules.brand',
};

export const MODULE_LABELS: Readonly<Record<AppModule, string>> = {
  seller: 'Pazaryeri satıcısı',
  brand: 'Marka ürün yöneticisi',
};

export type EnabledModules = Readonly<Record<AppModule, boolean>>;

export const ALL_MODULES_ENABLED: EnabledModules = { seller: true, brand: true };

/**
 * Reads the two stored values. Only the literal `"false"` disables a module.
 *
 * Both disabled is not a state an install can be in — the settings route refuses to write it —
 * so if it is ever read (a hand-edited row, a half-applied write) it is treated as corrupt and
 * answered with both enabled. The alternative, an application with no navigation and no jobs,
 * could not even be used to repair itself.
 */
export function parseEnabledModules(
  sellerValue: string | undefined,
  brandValue: string | undefined,
): EnabledModules {
  const seller = sellerValue !== 'false';
  const brand = brandValue !== 'false';
  if (!seller && !brand) return ALL_MODULES_ENABLED;
  return { seller, brand };
}
