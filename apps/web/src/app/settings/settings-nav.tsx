import { getCachedModules } from '@/lib/server/modules';
import { SettingsTabs } from './settings-tabs';

/**
 * The settings tab bar with the module answer already in hand. `getCachedModules` is the proxy's
 * own cache, so this agrees with what the proxy will let through, and it falls back to
 * everything enabled when the database cannot be read — a missing tab is worse than one that
 * redirects.
 */
export async function SettingsNav() {
  const modules = await getCachedModules();
  return <SettingsTabs sellerEnabled={modules.seller} />;
}
